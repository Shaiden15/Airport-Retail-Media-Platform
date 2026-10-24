import { EventEmitter } from 'node:events';
import type { Advertiser, Campaign, Creative, Outlet, Screen, Segment } from '@dwellcast/shared';
import type { AirportConfig } from '../airportConfig.ts';
import type { Database } from '../db/database.ts';
import { platformEvidence, type EvidenceRef } from '../presence/evidence.ts';
import type { Crowd, PresenceEngine } from '../presence/PresenceEngine.ts';
import { PROFILE_MODEL_VERSION } from '../profiles/crowdProfile.ts';
import type { AirportState } from '../state/AirportState.ts';
import type { AgentProposal, DecisionAgent } from './agent.ts';
import { evaluateTriggers, hardFilter, triggerBoost, type FilterReason, type FiredTrigger } from './eligibility.ts';
import type { Ledger } from './ledger.ts';
import type { Learner } from './learner.ts';
import { score, unitHash, type ScoreBreakdown, type ScoreInputs } from './scorer.ts';
import { SCORING_VERSION, type EngineSettings } from './settings.ts';
import { validateProposal, type ValidationResult } from './validator.ts';

export const SLOT_MS = 15_000;

export type DecisionSource = 'agent-verified' | 'rule-based' | 'delay-goodwill' | 'airline-priority' | 'manual-pin' | 'house-default';

export interface CandidateResult {
  campaignId: string;
  name: string;
  advertiser: string;
  category: string;
  status: 'winner' | 'eligible' | 'filtered' | 'excluded';
  reason: FilterReason | 'competitor-separation' | 'frequency-cap' | null;
  triggers: FiredTrigger[];
  breakdown: ScoreBreakdown | null;
}

export interface Decision {
  id: string;
  screenId: string;
  slot: number;
  simTime: string;
  crowd: Omit<Crowd, 'evidence'>;
  candidates: CandidateResult[];
  winner: { campaignId: string; creativeId: string; name: string; advertiser: string; score: number } | null;
  source: DecisionSource;
  winningRule: string;
  agent: { proposal: AgentProposal | null; validation: ValidationResult | null };
  evidence: EvidenceRef[];
  impressions: number;
  modelVersion: string;
  scoringVersion: string;
  computeMs: number;
}

export interface EngineDeps {
  state: AirportState;
  presence: PresenceEngine;
  airport: AirportConfig;
  campaigns: Campaign[];
  creatives: Creative[];
  outlets: Outlet[];
  advertisers: Advertiser[];
  learner: Learner;
  ledger: Ledger;
  agent: DecisionAgent;
  settings: EngineSettings;
  db: Database | null;
}

const LOG_LIMIT = 50_000;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export class DecisionEngine extends EventEmitter {
  private readonly latestByScreen = new Map<string, Decision>();
  private readonly log: Decision[] = [];
  private readonly pins = new Map<string, { campaignId: string; reason: string; until: number }>();
  private readonly creatives: Map<string, Creative>;
  private readonly outlets: Map<string, Outlet>;
  private readonly advertisers: Map<string, Advertiser>;
  private pendingChanges: Decision[] = [];
  private sequence = 0;
  private lastSlot = -1;
  settings: EngineSettings;

  constructor(private readonly deps: EngineDeps) {
    super();
    this.settings = deps.settings;
    this.creatives = new Map(deps.creatives.map((c) => [c.id, c]));
    this.outlets = new Map(deps.outlets.map((o) => [o.id, o]));
    this.advertisers = new Map(deps.advertisers.map((a) => [a.id, a]));
  }

  get campaigns(): Campaign[] {
    return this.deps.campaigns;
  }

  private loggedInputs(campaign: Campaign, crowd: Crowd, fired: FiredTrigger[], simMs: number): ScoreInputs {
    return {
      weights: campaign.targeting.segmentWeights,
      shares: crowd.segments,
      boost: triggerBoost(fired),
      learnLift: this.deps.learner.lift(campaign.id, campaign.targeting.segmentWeights, crowd.segments, this.settings.learnLiftRange),
      pacing: this.pacing(campaign, simMs),
    };
  }

  // Under-spending campaigns get a small lift, over-spending ones are slowed, against an even spend across their daily hours
  private pacing(campaign: Campaign, simMs: number): number {
    const { from, to } = campaign.schedule.dailyHours;
    const hours = Math.max(1, to - from);
    const now = new Date(simMs);
    const elapsed = Math.min(1, Math.max(0, (now.getUTCHours() + now.getUTCMinutes() / 60 - from) / hours));
    const actual = campaign.budget.dailyCap > 0 ? this.deps.ledger.spentToday(campaign.id) / campaign.budget.dailyCap : 1;
    return Math.min(1.2, Math.max(0.6, 1 + 0.5 * (elapsed - actual)));
  }

  pin(screenId: string, campaignId: string, reason: string, untilMs: number): void {
    this.pins.set(screenId, { campaignId, reason, until: untilMs });
  }

  unpin(screenId: string): void {
    this.pins.delete(screenId);
  }

  decide(screen: Screen, simMs: number, slot: number, opts: { record: boolean } = { record: true }): Decision {
    const started = performance.now();
    const crowd = this.deps.presence.screen(screen, simMs);
    const festival = this.deps.airport.festivalDates.includes(new Date(simMs).toISOString().slice(0, 10));
    const ctxBase = { screen, crowd, simMs, festival, creatives: this.creatives, outlets: this.outlets, gateChangedAt: this.deps.state.gateChangedAt };
    const last = this.deps.ledger.last(screen.id);
    const cap = (c: Campaign) => Math.min(c.budget.frequencyCapPerScreenHour, this.settings.globalFrequencyCapPerScreenHour);

    const candidates: CandidateResult[] = [];
    const inputs = new Map<string, ScoreInputs>();
    const filterReasons = new Map<string, FilterReason | null>();
    for (const campaign of this.deps.campaigns) {
      const ctx = { ...ctxBase, spentToday: this.deps.ledger.spentToday(campaign.id) };
      const advertiser = this.advertisers.get(campaign.advertiserId);
      const fired = evaluateTriggers(campaign, ctx, advertiser?.airlineCode ?? null);
      const reason = hardFilter(campaign, fired, ctx);
      filterReasons.set(campaign.id, reason);
      const base = { campaignId: campaign.id, name: campaign.name, advertiser: advertiser?.name ?? campaign.advertiserId, category: campaign.category, triggers: fired };
      if (reason) {
        candidates.push({ ...base, status: 'filtered', reason, breakdown: null });
        continue;
      }
      const logged = this.loggedInputs(campaign, crowd, fired, simMs);
      inputs.set(campaign.id, logged);
      const breakdown = score(logged);
      const separated = this.settings.competitorSeparation && last && last.category === campaign.category && last.advertiserId !== campaign.advertiserId;
      const capped = this.deps.ledger.playsThisHour(screen.id, campaign.id, simMs) >= cap(campaign);
      candidates.push({ ...base, status: separated || capped ? 'excluded' : 'eligible', reason: separated ? 'competitor-separation' : capped ? 'frequency-cap' : null, breakdown });
    }

    const eligible = candidates.filter((c) => c.status === 'eligible').sort((a, b) => (b.breakdown?.score ?? 0) - (a.breakdown?.score ?? 0) || a.campaignId.localeCompare(b.campaignId));
    const campaignById = new Map(this.deps.campaigns.map((c) => [c.id, c]));
    const evidence = new Map<string, EvidenceRef>(crowd.evidence.map((e) => [e.id, e]));
    const screenRef = platformEvidence('screen', screen.id, new Date(simMs).toISOString());
    evidence.set(screenRef.id, screenRef);
    const evidenceFor = (campaignId: string) => {
      const c = campaignById.get(campaignId);
      const campaignRef = platformEvidence('campaign', campaignId, c?.createdAt ?? new Date(simMs).toISOString());
      evidence.set(campaignRef.id, campaignRef);
      const fired = candidates.find((x) => x.campaignId === campaignId)?.triggers ?? [];
      const triggerRefs = fired.flatMap((t) => crowd.flights.filter((f) => f.flightId === t.flightId).map((f) => f.evidenceId));
      return [...new Set([campaignRef.id, screenRef.id, ...triggerRefs, ...crowd.flights.slice(0, 3).map((f) => f.evidenceId)])];
    };

    let winnerId: string | null = null;
    let source: DecisionSource = 'house-default';
    let rule = 'No eligible campaign: airport information is shown';
    let proposal: AgentProposal | null = null;
    let validation: ValidationResult | null = null;

    const pin = this.pins.get(screen.id);
    if (pin && pin.until > simMs && campaignById.has(pin.campaignId)) {
      winnerId = pin.campaignId;
      source = 'manual-pin';
      rule = `Pinned by Media Manager: ${pin.reason}`;
    }

    // Delay goodwill is pushed, not auctioned: a fired required delay trigger takes over screens beside that flight's gate
    if (!winnerId) {
      const nearGates = new Set(screen.nearestGates.filter((g) => g.distanceM <= 120).map((g) => g.gate));
      const goodwill = eligible.find((c) =>
        c.triggers.some((t) => t.kind === 'delay' && t.mode === 'required' && crowd.flights.some((f) => f.flightId === t.flightId && f.gate !== null && nearGates.has(f.gate))),
      );
      if (goodwill) {
        const trigger = goodwill.triggers.find((t) => t.kind === 'delay' && t.mode === 'required');
        winnerId = goodwill.campaignId;
        source = 'delay-goodwill';
        rule = `Delay goodwill: ${trigger?.detail ?? 'delayed flight'} passed the threshold, voucher pushed to its gate screens`;
      }
    }

    if (!winnerId && this.settings.airlinePriority) {
      const priority = eligible.find((c) => {
        const airline = this.advertisers.get(campaignById.get(c.campaignId)?.advertiserId ?? '')?.airlineCode;
        return airline && crowd.flights.some((f) => f.label.startsWith(airline) && f.share >= 0.2 && f.minutesToBoarding <= 15 && f.minutesToBoarding >= -25);
      });
      if (priority) {
        const airline = this.advertisers.get(campaignById.get(priority.campaignId)?.advertiserId ?? '')?.airlineCode ?? '';
        const flight = crowd.flights.find((f) => f.label.startsWith(airline));
        winnerId = priority.campaignId;
        source = 'airline-priority';
        rule = `Airline priority: ${priority.advertiser} owns its boarding window for ${flight?.label ?? 'its flight'}`;
      }
    }

    if (!winnerId && eligible.length) {
      const ranked = eligible.map((c) => ({ campaignId: c.campaignId, score: c.breakdown?.score ?? 0, evidenceIds: evidenceFor(c.campaignId) }));
      proposal = this.deps.agent.propose({ screenId: screen.id, simTime: new Date(simMs).toISOString(), ranked, evidence: [...evidence.values()] });
      const top = eligible.at(0);
      if (proposal) {
        validation = validateProposal({
          proposal,
          state: this.deps.state,
          known: evidence,
          simMs,
          settings: this.settings,
          filterReason: filterReasons.has(proposal.campaignId) ? filterReasons.get(proposal.campaignId) : undefined,
          loggedInputs: inputs.get(proposal.campaignId),
        });
      }
      const chosen = proposal && validation?.accepted ? eligible.find((c) => c.campaignId === proposal?.campaignId) : top;
      winnerId = chosen?.campaignId ?? null;
      source = proposal && validation?.accepted ? 'agent-verified' : 'rule-based';
      const b = chosen?.breakdown;
      const boosts = chosen?.triggers.filter((t) => t.boost > 1) ?? [];
      rule = b ? `Best audience match ${pct(b.match)}${boosts.length ? ` x ${b.boost} boost (${boosts.map((t) => t.detail).join(', ')})` : ''}, score ${b.score.toFixed(2)}` : rule;
      if (validation && !validation.accepted) rule = `AI proposal rejected (${validation.checks.filter((c) => !c.passed).map((c) => c.name).join(', ')}); rule-based fallback: ${rule}`;

      const runnerUp = eligible.at(1);
      if (runnerUp && unitHash(`${screen.id}|${slot}`) < this.settings.explorationPct) {
        winnerId = runnerUp.campaignId;
        source = 'rule-based';
        rule = `Exploration slot: testing runner-up (score ${(runnerUp.breakdown?.score ?? 0).toFixed(2)}) on ${pct(this.settings.explorationPct)} of plays`;
      }
    }

    const winnerCampaign = winnerId ? campaignById.get(winnerId) : undefined;
    for (const c of candidates) if (c.campaignId === winnerId) c.status = 'winner';
    const creativeId = winnerCampaign?.creativeIds.find((id) => this.creatives.get(id)?.approval === 'approved') ?? winnerCampaign?.creativeIds.at(0) ?? '';
    const impressions = winnerCampaign ? Math.round(crowd.pax * this.settings.attentionFactor) : 0;
    const { evidence: _drop, ...crowdSummary } = crowd;

    const decision: Decision = {
      id: `dec-${slot}-${screen.id}-${++this.sequence}`,
      screenId: screen.id,
      slot,
      simTime: new Date(simMs).toISOString(),
      crowd: crowdSummary,
      candidates: candidates.sort((a, b) => (b.breakdown?.score ?? -1) - (a.breakdown?.score ?? -1)),
      winner: winnerCampaign
        ? { campaignId: winnerCampaign.id, creativeId, name: winnerCampaign.name, advertiser: this.advertisers.get(winnerCampaign.advertiserId)?.name ?? '', score: candidates.find((c) => c.campaignId === winnerId)?.breakdown?.score ?? 0 }
        : null,
      source,
      winningRule: rule,
      agent: { proposal, validation },
      evidence: [...evidence.values()],
      impressions,
      modelVersion: PROFILE_MODEL_VERSION,
      scoringVersion: SCORING_VERSION,
      computeMs: Math.round((performance.now() - started) * 100) / 100,
    };

    if (opts.record) this.record(decision, winnerCampaign, simMs);
    return decision;
  }

  private record(decision: Decision, campaign: Campaign | undefined, simMs: number): void {
    const previous = this.latestByScreen.get(decision.screenId);
    this.latestByScreen.set(decision.screenId, decision);
    this.log.push(decision);
    if (this.log.length > LOG_LIMIT) this.log.splice(0, this.log.length - LOG_LIMIT);
    if (campaign) {
      this.deps.ledger.record(campaign, decision.screenId, simMs, decision.impressions);
      this.observeExposure(campaign, decision);
      this.emit('play', decision);
    }
    if (previous?.winner?.campaignId !== decision.winner?.campaignId) {
      this.pendingChanges.push(decision);
      this.emit('decision', decision);
    }
  }

  // Runs every online screen once per 15-second slot; returns how many decisions were made
  runSlot(simMs: number): number {
    const slot = Math.floor(simMs / SLOT_MS);
    if (slot === this.lastSlot) return 0;
    this.lastSlot = slot;
    let made = 0;
    for (const screen of this.deps.state.screens.values()) {
      if (screen.status === 'offline') continue;
      this.decide(screen, slot * SLOT_MS, slot);
      made++;
    }
    return made;
  }

  // Immediate re-plan for screens near something that just changed, without waiting for the next slot
  replan(screenIds: Iterable<string>, simMs: number): Decision[] {
    const slot = Math.floor(simMs / SLOT_MS);
    const out: Decision[] = [];
    for (const id of screenIds) {
      const screen = this.deps.state.screens.get(id);
      if (!screen || screen.status === 'offline') continue;
      out.push(this.decide(screen, simMs, slot));
    }
    return out;
  }

  screensNearGates(gates: Iterable<string | null>): string[] {
    const wanted = new Set([...gates].filter((g): g is string => Boolean(g)));
    if (!wanted.size) return [];
    return [...this.deps.state.screens.values()].filter((s) => s.nearestGates.some((g) => wanted.has(g.gate))).map((s) => s.id);
  }

  latest(screenId: string): Decision | null {
    return this.latestByScreen.get(screenId) ?? null;
  }

  latestAll(): Decision[] {
    return [...this.latestByScreen.values()];
  }

  search(filter: { screenId?: string; campaignId?: string; source?: DecisionSource; text?: string; limit?: number }): Decision[] {
    const limit = Math.min(500, filter.limit ?? 100);
    const text = filter.text?.toLowerCase();
    const out: Decision[] = [];
    for (let i = this.log.length - 1; i >= 0 && out.length < limit; i--) {
      const d = this.log.at(i);
      if (!d) continue;
      if (filter.screenId && d.screenId !== filter.screenId) continue;
      if (filter.campaignId && d.winner?.campaignId !== filter.campaignId) continue;
      if (filter.source && d.source !== filter.source) continue;
      if (text && !`${d.winner?.name ?? ''} ${d.winningRule} ${d.screenId}`.toLowerCase().includes(text)) continue;
      out.push(d);
    }
    return out;
  }

  // Every play is exposure for the segments in front of the screen, so learned rates stay calibrated
  private observeExposure(campaign: Campaign, decision: Decision): void {
    const shares = new Map(Object.entries(decision.crowd.segments));
    for (const segment of Object.keys(campaign.targeting.segmentWeights) as Segment[]) {
      const exposures = decision.impressions * (shares.get(segment) ?? 0);
      if (exposures >= 1) this.deps.learner.observe(campaign.id, segment, 0, exposures);
    }
  }

  resetLearning(): void {
    this.deps.learner.reset();
  }

  conversionRate(campaignId: string): number {
    return this.deps.learner.baselineRate(campaignId);
  }

  // Real phone claims credit the dominant segment; simulated ones are spread by crowd share, matching how exposures are counted
  recordRedemption(campaignId: string, screenId: string, segment: Segment | null, simulated: boolean): void {
    const campaign = this.deps.campaigns.find((c) => c.id === campaignId);
    const crowd = this.latest(screenId)?.crowd;
    if (!simulated || !campaign || !crowd) {
      if (segment) this.deps.learner.observe(campaignId, segment, 1, 0);
      return;
    }
    const shares = new Map(Object.entries(crowd.segments));
    const weighted = (Object.keys(campaign.targeting.segmentWeights) as Segment[]).map((s) => [s, shares.get(s) ?? 0] as const);
    const total = weighted.reduce((sum, [, v]) => sum + v, 0);
    if (total <= 0) return;
    for (const [s, v] of weighted) if (v > 0) this.deps.learner.observe(campaignId, s, v / total, 0);
  }

  // A time jump starts a fresh moment: forget per-screen rotation state and force the next slot to run
  onJump(): void {
    this.deps.ledger.forgetScreens();
    this.latestByScreen.clear();
    this.lastSlot = -1;
  }

  flush(): number {
    const written = this.deps.ledger.flush();
    const db = this.deps.db;
    if (!db || !this.pendingChanges.length) {
      this.pendingChanges = [];
      return written;
    }
    const insert = db.prepare('INSERT OR IGNORE INTO decisions (id, screen_id, sim_time, campaign_id, winning_rule, score, source, summary, model_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN');
    try {
      for (const d of this.pendingChanges) {
        const summary = { pax: d.crowd.pax, internationalShare: d.crowd.internationalShare, top: d.candidates.slice(0, 3).map((c) => ({ id: c.campaignId, score: c.breakdown?.score ?? null, status: c.status, reason: c.reason })), agent: d.agent.validation?.accepted ?? null };
        insert.run(d.id, d.screenId, d.simTime, d.winner?.campaignId ?? null, d.winningRule, d.winner?.score ?? 0, d.source, JSON.stringify(summary), d.modelVersion);
      }
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    const n = this.pendingChanges.length;
    this.pendingChanges = [];
    return written + n;
  }
}

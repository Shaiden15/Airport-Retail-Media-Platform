import { existsSync } from 'node:fs';
import type { Campaign, Flight, Screen } from '@dwellcast/shared';
import { createFlightSource, createZoneSource } from '../adapters/registry.ts';
import { ClaimService, type RedemptionEvent } from '../claims/ClaimService.ts';
import { loadClaimSecret } from '../claims/tokens.ts';
import type { AdapterContext } from '../adapters/types.ts';
import type { AirportConfig } from '../airportConfig.ts';
import type { AppConfig } from '../config.ts';
import { migrate, openDatabase, type Database } from '../db/database.ts';
import { isSeeded, markSeedVersion, seedDatabase, seedVersion } from '../db/seed.ts';
import { MockDecisionAgent } from '../decision/agent.ts';
import { DecisionEngine, type Decision } from '../decision/DecisionEngine.ts';
import { Learner } from '../decision/learner.ts';
import { Ledger } from '../decision/ledger.ts';
import { DEFAULT_SETTINGS, engineSettingsSchema, type EngineSettings } from '../decision/settings.ts';
import { feedFiles } from '../feeds/paths.ts';
import { writeFeeds } from '../feeds/writeFeeds.ts';
import { GENERATOR_VERSION, generateDay } from '../generator/index.ts';
import { buildLayout } from '../generator/layout.ts';
import { generatePlatform } from '../generator/platform.ts';
import { SseHub, type Topic } from '../live/SseHub.ts';
import { PresenceEngine } from '../presence/PresenceEngine.ts';
import { PlatformRepo } from '../repos/platformRepo.ts';
import { EventInjector, InjectionError } from '../sim/EventInjector.ts';
import { FeedPump } from '../sim/FeedPump.ts';
import { SimClock, type Speed } from '../sim/SimClock.ts';
import { AirportState, type FlightChange } from '../state/AirportState.ts';

export interface RuntimeOptions {
  config: AppConfig;
  airport: AirportConfig;
  dbFile: string;
  startTime: string;
  autoPlay: boolean;
  tickMs?: number;
  settings?: Partial<EngineSettings>;
}

export interface InjectionResult {
  type: string;
  latencyMs: number;
  affectedScreens: string[];
  decisions: { screenId: string; campaignId: string | null; name: string | null; source: string; rule: string }[];
  aidxXml?: string;
}

const THROTTLES = new Map<Topic, number>([
  ['clock', 500],
  ['presence', 1000],
  ['kpi', 1000],
  ['feed', 2000],
]);

export function flightSummary(f: Flight) {
  return {
    id: f.id,
    flight: `${f.airlineCode}${f.flightNumber}`,
    airlineCode: f.airlineCode,
    direction: f.direction,
    origin: f.origin,
    destination: f.destination,
    international: f.international,
    terminal: f.terminalId,
    gate: f.gate,
    stand: f.stand,
    scheduledTime: f.scheduledTime,
    estimatedTime: f.estimatedTime,
    status: f.status,
    delayMinutes: f.delayMinutes,
    delayCodes: f.delayCodes,
    paxCount: f.paxCount,
    seatCapacity: f.seatCapacity,
    loadFactor: f.seatCapacity > 0 ? Math.round((f.paxCount / f.seatCapacity) * 100) / 100 : 0,
    aircraftType: f.aircraftType,
  };
}

export function decisionSummary(d: Decision) {
  return { screenId: d.screenId, simTime: d.simTime, campaignId: d.winner?.campaignId ?? null, creativeId: d.winner?.creativeId ?? null, name: d.winner?.name ?? null, advertiser: d.winner?.advertiser ?? null, score: d.winner?.score ?? 0, source: d.source, rule: d.winningRule, pax: d.crowd.pax };
}

// Owns the simulation: clock, feeds, airport state, presence and the decision engine
export class Runtime {
  readonly hub = new SseHub(THROTTLES);
  private timer: NodeJS.Timeout | null = null;
  private lastTick = 0;
  private lastFlush = 0;
  private decisionBuffer: Decision[] = [];
  private redemptionBuffer: RedemptionEvent[] = [];
  private readonly baselineSpend: Map<string, number>;
  readonly startedAt = Date.now();
  tickCount = 0;
  lastTickMs = 0;

  private constructor(
    readonly config: AppConfig,
    readonly airport: AirportConfig,
    readonly db: Database,
    readonly repo: PlatformRepo,
    readonly state: AirportState,
    readonly pump: FeedPump,
    readonly presence: PresenceEngine,
    readonly engine: DecisionEngine,
    readonly agent: MockDecisionAgent,
    readonly clock: SimClock,
    readonly injector: EventInjector,
    readonly ledger: Ledger,
    private readonly tickMs: number,
    readonly claims: ClaimService,
  ) {
    this.baselineSpend = new Map(engine.campaigns.map((c) => [c.id, c.budget.spent]));
    engine.on('decision', (d: Decision) => this.decisionBuffer.push(d));
    claims.on('redemption', (r: RedemptionEvent) => this.redemptionBuffer.push(r));
    clock.on('change', () => this.hub.publish('clock', this.clockPayload()));
  }

  static async create(opts: RuntimeOptions): Promise<Runtime> {
    const { config, airport } = opts;
    const files = feedFiles(airport.iataCode, airport.operatingDate);
    // Fresh hosts start with no feeds or database: build both so every boot is demo-ready
    if (!existsSync(files.aodbStartOfDay) || !existsSync(files.aidxStream) || !existsSync(files.acrisEntities)) writeFeeds(generateDay(airport), airport.iataCode);
    const db = openDatabase(opts.dbFile);
    migrate(db);
    if (!isSeeded(db) || seedVersion(db) !== GENERATOR_VERSION) {
      const layout = buildLayout();
      seedDatabase(db, layout, generatePlatform(layout, { date: airport.operatingDate, seed: airport.seed }), { reset: true });
      markSeedVersion(db, GENERATOR_VERSION);
    }

    const repo = new PlatformRepo(db);
    const dayStart = Date.parse(`${airport.operatingDate}T00:00:00Z`);
    const clock = new SimClock(dayStart, dayStart + 24 * 3_600_000 - 1, Date.parse(`${airport.operatingDate}T${opts.startTime}:00Z`), 1, opts.autoPlay);
    const ctx: AdapterContext = { homeAirport: airport.iataCode, now: () => clock.nowIso() };
    const state = new AirportState(repo.zones(), repo.gates(), repo.screens());
    const pump = new FeedPump(state, createFlightSource(config, ctx, airport.operatingDate), createZoneSource(config, ctx, airport.operatingDate));
    await pump.start();

    const settings = engineSettingsSchema.parse({ ...DEFAULT_SETTINGS, ...loadStoredSettings(db), ...opts.settings });
    const presence = new PresenceEngine(state, airport);
    const ledger = new Ledger(db);
    const agent = new MockDecisionAgent();
    const engine = new DecisionEngine({
      state,
      presence,
      airport,
      campaigns: repo.campaigns(),
      creatives: repo.creatives(),
      outlets: repo.outlets(),
      advertisers: repo.advertisers(),
      learner: new Learner(repo.campaignHistory()),
      ledger,
      agent,
      settings,
      db,
    });
    const injector = new EventInjector(state, pump, clock, ctx);
    const claims = new ClaimService(db, clock, state, engine, loadClaimSecret(db, config.CLAIM_SECRET), { creatives: repo.creatives(), outlets: repo.outlets(), advertisers: repo.advertisers() }, airport.seed);
    const runtime = new Runtime(config, airport, db, repo, state, pump, presence, engine, agent, clock, injector, ledger, opts.tickMs ?? 250, claims);
    pump.deliverUntil(clock.nowMs());
    engine.runSlot(clock.nowMs());
    return runtime;
  }

  start(): void {
    if (this.timer) return;
    this.hub.start();
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(Date.now() - this.lastTick), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.engine.flush();
    this.hub.stop();
    this.db.close();
  }

  // One heartbeat: advance time, deliver feed records, run the slot or re-plan affected screens, publish live updates
  tick(realMs: number): void {
    const started = performance.now();
    this.lastTick = Date.now();
    this.clock.advance(realMs);
    const now = this.clock.nowMs();
    const { changes, measurements } = this.pump.deliverUntil(now);
    const ranSlot = this.engine.runSlot(now) > 0;
    if (!ranSlot && changes.length) this.engine.replan(this.affectedScreens(changes), now);
    this.claims.settleSimulated();
    this.publish(changes, measurements.length > 0);
    if (Date.now() - this.lastFlush > 5000) {
      this.engine.flush();
      this.lastFlush = Date.now();
    }
    this.tickCount++;
    this.lastTickMs = Math.round((performance.now() - started) * 100) / 100;
  }

  private affectedScreens(changes: FlightChange[]): Set<string> {
    const gates = changes.flatMap((c) => [c.previousGate, c.flight.gate]);
    return new Set(this.engine.screensNearGates(gates));
  }

  private publish(changes: FlightChange[], queuesChanged: boolean): void {
    if (changes.length) this.hub.publish('flight', changes.map((c) => ({ ...flightSummary(c.flight), event: c.event.kind, previousGate: c.previousGate })));
    if (this.decisionBuffer.length) {
      this.hub.publish('decision', this.decisionBuffer.map(decisionSummary));
      this.decisionBuffer = [];
    }
    if (this.redemptionBuffer.length) {
      this.hub.publish('redemption', this.redemptionBuffer.slice(0, 50));
      this.redemptionBuffer = [];
    }
    if (this.hub.due('clock')) this.hub.publish('clock', this.clockPayload());
    if (this.hub.due('kpi')) this.hub.publish('kpi', this.kpis());
    if (this.hub.due('presence') && (changes.length || queuesChanged || this.hub.size)) this.hub.publish('presence', this.presenceSummary());
    if (this.hub.due('feed')) this.hub.publish('feed', this.feedHealth());
  }

  clockPayload() {
    return { ...this.clock.state(), festival: this.airport.festivalDates.includes(this.clock.nowIso().slice(0, 10)) };
  }

  control(action: { action: 'play' } | { action: 'pause' } | { action: 'speed'; speed: Speed } | { action: 'jump'; time: string }) {
    if (action.action === 'play') this.clock.play();
    if (action.action === 'pause') this.clock.pause();
    if (action.action === 'speed') this.clock.setSpeed(action.speed);
    if (action.action === 'jump') this.jump(this.resolveTime(action.time));
    return this.clockPayload();
  }

  resolveTime(time: string): number {
    const [h, m, extra] = time.split(':');
    if (extra === undefined && h?.length === 2 && m?.length === 2 && Number(h) >= 0 && Number(h) <= 23 && Number(m) >= 0 && Number(m) <= 59) {
      return Date.parse(`${this.airport.operatingDate}T${time}:00Z`);
    }
    const ms = Date.parse(time);
    if (Number.isNaN(ms)) throw new InjectionError('time must be HH:MM or an ISO timestamp');
    return ms;
  }

  jump(targetMs: number): void {
    const { from, to } = this.clock.jump(targetMs);
    if (to < from) {
      this.pump.rewind();
      this.ledger.resetDay();
      this.claims.resetDay();
      for (const c of this.engine.campaigns) c.budget.spent = this.baselineSpend.get(c.id) ?? c.budget.spent;
    }
    this.engine.onJump();
    this.pump.deliverUntil(to);
    this.engine.runSlot(to);
    this.publish([], true);
  }

  // Clean slate for presenters: original feeds, no injections, screens back online, today's totals cleared
  resetDemo(targetMs?: number): void {
    this.pump.restoreBaseline();
    this.ledger.resetDay();
    this.claims.resetDay();
    this.engine.resetLearning();
    for (const c of this.engine.campaigns) c.budget.spent = this.baselineSpend.get(c.id) ?? c.budget.spent;
    this.clock.jump(targetMs ?? this.clock.nowMs());
    this.engine.onJump();
    this.pump.deliverUntil(this.clock.nowMs());
    this.engine.runSlot(this.clock.nowMs());
    this.hub.publish('inject', { type: 'reset', simTime: this.clock.nowIso(), latencyMs: 0, affectedScreens: this.state.screens.size });
    this.publish([], true);
  }

  private timed(type: string, work: () => { screens: Iterable<string>; xml?: string }): InjectionResult {
    const started = performance.now();
    const { screens, xml } = work();
    const now = this.clock.nowMs();
    const decisions = this.engine.replan(screens, now);
    this.publish([], false);
    const result: InjectionResult = {
      type,
      latencyMs: Math.round((performance.now() - started) * 100) / 100,
      affectedScreens: decisions.map((d) => d.screenId),
      decisions: decisions.map((d) => ({ screenId: d.screenId, campaignId: d.winner?.campaignId ?? null, name: d.winner?.name ?? null, source: d.source, rule: d.winningRule })),
      ...(xml ? { aidxXml: xml } : {}),
    };
    this.hub.publish('inject', { type, simTime: this.clock.nowIso(), latencyMs: result.latencyMs, affectedScreens: result.affectedScreens.length });
    return result;
  }

  injectDelay(flightId: string, minutes: number): InjectionResult {
    return this.timed('delay', () => {
      const { xml, change } = this.injector.delay(flightId, minutes);
      if (change) this.hub.publish('flight', [{ ...flightSummary(change.flight), event: 'delay', previousGate: change.previousGate }]);
      return { screens: change ? this.affectedScreens([change]) : [], xml };
    });
  }

  injectGateChange(flightId: string, gate: string): InjectionResult {
    return this.timed('gate-change', () => {
      const { xml, change } = this.injector.gateChange(flightId, gate);
      if (change) this.hub.publish('flight', [{ ...flightSummary(change.flight), event: 'gate-change', previousGate: change.previousGate }]);
      return { screens: change ? this.affectedScreens([change]) : [], xml };
    });
  }

  setScreenStatus(screenId: string, status: Screen['status']): InjectionResult {
    return this.timed(status === 'offline' ? 'screen-offline' : 'screen-online', () => {
      const screen = this.state.setScreenStatus(screenId, status);
      if (!screen) throw new InjectionError(`unknown screen ${screenId}`, 404);
      this.hub.publish('screen', { screenId, status, simTime: this.clock.nowIso() });
      return { screens: status === 'offline' ? [] : [screenId] };
    });
  }

  injectHallucination(screenId: string): InjectionResult {
    return this.timed('hallucination', () => {
      if (!this.state.screens.has(screenId)) throw new InjectionError(`unknown screen ${screenId}`, 404);
      this.agent.armHallucination(screenId);
      return { screens: [screenId] };
    });
  }

  screenClosestToGate(gate: string): Screen | null {
    let best: { screen: Screen; d: number } | null = null;
    for (const screen of this.state.screens.values()) {
      const d = screen.nearestGates.find((g) => g.gate === gate)?.distanceM;
      if (d !== undefined && (!best || d < best.d)) best = { screen, d };
    }
    return best?.screen ?? null;
  }

  kpis() {
    const screens = [...this.state.screens.values()];
    const online = screens.filter((s) => s.status === 'online').length;
    const totals = this.ledger.totals();
    const latest = this.engine.latestAll();
    const avgLatency = latest.length ? latest.reduce((s, d) => s + d.computeMs, 0) / latest.length : 0;
    const activeCampaigns = this.engine.campaigns.filter((c: Campaign) => c.status === 'active').length;
    return {
      simTime: this.clock.nowIso(),
      screensOnlinePct: screens.length ? Math.round((online / screens.length) * 1000) / 10 : 0,
      screensOnline: online,
      screensTotal: screens.length,
      playsToday: totals.plays,
      impressionsToday: totals.impressions,
      revenueToday: totals.spend,
      currency: 'USD',
      activeCampaigns,
      avgDecisionMs: Math.round(avgLatency * 100) / 100,
      tickMs: this.lastTickMs,
    };
  }

  presenceSummary() {
    return this.presence.allZones(this.clock.nowMs()).map((z) => ({
      zoneId: z.zoneId,
      zoneName: z.zoneName,
      kind: z.kind,
      terminalId: z.terminalId,
      pax: z.pax,
      paxNext30: z.paxNext30,
      internationalShare: z.internationalShare,
      medianDwellMinutes: z.medianDwellMinutes,
      topDestinations: z.topDestinations,
    }));
  }

  feedHealth() {
    const now = this.clock.nowMs();
    return { adapters: { flight: this.config.FLIGHT_SOURCE, zones: this.config.ZONE_SOURCE, ai: this.config.AI_PROVIDER }, feeds: this.pump.health(now), ratePerMinute: this.pump.ratePerMinute(now) };
  }

  // Today's totals for every campaign of one advertiser, for the retailer live dashboard
  retailerLive(advertiserId: string) {
    const campaigns = this.engine.campaigns.filter((c) => c.advertiserId === advertiserId);
    const rows = campaigns.map((c) => {
      const play = this.ledger.campaignToday(c.id);
      const claim = this.claims.totals(c.id);
      return { id: c.id, name: c.name, status: c.status, plays: play.plays, impressions: play.impressions, spend: play.spend, scans: claim.scans, redemptions: claim.redemptions, revenue: claim.revenue };
    });
    const total = rows.reduce(
      (t, r) => ({ plays: t.plays + r.plays, impressions: t.impressions + r.impressions, spend: t.spend + r.spend, scans: t.scans + r.scans, redemptions: t.redemptions + r.redemptions, revenue: t.revenue + r.revenue }),
      { plays: 0, impressions: 0, spend: 0, scans: 0, redemptions: 0, revenue: 0 },
    );
    const impressions = total.impressions;
    const spend = Math.round(total.spend * 100) / 100;
    const revenue = Math.round(total.revenue * 100) / 100;
    return {
      advertiserId,
      simTime: this.clock.nowIso(),
      today: {
        plays: total.plays,
        impressions,
        scans: total.scans,
        redemptions: total.redemptions,
        conversionRate: impressions > 0 ? total.redemptions / impressions : 0,
        revenueAttributed: revenue,
        spend,
        roi: spend > 0 ? (revenue - spend) / spend : null,
      },
      campaigns: rows,
      recentRedemptions: this.claims.recentFor(advertiserId, 15),
    };
  }

  updateSettings(patch: Partial<EngineSettings>): EngineSettings {
    const next = engineSettingsSchema.parse({ ...this.engine.settings, ...patch });
    this.engine.settings = next;
    this.db.prepare("INSERT INTO engine_settings (key, value, updated_at) VALUES ('engine', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(JSON.stringify(next), new Date().toISOString());
    return next;
  }
}

function loadStoredSettings(db: Database): Partial<EngineSettings> {
  const row = db.prepare("SELECT value FROM engine_settings WHERE key = 'engine'").get();
  if (!row) return {};
  const parsed = engineSettingsSchema.partial().safeParse(JSON.parse(String(row.value)));
  return parsed.success ? parsed.data : {};
}

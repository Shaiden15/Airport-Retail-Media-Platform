import type { Campaign, Screen } from '@dwellcast/shared';
import type { ClaimService } from '../claims/ClaimService.ts';
import type { Database } from '../db/database.ts';
import type { DecisionEngine } from '../decision/DecisionEngine.ts';
import type { Ledger } from '../decision/ledger.ts';
import type { PresenceEngine } from '../presence/PresenceEngine.ts';
import type { SimClock } from '../sim/SimClock.ts';
import type { AirportState } from '../state/AirportState.ts';
import { priceSlot, SLOTS_PER_HOUR } from './pricing.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const round2 = (v: number) => Math.round(v * 100) / 100;
// Demand relative to the simulated Friday, used to project the next 7 days
const WEEKDAY_FACTOR = new Map([
  [0, 1.12],
  [1, 0.92],
  [2, 0.85],
  [3, 0.88],
  [4, 0.95],
  [5, 1],
  [6, 1.08],
]);

const HEATMAP_SEGMENTS = ['business', 'holiday', 'vfr', 'family', 'couple', 'solo', 'international', 'business-cabin'] as const;

// Media Manager views: inventory, yield, approvals, advertiser delivery, audience heatmap and conflicts
export class MediaService {
  constructor(
    private readonly db: Database,
    private readonly engine: DecisionEngine,
    private readonly presence: PresenceEngine,
    private readonly state: AirportState,
    private readonly ledger: Ledger,
    private readonly claims: ClaimService,
    private readonly clock: SimClock,
  ) {}

  private dayStart(offsetDays = 0): number {
    return Date.parse(`${this.clock.nowIso().slice(0, 10)}T00:00:00Z`) + offsetDays * DAY;
  }

  private placementCovers(c: Campaign, screen: Screen): boolean {
    const p = c.targeting.placement;
    if (!p.zoneIds.length && !p.screenIds.length && !p.gates.length) return true;
    return p.zoneIds.includes(screen.zoneId) || p.screenIds.includes(screen.id) || screen.nearestGates.some((g) => p.gates.includes(g.gate));
  }

  // Booked share of a screen-hour: capacity allocated to approved campaigns that can play there then
  private bookedShare(screen: Screen, hourStart: number): number {
    const hour = new Date(hourStart).getUTCHours();
    let slots = 0;
    for (const c of this.engine.campaigns) {
      if (c.status !== 'active' && c.status !== 'approved') continue;
      if (hourStart + HOUR <= Date.parse(c.schedule.start) || hourStart >= Date.parse(c.schedule.end)) continue;
      if (hour < c.schedule.dailyHours.from || hour >= c.schedule.dailyHours.to) continue;
      if (!this.placementCovers(c, screen)) continue;
      slots += Math.min(c.budget.frequencyCapPerScreenHour, SLOTS_PER_HOUR * 0.25);
    }
    return Math.min(1, slots / SLOTS_PER_HOUR);
  }

  inventory(zoneId: string) {
    const screens = [...this.state.screens.values()].filter((s) => s.zoneId === zoneId);
    const start = this.dayStart();
    const cells = screens.flatMap((screen) =>
      Array.from({ length: 24 }, (_, h) => {
        const hourStart = start + h * HOUR;
        const price = priceSlot(this.presence, screen, hourStart);
        const booked = this.bookedShare(screen, hourStart);
        return { screenId: screen.id, hour: h, bookedShare: round2(booked), predictedPax: price.predictedPax, pricePerScreenHour: price.pricePerScreenHour, pricePerPlay: price.pricePerPlay, premium: screen.premium };
      }),
    );
    const paxSorted = cells.map((c) => c.predictedPax).sort((a, b) => a - b);
    const threshold = paxSorted.at(Math.floor(paxSorted.length * 0.75)) ?? Number.POSITIVE_INFINITY;
    return {
      zoneId,
      zoneName: this.state.zones.get(zoneId)?.name ?? zoneId,
      screens: screens.map((s) => ({ id: s.id, name: s.name, orientation: s.orientation, status: s.status, premium: s.premium })),
      cells: cells.map((c) => ({ ...c, premium: c.premium || c.predictedPax >= threshold, state: c.bookedShare >= 0.5 ? 'booked' : 'available' })),
    };
  }

  // Seven-day outlook: occupancy from campaign schedules, price from predicted presence scaled by weekday demand
  yield() {
    const sample = [...this.state.zones.keys()].flatMap((z) => [...this.state.screens.values()].filter((s) => s.zoneId === z).slice(0, 1));
    const scale = this.state.screens.size / Math.max(1, sample.length);
    const today = this.dayStart();
    const hourly = Array.from({ length: 24 }, (_, h) => sample.map((s) => priceSlot(this.presence, s, today + h * HOUR)));
    const days = Array.from({ length: 7 }, (_, d) => {
      const dayStart = this.dayStart(d);
      const factor = WEEKDAY_FACTOR.get(new Date(dayStart).getUTCDay()) ?? 1;
      let booked = 0;
      let cellsCount = 0;
      let revenue = 0;
      hourly.forEach((prices, h) => {
        prices.forEach((price, i) => {
          const screen = sample.at(i);
          if (!screen) return;
          const share = this.bookedShare(screen, dayStart + h * HOUR);
          booked += share;
          cellsCount++;
          revenue += share * price.pricePerScreenHour * factor;
        });
      });
      return { date: new Date(dayStart).toISOString().slice(0, 10), occupancyPct: round2(cellsCount ? (booked / cellsCount) * 100 : 0), revenueForecast: Math.round(revenue * scale), demandFactor: factor };
    });
    const premiumSlots = hourly
      .flatMap((prices, h) => prices.map((p) => ({ ...p, hour: h, zoneName: this.state.zones.get(this.state.screens.get(p.screenId)?.zoneId ?? '')?.name ?? '' })))
      .sort((a, b) => b.pricePerScreenHour - a.pricePerScreenHour)
      .slice(0, 8);
    return { days, premiumSlots, totalForecast: days.reduce((s, d) => s + d.revenueForecast, 0) };
  }

  approvals() {
    const reviews = this.db.prepare('SELECT campaign_id, decision, notes, reviewer, reviewed_at FROM campaign_reviews ORDER BY reviewed_at DESC LIMIT 50').all();
    return {
      pending: this.engine.campaigns
        .filter((c) => c.status === 'pending-approval')
        .map((c) => ({ campaign: c, advertiser: this.engine.advertiserById(c.advertiserId)?.name ?? c.advertiserId, creatives: c.creativeIds.map((id) => this.engine.creativeById(id)).filter(Boolean) })),
      recent: reviews.map((r) => ({ campaignId: String(r.campaign_id), campaignName: this.engine.campaignById(String(r.campaign_id))?.name ?? '', decision: String(r.decision), notes: String(r.notes), reviewer: String(r.reviewer), reviewedAt: String(r.reviewed_at) })),
    };
  }

  // Under-delivery: today's spend well behind an even pace through the campaign's daily hours
  advertisers() {
    const history = this.db.prepare('SELECT c.advertiser_id, SUM(s.spend) AS spend FROM campaign_daily_stats s JOIN campaigns c ON c.id = s.campaign_id GROUP BY c.advertiser_id').all();
    const spend30 = new Map(history.map((r) => [String(r.advertiser_id), Number(r.spend)]));
    const now = new Date(this.clock.nowMs());
    const hourNow = now.getUTCHours() + now.getUTCMinutes() / 60;
    return this.engine
      .advertisersList()
      .map((a) => {
        const campaigns = this.engine.campaigns.filter((c) => c.advertiserId === a.id);
        const running = campaigns.filter((c) => c.status === 'active');
        const delivery = running.map((c) => {
          const { from, to } = c.schedule.dailyHours;
          const elapsed = Math.min(1, Math.max(0, (hourNow - from) / Math.max(1, to - from)));
          const today = this.ledger.campaignToday(c.id);
          const expected = c.budget.dailyCap * elapsed;
          const pace = expected > 0 ? today.spend / expected : 1;
          return { campaignId: c.id, name: c.name, spendToday: round2(today.spend), expectedByNow: round2(expected), pace: round2(pace), underDelivering: elapsed > 0.15 && pace < 0.6 };
        });
        const todaySpend = round2(running.reduce((s, c) => s + this.ledger.campaignToday(c.id).spend, 0));
        return {
          id: a.id,
          name: a.name,
          kind: a.kind,
          spendToday: todaySpend,
          spend30d: round2((spend30.get(a.id) ?? 0) + todaySpend),
          redemptionsToday: running.reduce((s, c) => s + this.claims.totals(c.id).redemptions, 0),
          running: running.length,
          total: campaigns.length,
          underDelivering: delivery.filter((d) => d.underDelivering),
          delivery,
        };
      })
      .sort((a, b) => b.spend30d - a.spend30d);
  }

  heatmap(zoneId: string) {
    const start = this.dayStart();
    const hours = Array.from({ length: 24 }, (_, h) => {
      const z = this.presence.zone(zoneId, start + h * HOUR + 30 * 60_000);
      const seg = new Map(Object.entries(z?.segments ?? {}));
      return { hour: h, pax: z?.pax ?? 0, seg };
    });
    return {
      zoneId,
      zoneName: this.state.zones.get(zoneId)?.name ?? zoneId,
      segments: HEATMAP_SEGMENTS,
      rows: HEATMAP_SEGMENTS.map((segment) => ({
        segment,
        values: hours.map((h) => Math.round(h.pax * (h.seg.get(segment) ?? 0))),
      })),
      pax: hours.map((h) => h.pax),
    };
  }

  // Why campaign A beat campaign B on a screen, group by group
  conflict(screenId: string, a?: string, b?: string) {
    const d = this.engine.latest(screenId);
    if (!d) return null;
    const scored = d.candidates.filter((c) => c.breakdown);
    const first = (a ? scored.find((c) => c.campaignId === a) : undefined) ?? scored.at(0);
    const second = (b ? d.candidates.find((c) => c.campaignId === b) : undefined) ?? scored.at(1);
    if (!first || !second) return { decision: d, first: first ?? null, second: second ?? null, lines: [] };
    const lines: string[] = [];
    if (!second.breakdown) lines.push(`${second.name} could not play here: ${second.reason ?? 'filtered'}`);
    else {
      const fb = first.breakdown;
      const sb = second.breakdown;
      if (fb) {
        lines.push(`Audience match ${Math.round(fb.match * 100)}% vs ${Math.round(sb.match * 100)}%`);
        if (fb.boost !== sb.boost) lines.push(`Trigger boost x${fb.boost} vs x${sb.boost}${first.triggers.length ? ` (${first.triggers.map((t) => t.detail).join(', ')})` : ''}`);
        if (Math.abs(fb.learnLift - sb.learnLift) >= 0.01) lines.push(`Learned conversion lift ${fb.learnLift} vs ${sb.learnLift}`);
        if (Math.abs(fb.pacing - sb.pacing) >= 0.01) lines.push(`Budget pacing ${fb.pacing} vs ${sb.pacing}`);
        lines.push(`Final score ${fb.score.toFixed(2)} vs ${sb.score.toFixed(2)}`);
      }
      if (second.reason) lines.push(`${second.name} was also held back by ${second.reason}`);
    }
    return { decision: { id: d.id, screenId: d.screenId, simTime: d.simTime, winningRule: d.winningRule, source: d.source }, first, second, lines };
  }
}

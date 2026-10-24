import type { Segment } from '@dwellcast/shared';
import type { ClaimService } from '../claims/ClaimService.ts';
import type { Database } from '../db/database.ts';
import type { DecisionEngine } from '../decision/DecisionEngine.ts';
import type { Learner } from '../decision/learner.ts';
import type { Ledger } from '../decision/ledger.ts';
import type { PresenceEngine } from '../presence/PresenceEngine.ts';
import type { SimClock } from '../sim/SimClock.ts';

const round2 = (v: number) => Math.round(v * 100) / 100;

// Retailer insights: passenger flow near stores, campaign history and ROI, codes, and segment performance
export class RetailerService {
  constructor(
    private readonly db: Database,
    private readonly engine: DecisionEngine,
    private readonly presence: PresenceEngine,
    private readonly ledger: Ledger,
    private readonly claims: ClaimService,
    private readonly learner: Learner,
    private readonly clock: SimClock,
  ) {}

  flow(advertiserId: string) {
    const now = this.clock.nowMs();
    const outlets = this.engine.outletsList().filter((o) => o.advertiserId === advertiserId);
    return outlets.map((o) => {
      const next60 = this.presence.zoneFlow(o.zoneId, now, 60);
      const next120 = this.presence.zoneFlow(o.zoneId, now, 120);
      return { outletId: o.id, outletName: o.name, zoneId: o.zoneId, next60, next120 };
    });
  }

  history(advertiserId: string) {
    const rows = this.db
      .prepare('SELECT campaign_id, SUM(plays) AS plays, SUM(impressions) AS impressions, SUM(redemptions) AS redemptions, SUM(spend) AS spend, SUM(revenue) AS revenue FROM campaign_daily_stats GROUP BY campaign_id')
      .all();
    const past = new Map(rows.map((r) => [String(r.campaign_id), r]));
    return this.engine.campaigns
      .filter((c) => c.advertiserId === advertiserId)
      .map((c) => {
        const h = past.get(c.id);
        const today = this.ledger.campaignToday(c.id);
        const claim = this.claims.totals(c.id);
        const spend = round2(Number(h?.spend ?? 0) + today.spend);
        const revenue = round2(Number(h?.revenue ?? 0) + claim.revenue);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          start: c.schedule.start,
          end: c.schedule.end,
          plays: Number(h?.plays ?? 0) + today.plays,
          impressions: Number(h?.impressions ?? 0) + today.impressions,
          redemptions: Number(h?.redemptions ?? 0) + claim.redemptions,
          spend,
          revenue,
          roi: spend > 0 ? round2((revenue - spend) / spend) : null,
          budget: c.budget.total,
        };
      })
      .sort((a, b) => b.end.localeCompare(a.end));
  }

  codes(advertiserId: string) {
    const now = this.clock.nowMs();
    const rows = this.db
      .prepare(
        "SELECT p.code, p.campaign_id, c.name AS campaign_name, p.screen_id, p.linked_flight_id, p.parent_code, p.issued_at, p.expires_at, r.basket_value FROM promo_codes p JOIN campaigns c ON c.id = p.campaign_id LEFT JOIN redemptions r ON r.code = p.code WHERE c.advertiser_id = ? AND p.code NOT LIKE 'S%' ORDER BY p.issued_at DESC LIMIT 200",
      )
      .all(advertiserId);
    const codes = rows.map((r) => ({
      code: String(r.code),
      campaignId: String(r.campaign_id),
      campaignName: String(r.campaign_name),
      screenId: String(r.screen_id),
      linkedFlightId: r.linked_flight_id ? String(r.linked_flight_id) : null,
      familyOf: r.parent_code ? String(r.parent_code) : null,
      issuedAt: String(r.issued_at),
      expiresAt: String(r.expires_at),
      expired: now > Date.parse(String(r.expires_at)),
      basketValue: Number(r.basket_value ?? 0),
    }));
    return {
      summary: { issued: codes.length, active: codes.filter((c) => !c.expired).length, family: codes.filter((c) => c.familyOf).length },
      codes,
    };
  }

  // How each targeted segment converts against the campaign's own average, with suggested weight changes
  segments(campaignId: string) {
    const campaign = this.engine.campaignById(campaignId);
    if (!campaign) return null;
    const baseline = this.learner.baselineRate(campaignId);
    const learned = new Map(this.learner.snapshot(campaignId).map((s) => [s.segment, s]));
    const history = this.db.prepare('SELECT segment_redemptions FROM campaign_daily_stats WHERE campaign_id = ?').all(campaignId);
    const redemptions = new Map<string, number>();
    for (const row of history) for (const [k, v] of Object.entries(JSON.parse(String(row.segment_redemptions)) as Record<string, number>)) redemptions.set(k, (redemptions.get(k) ?? 0) + v);
    const weights = new Map(Object.entries(campaign.targeting.segmentWeights) as [Segment, number][]);
    const segments = [...new Set([...weights.keys(), ...(redemptions.keys() as Iterable<Segment>)])].map((segment) => {
      const rate = learned.get(segment)?.rate ?? baseline;
      const index = baseline > 0 ? rate / baseline : 1;
      const weight = weights.get(segment) ?? 0;
      const suggested = index > 1.3 ? Math.min(1, weight + 0.2) : index < 0.7 ? Math.max(0, weight - 0.2) : weight;
      return { segment, weight, redemptions: redemptions.get(segment) ?? 0, index: round2(index), suggestedWeight: round2(suggested) };
    });
    segments.sort((a, b) => b.index - a.index);
    const best = segments.at(0);
    const worst = segments.at(-1);
    const headline = best && worst && worst.index > 0 && best.index / worst.index >= 1.5 ? `${best.segment} redeemed ${round2(best.index / worst.index)}x more than ${worst.segment}` : 'Segments are converting at similar rates';
    return { campaignId, campaignName: campaign.name, baselineRate: baseline, headline, segments };
  }
}

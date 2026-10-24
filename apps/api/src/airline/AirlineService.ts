import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { SEGMENTS, cabinSegment, type Cabin, type Segment } from '@dwellcast/shared';
import type { CampaignService } from '../campaigns/CampaignService.ts';
import type { Database } from '../db/database.ts';
import type { DecisionEngine } from '../decision/DecisionEngine.ts';
import { audienceMatch } from '../decision/scorer.ts';
import type { PresenceEngine } from '../presence/PresenceEngine.ts';
import type { SimClock } from '../sim/SimClock.ts';
import type { AirportState } from '../state/AirportState.ts';

export const goodwillInputSchema = z.object({
  partnerAdvertiserId: z.string().min(1).max(60).regex(/^[A-Za-z0-9._-]+$/),
  thresholdMinutes: z.number().int().min(15).max(600),
  airlineSharePct: z.number().int().min(0).max(100).default(50),
  headline: z.string().min(3).max(80).default('Delayed? Your next treat is on us'),
  enabled: z.boolean().default(true),
});

export const gateMessageSchema = z.object({
  name: z.string().min(3).max(80),
  template: z.enum(['upgrade', 'destination', 'hero-offer']),
  headline: z.string().min(3).max(80),
  subline: z.string().max(140).default(''),
  cta: z.string().min(2).max(40),
  gates: z.array(z.string().min(1).max(10)).max(40).default([]),
  discountPct: z.number().min(0).max(100).default(0),
  budget: z.number().min(50).max(100_000).default(2000),
});

const HOUR = 3_600_000;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

// Airline views: own flights, the crowd on them, partner offers, what played at their gates, gate messaging and goodwill
export class AirlineService {
  constructor(
    private readonly db: Database,
    private readonly engine: DecisionEngine,
    private readonly presence: PresenceEngine,
    private readonly state: AirportState,
    private readonly campaigns: CampaignService,
    private readonly clock: SimClock,
  ) {}

  private departures(code: string) {
    return [...this.state.flights.values()].filter((f) => f.airlineCode === code && f.direction === 'departure');
  }

  profile(code: string) {
    const flights = this.departures(code).filter((f) => f.status !== 'cancelled');
    const totals = new Map<string, number>();
    const destinations = new Map<string, number>();
    const nationalities = new Map<string, number>();
    let pax = 0;
    let international = 0;
    for (const f of flights) {
      const p = this.presence.profile(f);
      const w = f.paxCount;
      pax += w;
      if (f.international) international += w;
      destinations.set(f.destination, (destinations.get(f.destination) ?? 0) + w);
      for (const group of [p.tripPurpose, p.party, p.age]) for (const [k, v] of Object.entries(group)) totals.set(k, (totals.get(k) ?? 0) + v * w);
      for (const [k, v] of Object.entries(p.cabin) as [Cabin, number][]) totals.set(cabinSegment(k), (totals.get(cabinSegment(k)) ?? 0) + v * w);
      totals.set('frequent-flyer', (totals.get('frequent-flyer') ?? 0) + p.frequentFlyerShare * w);
      totals.set('female', (totals.get('female') ?? 0) + p.gender.female * w);
      totals.set('male', (totals.get('male') ?? 0) + p.gender.male * w);
      for (const n of p.nationalities) nationalities.set(n.code, (nationalities.get(n.code) ?? 0) + n.share * w);
    }
    const share = (v: number) => (pax > 0 ? round3(v / pax) : 0);
    const segments = Object.fromEntries(SEGMENTS.map((s) => [s, share(totals.get(s) ?? 0)])) as Record<Segment, number>;
    segments.international = share(international);
    segments.domestic = share(pax - international);
    const rank = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ code: k, share: share(v) }));
    return { airlineCode: code, flights: flights.length, pax, internationalShare: share(international), segments, topDestinations: rank(destinations), topNationalities: rank(nationalities) };
  }

  // Retail and F&B offers ranked by how well they fit this airline's passengers today
  partners(code: string) {
    const { segments } = this.profile(code);
    return this.engine.campaigns
      .filter((c) => (c.status === 'active' || c.status === 'approved') && !this.engine.advertiserById(c.advertiserId)?.airlineCode)
      .map((c) => ({ campaignId: c.id, name: c.name, advertiser: this.engine.advertiserById(c.advertiserId)?.name ?? '', category: c.category, fit: audienceMatch(c.targeting.segmentWeights, segments).match, discountPct: c.offer.discountPct }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 12);
  }

  // Latest decision on every screen beside this airline's gates for flights in the next three hours
  plays(code: string) {
    const now = this.clock.nowMs();
    const gates = new Map<string, string>();
    for (const f of this.departures(code)) {
      const etd = Date.parse(f.estimatedTime ?? f.scheduledTime);
      if (f.gate && etd > now && etd - now < 3 * HOUR) gates.set(f.gate, `${f.airlineCode}${f.flightNumber}`);
    }
    const screenIds = this.engine.screensNearGates(gates.keys());
    return screenIds
      .map((id) => {
        const d = this.engine.latest(id);
        const screen = this.state.screens.get(id);
        const gate = screen?.nearestGates.find((g) => gates.has(g.gate))?.gate ?? null;
        return { screenId: id, screenName: screen?.name ?? id, gate, flight: gate ? (gates.get(gate) ?? null) : null, playing: d?.winner?.name ?? null, advertiser: d?.winner?.advertiser ?? null, source: d?.source ?? null, rule: d?.winningRule ?? null, simTime: d?.simTime ?? null };
      })
      .sort((a, b) => (a.gate ?? '').localeCompare(b.gate ?? ''));
  }

  private ensureAdvertiser(code: string): string {
    const existing = this.engine.advertisersList().find((a) => a.airlineCode === code);
    if (existing) return existing.id;
    const airline = this.db.prepare('SELECT name, brand_color FROM airlines WHERE code = ?').get(code);
    if (!airline) throw new Error('unknown airline');
    const advertiser = { id: `adv-${code.toLowerCase()}`, name: String(airline.name), kind: 'airline' as const, category: 'airline' as const, airlineCode: code, brandColor: String(airline.brand_color) };
    this.db.prepare('INSERT INTO advertisers (id, name, kind, category, airline_code, brand_color) VALUES (?, ?, ?, ?, ?, ?)').run(advertiser.id, advertiser.name, advertiser.kind, advertiser.category, advertiser.airlineCode, advertiser.brandColor);
    this.engine.upsertAdvertiser(advertiser);
    return advertiser.id;
  }

  private airlineGateZones(code: string): string[] {
    const zones = new Set<string>();
    for (const f of this.departures(code)) {
      const zone = f.gate ? this.state.gates.get(f.gate)?.zoneId : undefined;
      if (zone) zones.add(zone);
    }
    return [...zones];
  }

  gateMessages(code: string) {
    const advertiser = this.engine.advertisersList().find((a) => a.airlineCode === code);
    if (!advertiser) return [];
    return this.engine.campaigns.filter((c) => c.advertiserId === advertiser.id).map((c) => ({ id: c.id, name: c.name, status: c.status, start: c.schedule.start, end: c.schedule.end, gates: c.targeting.placement.gates, zones: c.targeting.placement.zoneIds.length }));
  }

  // Sponsored content on screens at this airline's gates, playing only during its own boarding windows
  createGateMessage(code: string, input: z.infer<typeof gateMessageSchema>) {
    const advertiserId = this.ensureAdvertiser(code);
    const advertiser = this.engine.advertiserById(advertiserId);
    const creative = this.campaigns.createCreative({ advertiserId, name: input.name, template: input.template, headline: input.headline, subline: input.subline, cta: input.cta, accentColor: advertiser?.brandColor ?? '#0f766e', imageAssetId: null, translations: {} });
    // Standing airline policies apply from the start of the operating day, so time jumps never hide them
    const now = Date.parse(`${this.clock.nowIso().slice(0, 10)}T00:00:00Z`);
    return this.campaigns.create({
      advertiserId,
      outletId: null,
      name: input.name,
      category: 'airline',
      creativeIds: [creative.id],
      targeting: {
        segmentWeights: { holiday: 0.5, business: 0.5, 'frequent-flyer': 0.4 },
        hardFilters: { internationalOnly: false, domesticOnly: false, destinationRegions: [], destinations: [], minDwellMinutes: 0, minCrowd: 0 },
        placement: { zoneIds: input.gates.length ? [] : this.airlineGateZones(code), screenIds: [], gates: input.gates },
        triggers: [{ kind: 'boarding', minDelayMinutes: null, destinations: [], boost: 1.4, mode: 'required', airlines: [code] }],
      },
      schedule: { start: new Date(now).toISOString(), end: new Date(now + 14 * 24 * HOUR).toISOString(), dailyHours: { from: 0, to: 24 } },
      budget: { total: input.budget, dailyCap: Math.max(10, Math.round(input.budget / 7)), frequencyCapPerScreenHour: 60 },
      offer: { headline: input.headline, discountPct: input.discountPct, promoValidity: 'linked-flight-boarding', fixedMinutes: null, perOfferCap: null, familyShare: false },
    });
  }

  goodwillRules(code: string) {
    return this.db
      .prepare('SELECT * FROM goodwill_rules WHERE airline_code = ? ORDER BY created_at DESC')
      .all(code)
      .map((r) => ({
        id: String(r.id),
        partnerAdvertiserId: String(r.partner_advertiser_id),
        partner: this.engine.advertiserById(String(r.partner_advertiser_id))?.name ?? '',
        campaignId: String(r.campaign_id),
        thresholdMinutes: Number(r.threshold_minutes),
        airlineSharePct: Number(r.airline_share_pct),
        enabled: Number(r.enabled) === 1,
        campaignStatus: this.engine.campaignById(String(r.campaign_id))?.status ?? 'unknown',
      }));
  }

  // A goodwill rule becomes a partner campaign that fires only when this airline's flight passes the delay threshold
  createGoodwill(code: string, input: z.infer<typeof goodwillInputSchema>) {
    const partner = this.engine.advertiserById(input.partnerAdvertiserId);
    if (!partner || partner.kind === 'airline') throw new Error('partner must be a retailer or F&B outlet');
    const airline = this.db.prepare('SELECT name FROM airlines WHERE code = ?').get(code);
    if (!airline) throw new Error('unknown airline');
    const creative = this.campaigns.createCreative({
      advertiserId: partner.id,
      name: `Goodwill ${code} x ${partner.name}`.slice(0, 80),
      template: 'goodwill',
      headline: input.headline,
      subline: `${String(airline.name)} and ${partner.name} are sorry for the wait`.slice(0, 140),
      cta: 'Scan for your voucher',
      accentColor: partner.brandColor,
      imageAssetId: null,
      translations: {},
    });
    // Standing airline policies apply from the start of the operating day, so time jumps never hide them
    const now = Date.parse(`${this.clock.nowIso().slice(0, 10)}T00:00:00Z`);
    const outlet = this.engine.outletsList().find((o) => o.advertiserId === partner.id);
    let campaign = this.campaigns.create({
      advertiserId: partner.id,
      outletId: outlet?.id ?? null,
      name: `Goodwill: ${code} delays over ${input.thresholdMinutes} min`,
      creativeIds: [creative.id],
      targeting: {
        segmentWeights: { business: 0.4, holiday: 0.4, vfr: 0.4, family: 0.4 },
        hardFilters: { internationalOnly: false, domesticOnly: false, destinationRegions: [], destinations: [], minDwellMinutes: 0, minCrowd: 0 },
        placement: { zoneIds: this.airlineGateZones(code), screenIds: [], gates: [] },
        triggers: [{ kind: 'delay', minDelayMinutes: input.thresholdMinutes, destinations: [], boost: 1.6, mode: 'required', airlines: [code] }],
      },
      schedule: { start: new Date(now).toISOString(), end: new Date(now + 30 * 24 * HOUR).toISOString(), dailyHours: { from: 0, to: 24 } },
      budget: { total: 5000, dailyCap: 400, frequencyCapPerScreenHour: 120 },
      offer: { headline: input.headline, discountPct: 100, promoValidity: 'linked-flight-boarding', fixedMinutes: null, perOfferCap: null, familyShare: true },
    });
    // The airline configured and co-funds this template voucher, so it is approved on creation
    campaign = this.campaigns.review(campaign.id, {
      decision: 'approved',
      checklist: { noCompetitorMarks: true, claimsSubstantiated: true, ageAppropriate: true, translationChecked: true, legibleAtDistance: true },
      notes: `Airline goodwill rule (${input.airlineSharePct}% funded by ${code})`,
      reviewer: `${String(airline.name)} station manager`,
    });
    if (!input.enabled) campaign = this.campaigns.setStatus(campaign.id, 'paused');
    const ruleId = `gw-${randomInt(36 ** 5).toString(36)}`;
    this.db.prepare('INSERT INTO goodwill_rules (id, airline_code, partner_advertiser_id, campaign_id, threshold_minutes, airline_share_pct, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(ruleId, code, partner.id, campaign.id, input.thresholdMinutes, input.airlineSharePct, input.enabled ? 1 : 0, this.clock.nowIso());
    return { id: ruleId, campaignId: campaign.id };
  }

  toggleGoodwill(code: string, ruleId: string, enabled: boolean) {
    const row = this.db.prepare('SELECT campaign_id FROM goodwill_rules WHERE id = ? AND airline_code = ?').get(ruleId, code);
    if (!row) return null;
    this.db.prepare('UPDATE goodwill_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, ruleId);
    this.campaigns.setStatus(String(row.campaign_id), enabled ? 'active' : 'paused');
    return { id: ruleId, enabled };
  }

  // Goodwill vouchers that actually reached screens for this airline's delayed flights
  goodwillActivity(code: string) {
    return this.engine
      .search({ source: 'delay-goodwill', limit: 300 })
      .filter((d) => d.candidates.some((c) => c.status === 'winner' && c.triggers.some((t) => t.kind === 'delay' && t.detail.startsWith(code))))
      .slice(0, 30)
      .map((d) => ({ screenId: d.screenId, simTime: d.simTime, campaign: d.winner?.name ?? '', rule: d.winningRule }));
  }
}

import { EventEmitter } from 'node:events';
import type { Advertiser, Campaign, Creative, Outlet, Segment } from '@dwellcast/shared';
import type { Database } from '../db/database.ts';
import type { Decision, DecisionEngine } from '../decision/DecisionEngine.ts';
import { Prng } from '../generator/prng.ts';
import type { SimClock } from '../sim/SimClock.ts';
import type { AirportState } from '../state/AirportState.ts';
import { createOfferToken, newPromoCode, readOfferToken, type OfferPayload } from './tokens.ts';

export class ClaimError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ClaimError';
  }
}

export interface RedemptionEvent {
  id: string;
  code: string;
  campaignId: string;
  campaignName: string;
  advertiserId: string;
  outletName: string | null;
  basketValue: number;
  segment: Segment | null;
  source: 'qr-phone' | 'family-share' | 'simulated';
  simTime: string;
}

interface Counters {
  scans: number;
  redemptions: number;
  revenue: number;
  phoneRedemptions: number;
}

const MINUTE = 60_000;
const round2 = (v: number) => Math.round(v * 100) / 100;

// Offer tokens, promo codes and redemptions; also simulates shoppers so dashboards tick between real phone scans
export class ClaimService extends EventEmitter {
  private readonly counters = new Map<string, Counters>();
  private readonly recent: RedemptionEvent[] = [];
  private readonly expected = new Map<string, { scans: number; redemptions: number; screenId: string; segment: Segment | null }>();
  private readonly prng: Prng;
  private sequence = 0;

  constructor(
    private readonly db: Database,
    private readonly clock: SimClock,
    private readonly state: AirportState,
    private readonly engine: DecisionEngine,
    private readonly secret: string,
    seed: number,
  ) {
    super();
    this.prng = new Prng(seed ^ 0x5ca1e);
    engine.on('play', (d: Decision) => this.onPlay(d));
  }

  // Lookups go through the engine so campaigns created or edited live are claimable at once
  private readonly campaigns = { get: (id: string): Campaign | undefined => this.engine.campaignById(id) };
  private readonly creatives = { get: (id: string): Creative | undefined => this.engine.creativeById(id) };
  private readonly outlets = { get: (id: string): Outlet | undefined => this.engine.outletById(id) };
  private readonly advertisers = { get: (id: string): Advertiser | undefined => this.engine.advertiserById(id) };

  private count(campaignId: string): Counters {
    const c = this.counters.get(campaignId) ?? { scans: 0, redemptions: 0, revenue: 0, phoneRedemptions: 0 };
    this.counters.set(campaignId, c);
    return c;
  }

  // Offer expiry follows the crowd: the main flight's gate close, or a fixed window
  private expiryFor(campaign: Campaign, decision: Decision, now: number): { expires: number; flightId: string | null } {
    if (campaign.offer.promoValidity === 'linked-flight-boarding') {
      for (const f of decision.crowd.flights) {
        const flight = this.state.flights.get(f.flightId);
        const gateClose = flight ? Date.parse(flight.estimatedTime ?? flight.scheduledTime) - 15 * MINUTE : 0;
        if (gateClose - now >= 10 * MINUTE) return { expires: gateClose, flightId: f.flightId };
      }
    }
    return { expires: now + (campaign.offer.fixedMinutes ?? 45) * MINUTE, flightId: null };
  }

  offerForScreen(screenId: string) {
    const decision = this.engine.latest(screenId);
    const campaign = decision?.winner ? this.campaigns.get(decision.winner.campaignId) : undefined;
    if (!decision || !campaign) return null;
    const now = this.clock.nowMs();
    const { expires, flightId } = this.expiryFor(campaign, decision, now);
    const token = createOfferToken(this.secret, { c: campaign.id, s: screenId, f: flightId, e: expires });
    const flight = flightId ? this.state.flights.get(flightId) : undefined;
    return { token, expiresAt: new Date(expires).toISOString(), linkedFlight: flight ? `${flight.airlineCode}${flight.flightNumber}` : null, campaignId: campaign.id, discountPct: campaign.offer.discountPct };
  }

  private verify(token: string): { payload: OfferPayload; campaign: Campaign } {
    const payload = readOfferToken(this.secret, token);
    if (!payload) throw new ClaimError('This offer link is not valid', 400);
    const campaign = this.campaigns.get(payload.c);
    if (!campaign) throw new ClaimError('This offer no longer exists', 404);
    if (this.clock.nowMs() > payload.e) throw new ClaimError('This offer has expired: the flight has boarded', 410);
    return { payload, campaign };
  }

  private offerView(payload: OfferPayload, campaign: Campaign) {
    const creative = campaign.creativeIds.map((id) => this.creatives.get(id)).find(Boolean) ?? null;
    const outlet = campaign.outletId ? this.outlets.get(campaign.outletId) : undefined;
    const flight = payload.f ? this.state.flights.get(payload.f) : undefined;
    return {
      campaignId: campaign.id,
      headline: campaign.offer.headline,
      discountPct: campaign.offer.discountPct,
      advertiser: this.advertisers.get(campaign.advertiserId)?.name ?? '',
      outlet: outlet ? { name: outlet.name, zoneId: outlet.zoneId, nearestGates: outlet.nearestGates } : null,
      creative,
      familyShare: campaign.offer.familyShare,
      expiresAt: new Date(payload.e).toISOString(),
      linkedFlight: flight ? { flight: `${flight.airlineCode}${flight.flightNumber}`, destination: flight.destination, gate: flight.gate } : null,
      simTime: this.clock.nowIso(),
    };
  }

  scan(token: string) {
    const { payload, campaign } = this.verify(token);
    this.count(campaign.id).scans++;
    return this.offerView(payload, campaign);
  }

  private dominantSegment(campaign: Campaign, screenId: string): Segment | null {
    const crowd = this.engine.latest(screenId)?.crowd;
    if (!crowd) return null;
    const shares = new Map(Object.entries(crowd.segments));
    let best: Segment | null = null;
    let bestValue = 0;
    for (const [segment, weight] of Object.entries(campaign.targeting.segmentWeights) as [Segment, number][]) {
      const value = weight * (shares.get(segment) ?? 0);
      if (value > bestValue) {
        best = segment;
        bestValue = value;
      }
    }
    return best;
  }

  private issue(campaign: Campaign, screenId: string, flightId: string | null, expires: number, parent: string | null, source: RedemptionEvent['source'], segment: Segment | null): RedemptionEvent {
    const now = this.clock.nowMs();
    const outlet = campaign.outletId ? this.outlets.get(campaign.outletId) : undefined;
    const basket = round2((outlet?.avgBasket ?? 30) * this.prng.float(0.7, 1.3) * (parent ? 0.8 : 1));
    const insertCode = this.db.prepare('INSERT INTO promo_codes (code, campaign_id, screen_id, linked_flight_id, parent_code, issued_at, expires_at, redeemed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    let code = '';
    for (let attempt = 0; attempt < 5 && !code; attempt++) {
      const candidate = newPromoCode(source === 'simulated' ? 'S' : '');
      try {
        insertCode.run(candidate, campaign.id, screenId, flightId, parent, new Date(now).toISOString(), new Date(expires).toISOString(), new Date(now).toISOString());
        code = candidate;
      } catch {
        code = '';
      }
    }
    if (!code) throw new ClaimError('Could not issue a code, please try again', 503);
    const id = `red-${Date.now().toString(36)}-${++this.sequence}`;
    this.db.prepare('INSERT INTO redemptions (id, code, campaign_id, outlet_id, redeemed_at, basket_value, dominant_segment) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, code, campaign.id, outlet?.id ?? null, new Date(now).toISOString(), basket, segment);
    const c = this.count(campaign.id);
    c.redemptions++;
    c.revenue = round2(c.revenue + basket);
    if (source !== 'simulated') c.phoneRedemptions++;
    this.engine.recordRedemption(campaign.id, screenId, segment, source === 'simulated');
    const event: RedemptionEvent = { id, code, campaignId: campaign.id, campaignName: campaign.name, advertiserId: campaign.advertiserId, outletName: outlet?.name ?? null, basketValue: basket, segment, source, simTime: new Date(now).toISOString() };
    this.recent.unshift(event);
    if (this.recent.length > 200) this.recent.length = 200;
    this.emit('redemption', event);
    return event;
  }

  claim(token: string) {
    const { payload, campaign } = this.verify(token);
    const cap = campaign.offer.perOfferCap;
    if (cap !== null && this.count(campaign.id).phoneRedemptions >= cap) throw new ClaimError('All codes for this offer have been claimed', 409);
    const event = this.issue(campaign, payload.s, payload.f, payload.e, null, 'qr-phone', this.dominantSegment(campaign, payload.s));
    return { code: event.code, expiresAt: new Date(payload.e).toISOString(), offer: this.offerView(payload, campaign), familyShare: campaign.offer.familyShare };
  }

  codeStatus(code: string) {
    const row = this.db.prepare('SELECT code, campaign_id, screen_id, linked_flight_id, parent_code, expires_at FROM promo_codes WHERE code = ?').get(code);
    if (!row) throw new ClaimError('Unknown code', 404);
    const child = this.db.prepare('SELECT code FROM promo_codes WHERE parent_code = ?').get(code);
    const expiresAt = String(row.expires_at);
    return { code, campaignId: String(row.campaign_id), expiresAt, expired: this.clock.nowMs() > Date.parse(expiresAt), familyCode: child ? String(child.code) : null, isFamilyCode: row.parent_code !== null, simTime: this.clock.nowIso() };
  }

  // One family code per claimed code, valid for the same flight window
  share(code: string) {
    const status = this.codeStatus(code);
    if (status.isFamilyCode) throw new ClaimError('Family codes cannot be shared again', 400);
    if (status.familyCode) return { code: status.familyCode, expiresAt: status.expiresAt };
    if (status.expired) throw new ClaimError('This code has expired', 410);
    const campaign = this.campaigns.get(status.campaignId);
    if (!campaign?.offer.familyShare) throw new ClaimError('This offer cannot be shared', 400);
    const row = this.db.prepare('SELECT screen_id, linked_flight_id FROM promo_codes WHERE code = ?').get(code);
    const event = this.issue(campaign, String(row?.screen_id ?? ''), row?.linked_flight_id ? String(row.linked_flight_id) : null, Date.parse(status.expiresAt), code, 'family-share', this.dominantSegment(campaign, String(row?.screen_id ?? '')));
    return { code: event.code, expiresAt: status.expiresAt };
  }

  // Expected scans and redemptions from each play, using the campaign's learned conversion rate
  private onPlay(d: Decision): void {
    if (!d.winner) return;
    const e = this.expected.get(d.winner.campaignId) ?? { scans: 0, redemptions: 0, screenId: d.screenId, segment: null };
    const rate = Math.min(0.01, Math.max(0.0001, this.engine.conversionRate(d.winner.campaignId)));
    e.scans += d.impressions * rate * 2.2;
    e.redemptions += d.impressions * rate;
    e.screenId = d.screenId;
    this.expected.set(d.winner.campaignId, e);
  }

  settleSimulated(): RedemptionEvent[] {
    const out: RedemptionEvent[] = [];
    const now = this.clock.nowMs();
    for (const [campaignId, e] of this.expected) {
      const campaign = this.campaigns.get(campaignId);
      if (!campaign) continue;
      const scans = Math.floor(e.scans);
      const redemptions = Math.floor(e.redemptions);
      this.count(campaignId).scans += scans;
      e.scans -= scans;
      e.redemptions -= redemptions;
      for (let i = 0; i < Math.min(redemptions, 20); i++) {
        out.push(this.issue(campaign, e.screenId, null, now + 45 * MINUTE, null, 'simulated', this.dominantSegment(campaign, e.screenId)));
      }
    }
    return out;
  }

  totals(campaignId: string): Counters {
    return this.counters.get(campaignId) ?? { scans: 0, redemptions: 0, revenue: 0, phoneRedemptions: 0 };
  }

  recentFor(advertiserId: string | null, limit = 20): RedemptionEvent[] {
    return this.recent.filter((r) => !advertiserId || r.advertiserId === advertiserId).slice(0, limit);
  }

  resetDay(): void {
    this.counters.clear();
    this.recent.length = 0;
    this.expected.clear();
  }
}

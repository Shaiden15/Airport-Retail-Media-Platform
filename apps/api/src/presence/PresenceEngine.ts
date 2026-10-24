import type { CrowdProfile, Flight, Screen, Segment } from '@dwellcast/shared';
import { SEGMENTS, cabinSegment, type Cabin } from '@dwellcast/shared';
import type { AirportConfig } from '../airportConfig.ts';
import { AIRCRAFT_BY_ICAO, AIRLINE_BY_CODE } from '../generator/reference.ts';
import { buildCrowdProfile } from '../profiles/crowdProfile.ts';
import type { AirportState, ZoneInfo } from '../state/AirportState.ts';
import { gatePresence, landsidePresence, minutesToBoarding, minutesToGateClose, retailPresence, securityPresence } from './curves.ts';
import { flightEvidence, queueEvidence, type EvidenceRef } from './evidence.ts';

export const WINDOW_MS = 5 * 60_000;

export interface Contribution {
  flightId: string;
  label: string;
  destination: string;
  international: boolean;
  gate: string | null;
  delayMinutes: number;
  pax: number;
  share: number;
  minutesToBoarding: number;
  evidenceId: string;
}

export interface RankedShare {
  code: string;
  share: number;
}

// Aggregated audience in front of a zone or screen: shares only, never individuals
export interface Crowd {
  at: string;
  windowStart: string;
  pax: number;
  paxNext30: number;
  internationalShare: number;
  medianDwellMinutes: number;
  segments: Record<Segment, number>;
  tripPurpose: CrowdProfile['tripPurpose'];
  party: CrowdProfile['party'];
  age: CrowdProfile['age'];
  topDestinations: RankedShare[];
  topNationalities: RankedShare[];
  flights: Contribution[];
  queue: { occupancy: number; waitTimeSec: number } | null;
  evidence: EvidenceRef[];
}

export interface ZonePresence extends Crowd {
  zoneId: string;
  zoneName: string;
  kind: ZoneInfo['kind'];
  terminalId: string;
}

interface Weighted {
  flight: Flight;
  weight: number;
}

const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits;

function profileSegments(p: CrowdProfile): Map<Segment, number> {
  const m = new Map<Segment, number>();
  for (const [k, v] of Object.entries(p.tripPurpose)) m.set(k as Segment, v);
  for (const [k, v] of Object.entries(p.party)) m.set(k as Segment, v);
  for (const [k, v] of Object.entries(p.age)) m.set(k as Segment, v);
  for (const [k, v] of Object.entries(p.cabin) as [Cabin, number][]) m.set(cabinSegment(k), v);
  m.set('international', p.international ? 1 : 0);
  m.set('domestic', p.international ? 0 : 1);
  m.set('frequent-flyer', p.frequentFlyerShare);
  m.set('female', p.gender.female);
  m.set('male', p.gender.male);
  return m;
}

function emptySegments(): Map<Segment, number> {
  return new Map(SEGMENTS.map((s) => [s, 0]));
}

function weightedMedian(values: { value: number; weight: number }[]): number {
  const sorted = values.filter((v) => v.weight > 0).sort((a, b) => a.value - b.value);
  const total = sorted.reduce((s, v) => s + v.weight, 0);
  let acc = 0;
  for (const v of sorted) {
    acc += v.weight;
    if (acc >= total / 2) return Math.round(v.value);
  }
  return 0;
}

export class PresenceEngine {
  private readonly profiles = new Map<string, { key: string; profile: CrowdProfile }>();
  private readonly zoneCache = new Map<string, { key: string; value: ZonePresence }>();
  private readonly gatesByZone = new Map<string, Set<string>>();
  private readonly zoneScreenCache = new Map<string, { key: string; value: Crowd }>();
  private readonly screensPerZone = new Map<string, number>();

  constructor(
    private readonly state: AirportState,
    private readonly airport: AirportConfig,
  ) {
    this.refreshTopology();
  }

  // Rebuilds gate and screen groupings after master data edits
  refreshTopology(): void {
    this.gatesByZone.clear();
    this.screensPerZone.clear();
    this.zoneCache.clear();
    this.zoneScreenCache.clear();
    for (const gate of this.state.gates.values()) {
      const set = this.gatesByZone.get(gate.zoneId) ?? new Set<string>();
      set.add(gate.id);
      this.gatesByZone.set(gate.zoneId, set);
    }
    for (const s of this.state.screens.values()) this.screensPerZone.set(s.zoneId, (this.screensPerZone.get(s.zoneId) ?? 0) + 1);
  }

  profile(flight: Flight): CrowdProfile {
    const date = flight.scheduledTime.slice(0, 10);
    const key = `${flight.paxCount}|${date}`;
    const cached = this.profiles.get(flight.id);
    if (cached?.key === key) return cached.profile;
    const destination = flight.direction === 'departure' ? flight.destination : flight.origin;
    const seats = flight.seatCapacity;
    const profile = buildCrowdProfile({
      flightId: flight.id,
      destination,
      international: flight.international,
      airlineModel: AIRLINE_BY_CODE.get(flight.airlineCode)?.model ?? 'low-cost',
      seats,
      businessSeats: Math.min(seats, AIRCRAFT_BY_ICAO.get(flight.aircraftType)?.seats.business ?? 0),
      paxCount: flight.paxCount,
      departureUtc: flight.scheduledTime,
      utcOffsetMinutes: this.airport.utcOffsetMinutes,
      festival: this.airport.festivalDates.includes(date),
    });
    this.profiles.set(flight.id, { key, profile });
    return profile;
  }

  private presenceOf(kind: ZoneInfo['kind'], flight: Flight, atMs: number): number {
    switch (kind) {
      case 'gate-area':
        return gatePresence(flight, atMs);
      case 'retail':
        return retailPresence(flight, atMs);
      case 'landside':
        return landsidePresence(flight, atMs);
      case 'security':
        return securityPresence(flight, atMs);
    }
  }

  // Folds weighted flights into one aggregated crowd; weight already includes distance or zone share
  aggregate(items: Weighted[], kind: ZoneInfo['kind'], atMs: number, queue: Crowd['queue'], queueRefs: EvidenceRef[]): Crowd {
    const segments = emptySegments();
    const destinations = new Map<string, number>();
    const nationalities = new Map<string, number>();
    const dwell: { value: number; weight: number }[] = [];
    const flights: Contribution[] = [];
    const evidence: EvidenceRef[] = [...queueRefs];
    let total = 0;
    let international = 0;
    let next30 = 0;

    for (const { flight, weight } of items) {
      const presence = this.presenceOf(kind, flight, atMs);
      const ahead = [10, 20, 30].reduce((s, m) => s + this.presenceOf(kind, flight, atMs + m * 60_000), 0) / 3;
      next30 += flight.paxCount * ahead * weight;
      const pax = flight.paxCount * presence * weight;
      if (pax < 0.5) continue;
      const profile = this.profile(flight);
      for (const [segment, share] of profileSegments(profile)) segments.set(segment, (segments.get(segment) ?? 0) + share * pax);
      const dest = flight.direction === 'departure' ? flight.destination : flight.origin;
      destinations.set(dest, (destinations.get(dest) ?? 0) + pax);
      for (const n of profile.nationalities) nationalities.set(n.code, (nationalities.get(n.code) ?? 0) + n.share * pax);
      const toBoard = minutesToBoarding(flight, atMs);
      dwell.push({ value: Math.max(0, minutesToGateClose(flight, atMs)), weight: pax });
      total += pax;
      if (flight.international) international += pax;
      const ref = flightEvidence(flight);
      evidence.push(ref);
      flights.push({
        flightId: flight.id,
        label: `${flight.airlineCode}${flight.flightNumber}`,
        destination: dest,
        international: flight.international,
        gate: flight.gate,
        delayMinutes: flight.delayMinutes,
        pax: Math.round(pax),
        share: 0,
        minutesToBoarding: Math.round(toBoard),
        evidenceId: ref.id,
      });
    }

    const queuePax = queue?.occupancy ?? 0;
    const crowdPax = total + (kind === 'security' ? queuePax : 0);
    const shareOf = (v: number) => (total > 0 ? round(v / total) : 0);
    const rank = (m: Map<string, number>, denominator: number) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, v]) => ({ code, share: denominator > 0 ? round(v / denominator) : 0 }));
    flights.sort((a, b) => b.pax - a.pax);
    for (const f of flights) f.share = shareOf(f.pax);
    const seg = Object.fromEntries([...segments.entries()].map(([k, v]) => [k, shareOf(v)])) as Record<Segment, number>;
    const windowStart = Math.floor(atMs / WINDOW_MS) * WINDOW_MS;

    return {
      at: new Date(atMs).toISOString(),
      windowStart: new Date(windowStart).toISOString(),
      pax: Math.round(crowdPax),
      paxNext30: Math.round(next30 + (kind === 'security' ? queuePax : 0)),
      internationalShare: shareOf(international),
      medianDwellMinutes: weightedMedian(dwell),
      segments: seg,
      tripPurpose: { business: seg.business, holiday: seg.holiday, vfr: seg.vfr, student: seg.student, religious: seg.religious },
      party: { solo: seg.solo, couple: seg.couple, family: seg.family, group: seg.group },
      age: { u12: seg.u12, '12-17': seg['12-17'], '18-24': seg['18-24'], '25-34': seg['25-34'], '35-44': seg['35-44'], '45-54': seg['45-54'], '55+': seg['55+'] },
      topDestinations: rank(destinations, total),
      topNationalities: rank(nationalities, total),
      flights: flights.slice(0, 12),
      queue,
      evidence,
    };
  }

  private zoneItems(zone: ZoneInfo): Weighted[] {
    if (zone.kind === 'gate-area') {
      const gates = this.gatesByZone.get(zone.id) ?? new Set<string>();
      return this.state.departuresAtGates(gates).map((flight) => ({ flight, weight: 1 }));
    }
    const terminalFlights = [...this.state.flights.values()].filter((f) => f.terminalId === zone.terminalId);
    const retailZones = [...this.state.zones.values()].filter((z) => z.terminalId === zone.terminalId && z.kind === zone.kind).length || 1;
    return terminalFlights.map((flight) => ({ flight, weight: 1 / retailZones }));
  }

  private zoneQueue(zone: ZoneInfo): { queue: Crowd['queue']; refs: EvidenceRef[] } {
    if (zone.kind !== 'security') return { queue: null, refs: [] };
    const measurements = [...this.state.queues.values()].filter((m) => m.zoneId === zone.id);
    if (!measurements.length) return { queue: null, refs: [] };
    return {
      queue: { occupancy: measurements.reduce((s, m) => s + m.occupancy, 0), waitTimeSec: Math.max(...measurements.map((m) => m.waitTimeSec)) },
      refs: measurements.map(queueEvidence),
    };
  }

  // Expected passengers passing through a zone over a window: each flight counted once at its peak share
  zoneFlow(zoneId: string, fromMs: number, minutes: number, stepMinutes = 10) {
    const zone = this.state.zones.get(zoneId);
    if (!zone) return null;
    const steps = Math.max(1, Math.floor(minutes / stepMinutes));
    const times = Array.from({ length: steps + 1 }, (_, i) => fromMs + i * stepMinutes * 60_000);
    let unique = 0;
    let international = 0;
    const destinations = new Map<string, number>();
    const nationalities = new Map<string, number>();
    for (const { flight, weight } of this.zoneItems(zone)) {
      const peak = Math.max(...times.map((t) => this.presenceOf(zone.kind, flight, t)));
      const pax = flight.paxCount * peak * weight;
      if (pax < 0.5) continue;
      unique += pax;
      if (flight.international) international += pax;
      const dest = flight.direction === 'departure' ? flight.destination : flight.origin;
      destinations.set(dest, (destinations.get(dest) ?? 0) + pax);
      for (const n of this.profile(flight).nationalities) nationalities.set(n.code, (nationalities.get(n.code) ?? 0) + n.share * pax);
    }
    const rank = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, v]) => ({ code, share: unique > 0 ? round(v / unique) : 0 }));
    return {
      zoneId,
      zoneName: zone.name,
      fromIso: new Date(fromMs).toISOString(),
      minutes,
      uniquePax: Math.round(unique),
      internationalShare: unique > 0 ? round(international / unique) : 0,
      topDestinations: rank(destinations),
      topNationalities: rank(nationalities),
      series: times.map((t) => ({ at: new Date(t).toISOString(), pax: this.zone(zoneId, t)?.pax ?? 0 })),
    };
  }

  zone(zoneId: string, atMs: number): ZonePresence | null {
    const zone = this.state.zones.get(zoneId);
    if (!zone) return null;
    const key = `${atMs}|${this.state.version}`;
    const cached = this.zoneCache.get(zoneId);
    if (cached?.key === key) return cached.value;
    const { queue, refs } = this.zoneQueue(zone);
    const crowd = this.aggregate(this.zoneItems(zone), zone.kind, atMs, queue, refs);
    const value: ZonePresence = { zoneId, zoneName: zone.name, kind: zone.kind, terminalId: zone.terminalId, ...crowd };
    this.zoneCache.set(zoneId, { key, value });
    return value;
  }

  allZones(atMs: number): ZonePresence[] {
    return [...this.state.zones.keys()].flatMap((id) => {
      const z = this.zone(id, atMs);
      return z ? [z] : [];
    });
  }

  // Crowd in front of one screen: gate screens weight nearby gates by distance, other screens take a share of their zone
  screen(screen: Screen, atMs: number): Crowd {
    const zone = this.state.zones.get(screen.zoneId);
    const kind = zone?.kind ?? 'retail';
    if (kind === 'gate-area') {
      const distance = new Map(screen.nearestGates.map((g) => [g.gate, g.distanceM]));
      const flights = this.state.departuresAtGates(new Set(distance.keys()));
      const items = flights.map((flight) => ({ flight, weight: Math.exp(-(distance.get(flight.gate ?? '') ?? 400) / 120) }));
      return this.aggregate(items, kind, atMs, null, []);
    }
    if (!zone) return this.aggregate([], kind, atMs, null, []);
    // Every screen in a non-gate zone sees the same crowd, so compute it once per zone and slot
    const key = `${atMs}|${this.state.version}`;
    const cached = this.zoneScreenCache.get(zone.id);
    if (cached?.key === key) return cached.value;
    const screensInZone = this.screensPerZone.get(zone.id) ?? 1;
    const items = this.zoneItems(zone).map(({ flight, weight }) => ({ flight, weight: (weight * 2.5) / screensInZone }));
    const { queue, refs } = this.zoneQueue(zone);
    const value = this.aggregate(items, kind, atMs, queue, refs);
    this.zoneScreenCache.set(zone.id, { key, value });
    return value;
  }
}

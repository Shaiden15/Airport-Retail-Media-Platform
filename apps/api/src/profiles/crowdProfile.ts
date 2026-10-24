import {
  AGE_BANDS,
  PARTY_TYPES,
  TRIP_PURPOSES,
  type AgeBand,
  type CrowdProfile,
  type PartyType,
  type TripPurpose,
} from '@dwellcast/shared';
import { Prng } from '../generator/prng.ts';
import { CITY_BY_CODE } from '../generator/reference.ts';

export const PROFILE_MODEL_VERSION = 'crowd-rules-1.0';

export interface ProfileInput {
  flightId: string;
  destination: string;
  international: boolean;
  airlineModel: 'full-service' | 'low-cost';
  seats: number;
  businessSeats: number;
  paxCount: number;
  departureUtc: string;
  utcOffsetMinutes: number;
  festival: boolean;
}

// Party mix for each trip purpose
const PARTY_BY_PURPOSE: ReadonlyMap<TripPurpose, readonly number[]> = new Map([
  ['business', [0.78, 0.12, 0.03, 0.07]],
  ['holiday', [0.14, 0.36, 0.38, 0.12]],
  ['vfr', [0.3, 0.22, 0.4, 0.08]],
  ['student', [0.8, 0.1, 0.02, 0.08]],
  ['religious', [0.1, 0.25, 0.25, 0.4]],
]);

// Age bands u12, 12-17, 18-24, 25-34, 35-44, 45-54, 55+ for each trip purpose
const AGE_BY_PURPOSE: ReadonlyMap<TripPurpose, readonly number[]> = new Map([
  ['business', [0, 0, 0.05, 0.32, 0.35, 0.2, 0.08]],
  ['holiday', [0.1, 0.07, 0.12, 0.24, 0.22, 0.14, 0.11]],
  ['vfr', [0.09, 0.07, 0.1, 0.2, 0.2, 0.16, 0.18]],
  ['student', [0, 0.06, 0.72, 0.18, 0.03, 0.01, 0]],
  ['religious', [0.03, 0.04, 0.06, 0.14, 0.18, 0.23, 0.32]],
]);

const FEMALE_BY_PURPOSE: ReadonlyMap<TripPurpose, number> = new Map([
  ['business', 0.38],
  ['holiday', 0.51],
  ['vfr', 0.53],
  ['student', 0.47],
  ['religious', 0.5],
]);

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function normalise(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  return values.map((v) => Math.round((v / total) * 1000) / 1000);
}

function toShares<K extends string>(keys: readonly K[], values: readonly number[]): Record<K, number> {
  return Object.fromEntries(keys.map((key, i) => [key, values.at(i) ?? 0])) as Record<K, number>;
}

function mix(purpose: ReadonlyMap<TripPurpose, number>, table: ReadonlyMap<TripPurpose, readonly number[]>, size: number): number[] {
  const out = new Array<number>(size).fill(0);
  for (const [p, share] of purpose) {
    const row = table.get(p) ?? [];
    row.forEach((v, i) => {
      out.splice(i, 1, (out.at(i) ?? 0) + v * share);
    });
  }
  return out;
}

export function buildCrowdProfile(input: ProfileInput): CrowdProfile {
  const city = CITY_BY_CODE.get(input.destination);
  if (!city) throw new Error(`no reference data for ${input.destination}`);
  const prng = new Prng(fnv1a(input.flightId));
  const local = new Date(Date.parse(input.departureUtc) + input.utcOffsetMinutes * 60_000);
  const hour = local.getUTCHours();
  const weekday = local.getUTCDay();
  const workday = weekday >= 1 && weekday <= 5;

  const cityPurpose = new Map(Object.entries(city.purpose));
  const purposeRaw = new Map<TripPurpose, number>(TRIP_PURPOSES.map((p) => [p, (cityPurpose.get(p) ?? 0) * prng.jitter(0.08)]));
  const scale = (p: TripPurpose, factor: number) => purposeRaw.set(p, (purposeRaw.get(p) ?? 0) * factor);
  if (workday && hour >= 5 && hour <= 9) scale('business', 1.7);
  if (workday && hour >= 17 && hour <= 20) scale('business', 1.2);
  if (!workday || (weekday === 5 && hour >= 15)) {
    scale('holiday', 1.4);
    scale('business', 0.7);
  }
  if (input.festival) {
    scale('vfr', 1.4);
    scale('holiday', 1.1);
  }
  if (input.airlineModel === 'low-cost') scale('business', 0.75);
  const purposeValues = normalise(TRIP_PURPOSES.map((p) => purposeRaw.get(p) ?? 0));
  const purpose = new Map<TripPurpose, number>(TRIP_PURPOSES.map((p, i) => [p, purposeValues.at(i) ?? 0]));

  const partyRaw = mix(purpose, PARTY_BY_PURPOSE, PARTY_TYPES.length);
  if (input.festival) partyRaw.splice(2, 1, (partyRaw.at(2) ?? 0) * 1.25);
  const party = normalise(partyRaw.map((v) => v * prng.jitter(0.06)));
  const age = normalise(mix(purpose, AGE_BY_PURPOSE, AGE_BANDS.length).map((v) => v * prng.jitter(0.06)));

  let female = 0;
  for (const [p, share] of purpose) female += (FEMALE_BY_PURPOSE.get(p) ?? 0.5) * share;
  female = Math.round(Math.min(0.7, Math.max(0.3, female * prng.jitter(0.04))) * 1000) / 1000;

  const businessPurpose = purpose.get('business') ?? 0;
  const businessCapacity = input.businessSeats / input.seats;
  const businessCabin = Math.round(Math.min(businessCapacity, businessCapacity * (0.55 + businessPurpose)) * 1000) / 1000;
  const frequentFlyer = Math.round(Math.min(0.6, (0.06 + businessPurpose * 0.5) * (input.airlineModel === 'low-cost' ? 0.6 : 1)) * 1000) / 1000;

  const ranked = (list: readonly [string, number][]) =>
    list.map(([code, share]) => ({ code, share: Math.round(Math.min(1, share * prng.jitter(0.05)) * 1000) / 1000 })).sort((a, b) => b.share - a.share);

  return {
    flightId: input.flightId,
    paxCount: input.paxCount,
    international: input.international,
    destination: input.destination,
    region: city.region,
    tripPurpose: toShares<TripPurpose>(TRIP_PURPOSES, purposeValues),
    party: toShares<PartyType>(PARTY_TYPES, party),
    age: toShares<AgeBand>(AGE_BANDS, age),
    gender: { female, male: Math.round((1 - female) * 1000) / 1000 },
    cabin: { economy: Math.round((1 - businessCabin) * 1000) / 1000, 'premium-economy': 0, business: businessCabin },
    frequentFlyerShare: frequentFlyer,
    nationalities: ranked(city.nationalities),
    languages: ranked(city.languages),
    festivalPeriod: input.festival,
    modelVersion: PROFILE_MODEL_VERSION,
  };
}

import { z } from 'zod';

export const TRIP_PURPOSES = ['business', 'holiday', 'vfr', 'student', 'religious'] as const;
export const PARTY_TYPES = ['solo', 'couple', 'family', 'group'] as const;
export const AGE_BANDS = ['u12', '12-17', '18-24', '25-34', '35-44', '45-54', '55+'] as const;
export const CABINS = ['economy', 'premium-economy', 'business'] as const;

export type TripPurpose = (typeof TRIP_PURPOSES)[number];
export type PartyType = (typeof PARTY_TYPES)[number];
export type AgeBand = (typeof AGE_BANDS)[number];
export type Cabin = (typeof CABINS)[number];

const share = z.number().min(0).max(1);

function sharesOf<T extends string>(keys: readonly T[]) {
  return z.object(Object.fromEntries(keys.map((k) => [k, share])) as Record<T, typeof share>);
}

export const tripPurposeSharesSchema = sharesOf(TRIP_PURPOSES);
export const partySharesSchema = sharesOf(PARTY_TYPES);
export const ageSharesSchema = sharesOf(AGE_BANDS);
export const cabinSharesSchema = sharesOf(CABINS);

export const rankedShareSchema = z.object({ code: z.string(), share });

// Aggregated audience shares for one flight; never data about an individual passenger
export const crowdProfileSchema = z.object({
  flightId: z.string(),
  paxCount: z.number().int().nonnegative(),
  international: z.boolean(),
  destination: z.string().length(3),
  region: z.string(),
  tripPurpose: tripPurposeSharesSchema,
  party: partySharesSchema,
  age: ageSharesSchema,
  gender: z.object({ female: share, male: share }),
  cabin: cabinSharesSchema,
  frequentFlyerShare: share,
  nationalities: z.array(rankedShareSchema).max(3),
  languages: z.array(rankedShareSchema).max(3),
  festivalPeriod: z.boolean(),
  modelVersion: z.string(),
});
export type CrowdProfile = z.infer<typeof crowdProfileSchema>;

// Segment keys advertisers can weight; each maps to one share in a crowd profile
export const SEGMENTS = [
  ...TRIP_PURPOSES,
  ...PARTY_TYPES,
  ...AGE_BANDS,
  ...CABINS,
  'international',
  'domestic',
  'frequent-flyer',
  'female',
  'male',
] as const;
export const segmentSchema = z.enum(SEGMENTS);
export type Segment = z.infer<typeof segmentSchema>;

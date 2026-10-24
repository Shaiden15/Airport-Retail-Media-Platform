import { describe, expect, it } from 'vitest';
import { buildCrowdProfile, type ProfileInput } from './crowdProfile.ts';

const base: ProfileInput = {
  flightId: 'XD100-2026-11-02-D',
  destination: 'NGV',
  international: false,
  airlineModel: 'full-service',
  seats: 186,
  businessSeats: 12,
  paxCount: 160,
  departureUtc: '2026-11-02T07:00:00Z',
  utcOffsetMinutes: 0,
  festival: false,
};

const sum = (shares: Record<string, number>) => Object.values(shares).reduce((s, v) => s + v, 0);
const top = (shares: Record<string, number>) => Object.entries(shares).sort((a, b) => b[1] - a[1])[0]?.[0];

describe('crowd profile rules', () => {
  it('Monday 07:00 domestic flight skews to business travellers aged 25-44', () => {
    const p = buildCrowdProfile(base);
    expect(top(p.tripPurpose)).toBe('business');
    expect(p.age['25-34'] + p.age['35-44']).toBeGreaterThan(0.45);
    expect(p.party.solo).toBeGreaterThan(p.party.family);
  });

  it('Friday evening holiday route skews to families and couples', () => {
    const p = buildCrowdProfile({ ...base, flightId: 'XD881-2026-11-06-D', destination: 'SMG', international: true, departureUtc: '2026-11-06T19:00:00Z' });
    expect(top(p.tripPurpose)).toBe('holiday');
    expect(p.party.family + p.party.couple).toBeGreaterThan(p.party.solo * 2);
  });

  it('festival periods raise the family share', () => {
    const plain = buildCrowdProfile({ ...base, departureUtc: '2026-11-07T12:00:00Z' });
    const festive = buildCrowdProfile({ ...base, departureUtc: '2026-11-07T12:00:00Z', festival: true });
    expect(festive.party.family).toBeGreaterThan(plain.party.family);
  });

  it('only contains aggregated shares that each sum to about one', () => {
    const p = buildCrowdProfile(base);
    for (const shares of [p.tripPurpose, p.party, p.age, p.cabin]) expect(sum(shares)).toBeCloseTo(1, 1);
    expect(p.gender.female + p.gender.male).toBeCloseTo(1, 2);
    expect(p.nationalities.length).toBeLessThanOrEqual(3);
    expect(p.modelVersion).toBe('crowd-rules-1.0');
  });

  it('never puts more passengers in business cabin than there are business seats', () => {
    const p = buildCrowdProfile({ ...base, businessSeats: 0 });
    expect(p.cabin.business).toBe(0);
  });

  it('is deterministic per flight', () => {
    expect(buildCrowdProfile(base)).toEqual(buildCrowdProfile(base));
  });
});

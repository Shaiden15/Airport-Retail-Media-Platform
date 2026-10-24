import { describe, expect, it } from 'vitest';
import { CABINS, SEGMENTS, cabinSegment } from './profile.ts';

describe('audience segments', () => {
  it('keeps every segment key unique', () => {
    expect(new Set(SEGMENTS).size).toBe(SEGMENTS.length);
  });

  it('names the business cabin apart from business travel', () => {
    expect(cabinSegment('business')).toBe('business-cabin');
    expect(SEGMENTS).toContain('business');
    expect(SEGMENTS).toContain('business-cabin');
    for (const cabin of CABINS) expect(SEGMENTS).toContain(cabinSegment(cabin));
  });
});

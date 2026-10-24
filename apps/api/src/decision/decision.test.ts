import { describe, expect, it } from 'vitest';
import { SEGMENTS, type Segment } from '@dwellcast/shared';
import { audienceMatch, score, unitHash } from './scorer.ts';
import { validateProposal } from './validator.ts';
import { DEFAULT_SETTINGS } from './settings.ts';
import { AirportState } from '../state/AirportState.ts';

const shares = (patch: Partial<Record<Segment, number>>) => ({ ...Object.fromEntries(SEGMENTS.map((s) => [s, 0])), ...patch }) as Record<Segment, number>;

describe('scorer', () => {
  it('audience match is a weighted average of group affinities in 0..1', () => {
    const crowd = shares({ international: 1, holiday: 0.6, business: 0.4, family: 0.5, solo: 0.5 });
    expect(audienceMatch({ international: 1 }, crowd).match).toBe(1);
    expect(audienceMatch({ holiday: 1 }, crowd).match).toBe(0.6);
    expect(audienceMatch({ holiday: 1, family: 1 }, crowd).match).toBe(0.55);
    expect(audienceMatch({}, crowd).match).toBe(0);
  });

  it('a boost compounds attention without exceeding 1, matching the spec example shape', () => {
    const s = score({ weights: { holiday: 1 }, shares: shares({ holiday: 0.71 }), boost: 1.5, learnLift: 1, pacing: 1 });
    expect(s.match).toBe(0.71);
    expect(s.score).toBeCloseTo(1 - 0.29 ** 1.5, 4);
    expect(score({ weights: { holiday: 1 }, shares: shares({ holiday: 0.95 }), boost: 3, learnLift: 1.15, pacing: 1.2 }).score).toBeLessThanOrEqual(1.2);
  });

  it('higher boost or better match never lowers the score', () => {
    const base = { weights: { holiday: 1 }, learnLift: 1, pacing: 1 };
    const low = score({ ...base, shares: shares({ holiday: 0.4 }), boost: 1 }).score;
    expect(score({ ...base, shares: shares({ holiday: 0.5 }), boost: 1 }).score).toBeGreaterThan(low);
    expect(score({ ...base, shares: shares({ holiday: 0.4 }), boost: 1.5 }).score).toBeGreaterThan(low);
  });

  it('exploration hash is deterministic and spread over 0..1', () => {
    expect(unitHash('SCR-001|100')).toBe(unitHash('SCR-001|100'));
    const values = Array.from({ length: 1000 }, (_, i) => unitHash(`SCR-${i}|7`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(values.filter((v) => v < 0.05).length).toBeGreaterThan(20);
  });
});

describe('validator', () => {
  const state = new AirportState([], [], []);
  const known = new Map([['platform:campaign:c1', { id: 'platform:campaign:c1', kind: 'campaign' as const, subjectId: 'c1', source: 'platform' as const, adapter: 'platform-db', observedAt: '2026-11-06T00:00:00Z' }]]);
  const loggedInputs = { weights: { holiday: 1 }, shares: shares({ holiday: 0.5 }), boost: 1, learnLift: 1, pacing: 1 };
  const base = { state, known, simMs: Date.parse('2026-11-06T14:10:00Z'), settings: DEFAULT_SETTINGS, filterReason: null, loggedInputs };
  const proposal = { agent: 't', campaignId: 'c1', claimedScore: score(loggedInputs).score, citedEvidence: ['platform:campaign:c1'], rationale: '' };

  it('accepts a proposal whose facts exist, rules pass and score reproduces', () => {
    expect(validateProposal({ ...base, proposal }).accepted).toBe(true);
  });

  it('rejects evidence that does not exist in any feed', () => {
    const r = validateProposal({ ...base, proposal: { ...proposal, citedEvidence: ['aidx:FAKE#ZZ1'] } });
    expect(r.accepted).toBe(false);
    expect(r.checks.find((c) => c.name === 'evidence-exists')?.passed).toBe(false);
  });

  it('rejects a campaign that fails a hard rule', () => {
    expect(validateProposal({ ...base, proposal, filterReason: 'placement' }).accepted).toBe(false);
  });

  it('rejects a score that cannot be reproduced from the logged inputs', () => {
    const r = validateProposal({ ...base, proposal: { ...proposal, claimedScore: 0.99 } });
    expect(r.checks.find((c) => c.name === 'score-reproducible')?.passed).toBe(false);
  });

  it('rejects stale feed evidence', () => {
    const staleKnown = new Map([['acris:q1', { id: 'acris:q1', kind: 'queue' as const, subjectId: 'q1', source: 'acris' as const, adapter: 'acris', observedAt: '2026-11-06T12:00:00Z' }]]);
    const queueState = new AirportState([], [], []);
    queueState.applyMeasurement({ id: 'q1', queueId: 'Q', checkpointId: 'C', zoneId: 'Z', occupancy: 1, waitTimeSec: 1, projectedWaitTimeSec: 1, throughputPerHour: 1, periodStart: '2026-11-06T11:55:00Z', periodEnd: '2026-11-06T12:00:00Z', provenance: { source: 'acris', sourceRef: 'q1', adapter: 'acris', observedAt: '2026-11-06T12:00:00Z', receivedAt: '2026-11-06T12:00:00Z' } });
    const r = validateProposal({ ...base, state: queueState, known: staleKnown, proposal: { ...proposal, citedEvidence: ['acris:q1'] } });
    expect(r.checks.find((c) => c.name === 'evidence-fresh')?.passed).toBe(false);
  });
});

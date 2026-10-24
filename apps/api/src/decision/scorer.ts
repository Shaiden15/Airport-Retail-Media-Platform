import { AGE_BANDS, CABINS, PARTY_TYPES, TRIP_PURPOSES, type Segment } from '@dwellcast/shared';

// Deterministic, documented scoring (docs/decision-pipeline.md). Same inputs always give the same score

export const SEGMENT_GROUPS: readonly (readonly Segment[])[] = [
  ['international', 'domestic'],
  TRIP_PURPOSES,
  PARTY_TYPES,
  AGE_BANDS,
  CABINS,
  ['female', 'male'],
  ['frequent-flyer'],
];

export interface ScoreInputs {
  weights: Partial<Record<Segment, number>>;
  shares: Record<Segment, number>;
  boost: number;
  learnLift: number;
  pacing: number;
}

export interface ScoreBreakdown {
  match: number;
  groups: { segments: string; weight: number; affinity: number }[];
  adjusted: number;
  boost: number;
  learnLift: number;
  pacing: number;
  score: number;
}

const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

export function audienceMatch(weights: Partial<Record<Segment, number>>, shares: Record<Segment, number>): { match: number; groups: ScoreBreakdown['groups'] } {
  const w = new Map(Object.entries(weights) as [Segment, number][]);
  const s = new Map(Object.entries(shares) as [Segment, number][]);
  const groups: ScoreBreakdown['groups'] = [];
  let numerator = 0;
  let denominator = 0;
  for (const group of SEGMENT_GROUPS) {
    const weighted = group.filter((seg) => (w.get(seg) ?? 0) > 0);
    if (!weighted.length) continue;
    const groupWeight = Math.max(...weighted.map((seg) => w.get(seg) ?? 0));
    const affinity = Math.min(1, weighted.reduce((sum, seg) => sum + (w.get(seg) ?? 0) * (s.get(seg) ?? 0), 0) / groupWeight);
    groups.push({ segments: weighted.join('+'), weight: groupWeight, affinity: r4(affinity) });
    numerator += groupWeight * affinity;
    denominator += groupWeight;
  }
  return { match: denominator > 0 ? r4(numerator / denominator) : 0, groups };
}

export function score(inputs: ScoreInputs): ScoreBreakdown {
  const { match, groups } = audienceMatch(inputs.weights, inputs.shares);
  const adjusted = Math.min(1, match * inputs.learnLift);
  // A boost compounds the chance of attention instead of pushing the score past 1
  const boosted = 1 - (1 - adjusted) ** inputs.boost;
  return {
    match,
    groups,
    adjusted: r4(adjusted),
    boost: inputs.boost,
    learnLift: r4(inputs.learnLift),
    pacing: r4(inputs.pacing),
    score: r4(boosted * inputs.pacing),
  };
}

// Deterministic 0..1 hash used for exploration so replays make identical choices
export function unitHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

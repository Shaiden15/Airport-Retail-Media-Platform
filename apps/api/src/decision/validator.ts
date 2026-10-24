import type { EvidenceRef } from '../presence/evidence.ts';
import type { AirportState } from '../state/AirportState.ts';
import type { AgentProposal } from './agent.ts';
import type { FilterReason } from './eligibility.ts';
import { score, type ScoreInputs } from './scorer.ts';
import type { EngineSettings } from './settings.ts';

export interface ValidationResult {
  accepted: boolean;
  checks: { name: 'evidence-exists' | 'evidence-trusted' | 'evidence-fresh' | 'hard-rules' | 'score-reproducible'; passed: boolean; detail: string }[];
}

const TRUSTED = new Set(['aodb', 'aidx', 'acris', 'platform']);

// Resolves an evidence id against the live state, so a fact the agent made up can never be found
export function resolveEvidence(id: string, state: AirportState, known: ReadonlyMap<string, EvidenceRef>): EvidenceRef | null {
  const ref = known.get(id);
  if (!ref) return null;
  if (ref.kind === 'flight') {
    const flight = state.flights.get(ref.subjectId);
    if (!flight || `${flight.provenance.source}:${flight.provenance.sourceRef}#${flight.id}` !== id) return null;
  }
  if (ref.kind === 'queue' && ![...state.queues.values()].some((m) => `acris:${m.id}` === id)) return null;
  return ref;
}

function freshnessLimitMs(ref: EvidenceRef, settings: EngineSettings): number {
  if (ref.source === 'aodb') return settings.freshnessMinutes.aodb * 60_000;
  if (ref.source === 'aidx') return settings.freshnessMinutes.aidx * 60_000;
  if (ref.source === 'acris') return settings.freshnessMinutes.acris * 60_000;
  return Number.POSITIVE_INFINITY;
}

export interface ValidationInput {
  proposal: AgentProposal;
  state: AirportState;
  known: ReadonlyMap<string, EvidenceRef>;
  simMs: number;
  settings: EngineSettings;
  filterReason: FilterReason | null | undefined;
  loggedInputs: ScoreInputs | undefined;
}

// Deterministic checks every agent proposal must pass before it is allowed on a screen
export function validateProposal(input: ValidationInput): ValidationResult {
  const { proposal, state, known, simMs, settings } = input;
  const checks: ValidationResult['checks'] = [];

  const resolved = proposal.citedEvidence.map((id) => ({ id, ref: resolveEvidence(id, state, known) }));
  const missing = resolved.filter((r) => !r.ref).map((r) => r.id);
  checks.push({ name: 'evidence-exists', passed: proposal.citedEvidence.length > 0 && missing.length === 0, detail: missing.length ? `not found in any feed: ${missing.join(', ')}` : `${resolved.length} cited facts found` });

  const untrusted = resolved.filter((r) => r.ref && !TRUSTED.has(r.ref.source)).map((r) => r.id);
  checks.push({ name: 'evidence-trusted', passed: untrusted.length === 0, detail: untrusted.length ? `untrusted sources: ${untrusted.join(', ')}` : 'all from trusted feeds' });

  const stale = resolved.filter((r) => r.ref && simMs - Date.parse(r.ref.observedAt) > freshnessLimitMs(r.ref, settings)).map((r) => r.id);
  checks.push({ name: 'evidence-fresh', passed: stale.length === 0, detail: stale.length ? `stale: ${stale.join(', ')}` : 'within freshness limits' });

  const rulePassed = input.filterReason === null;
  checks.push({ name: 'hard-rules', passed: rulePassed, detail: rulePassed ? 'all hard rules pass' : `fails ${input.filterReason ?? 'unknown campaign'}` });

  const recomputed = input.loggedInputs ? score(input.loggedInputs).score : Number.NaN;
  const reproducible = Number.isFinite(recomputed) && Math.abs(recomputed - proposal.claimedScore) < 1e-6;
  checks.push({ name: 'score-reproducible', passed: reproducible, detail: reproducible ? `recomputed ${recomputed}` : `claimed ${proposal.claimedScore}, recomputed ${Number.isFinite(recomputed) ? recomputed : 'n/a'}` });

  return { accepted: checks.every((c) => c.passed), checks };
}

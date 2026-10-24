import type { Flight, Provenance, QueueMeasurement } from '@dwellcast/shared';

export type EvidenceKind = 'flight' | 'queue' | 'screen' | 'campaign';

// A recorded data point the decision engine may cite; nothing else can justify a decision
export interface EvidenceRef {
  id: string;
  kind: EvidenceKind;
  subjectId: string;
  source: Provenance['source'];
  adapter: string;
  observedAt: string;
}

export function flightEvidence(f: Flight): EvidenceRef {
  return {
    id: `${f.provenance.source}:${f.provenance.sourceRef}#${f.id}`,
    kind: 'flight',
    subjectId: f.id,
    source: f.provenance.source,
    adapter: f.provenance.adapter,
    observedAt: f.provenance.observedAt,
  };
}

export function queueEvidence(m: QueueMeasurement): EvidenceRef {
  return { id: `acris:${m.id}`, kind: 'queue', subjectId: m.queueId, source: 'acris', adapter: m.provenance.adapter, observedAt: m.periodEnd };
}

export function platformEvidence(kind: 'screen' | 'campaign', subjectId: string, observedAt: string): EvidenceRef {
  return { id: `platform:${kind}:${subjectId}`, kind, subjectId, source: 'platform', adapter: 'platform-db', observedAt };
}

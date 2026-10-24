import type { EvidenceRef } from '../presence/evidence.ts';

export interface RankedCandidate {
  campaignId: string;
  score: number;
  evidenceIds: string[];
}

export interface AgentInput {
  screenId: string;
  simTime: string;
  ranked: readonly RankedCandidate[];
  evidence: readonly EvidenceRef[];
}

export interface AgentProposal {
  agent: string;
  campaignId: string;
  claimedScore: number;
  citedEvidence: string[];
  rationale: string;
}

// Pluggable ranking agent. Its proposal is advisory: the validator decides whether it may reach a screen
export interface DecisionAgent {
  readonly name: string;
  propose(input: AgentInput): AgentProposal | null;
}

// Default offline agent: picks the best-scored candidate and cites the data behind it
export class MockDecisionAgent implements DecisionAgent {
  readonly name = 'mock-ranker';
  private readonly hallucinateOnce = new Set<string>();

  // Demo control: the next proposal for this screen cites a flight that does not exist
  armHallucination(screenId: string): void {
    this.hallucinateOnce.add(screenId);
  }

  propose(input: AgentInput): AgentProposal | null {
    const top = input.ranked.at(0);
    if (!top) return null;
    if (this.hallucinateOnce.delete(input.screenId)) {
      const last = input.ranked.at(-1) ?? top;
      return {
        agent: this.name,
        campaignId: last.campaignId,
        claimedScore: 0.99,
        citedEvidence: ['aidx:MQI-AODB-999999999#ZZ999-FABRICATED-D'],
        rationale: 'Flight ZZ999 with 400 passengers is boarding next to this screen',
      };
    }
    return {
      agent: this.name,
      campaignId: top.campaignId,
      claimedScore: top.score,
      citedEvidence: top.evidenceIds,
      rationale: 'Highest verified audience score for the crowd in front of this screen',
    };
  }
}

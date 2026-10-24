import type { Creative, Screen } from '@dwellcast/shared';

export interface ClockState {
  simTime: string;
  speed: 1 | 10 | 60;
  running: boolean;
  dayStart: string;
  dayEnd: string;
  festival: boolean;
}

export interface Kpis {
  simTime: string;
  screensOnlinePct: number;
  screensOnline: number;
  screensTotal: number;
  playsToday: number;
  impressionsToday: number;
  revenueToday: number;
  currency: string;
  activeCampaigns: number;
  avgDecisionMs: number;
  avgScreenLatencyMs: number;
  incidents: Record<'critical' | 'high' | 'medium' | 'low', number>;
  tickMs: number;
}

export interface FlightSummary {
  id: string;
  flight: string;
  airlineCode: string;
  direction: 'departure' | 'arrival';
  origin: string;
  destination: string;
  international: boolean;
  terminal: string;
  gate: string | null;
  scheduledTime: string;
  estimatedTime: string | null;
  status: string;
  delayMinutes: number;
  paxCount: number;
  seatCapacity: number;
  loadFactor: number;
}

export interface RankedShare {
  code: string;
  share: number;
}

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

export interface Crowd {
  at: string;
  pax: number;
  paxNext30: number;
  internationalShare: number;
  medianDwellMinutes: number;
  segments: Record<string, number>;
  tripPurpose: Record<string, number>;
  party: Record<string, number>;
  age: Record<string, number>;
  topDestinations: RankedShare[];
  topNationalities: RankedShare[];
  flights: Contribution[];
}

export interface Candidate {
  campaignId: string;
  name: string;
  advertiser: string;
  category: string;
  status: 'winner' | 'eligible' | 'filtered' | 'excluded';
  reason: string | null;
  triggers: { kind: string; mode: string; boost: number; flightId: string | null; detail: string }[];
  breakdown: { match: number; boost: number; learnLift: number; pacing: number; score: number; groups: { segments: string; weight: number; affinity: number }[] } | null;
}

export interface Decision {
  id: string;
  screenId: string;
  simTime: string;
  crowd: Crowd;
  candidates: Candidate[];
  winner: { campaignId: string; creativeId: string; name: string; advertiser: string; score: number } | null;
  source: 'agent-verified' | 'rule-based' | 'delay-goodwill' | 'airline-priority' | 'manual-pin' | 'house-default';
  winningRule: string;
  agent: {
    proposal: { agent: string; campaignId: string; claimedScore: number; citedEvidence: string[]; rationale: string } | null;
    validation: { accepted: boolean; checks: { name: string; passed: boolean; detail: string }[] } | null;
  };
  evidence: { id: string; kind: string; subjectId: string; source: string; observedAt: string }[];
  impressions: number;
  modelVersion: string;
  scoringVersion: string;
}

export interface DecisionSummary {
  screenId: string;
  simTime: string;
  campaignId: string | null;
  creativeId: string | null;
  name: string | null;
  advertiser: string | null;
  score: number;
  source: string;
  rule: string;
  pax: number;
}

export interface ScreenWithPlaying extends Screen {
  nowPlaying: DecisionSummary | null;
}

export interface ScreenDetail {
  screen: Screen;
  nearbyFlights: FlightSummary[];
  decision: Decision | null;
}

export interface Offer {
  token: string;
  url: string;
  expiresAt: string;
  linkedFlight: string | null;
  campaignId: string;
  discountPct: number;
}

export interface OfferView {
  campaignId: string;
  headline: string;
  discountPct: number;
  advertiser: string;
  outlet: { name: string; zoneId: string; nearestGates: string[] } | null;
  creative: Creative | null;
  familyShare: boolean;
  expiresAt: string;
  linkedFlight: { flight: string; destination: string; gate: string | null } | null;
  simTime: string;
}

export interface RedemptionEvent {
  id: string;
  code: string;
  campaignId: string;
  campaignName: string;
  advertiserId: string;
  outletName: string | null;
  basketValue: number;
  segment: string | null;
  source: 'qr-phone' | 'family-share' | 'simulated';
  simTime: string;
}

export interface RetailerLive {
  advertiserId: string;
  simTime: string;
  today: { plays: number; impressions: number; scans: number; redemptions: number; conversionRate: number; revenueAttributed: number; spend: number; roi: number | null };
  campaigns: { id: string; name: string; status: string; plays: number; impressions: number; spend: number; scans: number; redemptions: number; revenue: number }[];
  recentRedemptions: RedemptionEvent[];
}

export interface PublicConfig {
  publicBaseUrl: string;
  airport: { code: string; name: string; operatingDate: string };
  sampleCompanies: { retailers: string[]; airlines: string[] };
}

export interface InjectionResult {
  type: string;
  latencyMs: number;
  affectedScreens: string[];
  decisions: { screenId: string; campaignId: string | null; name: string | null; source: string; rule: string }[];
}

export interface ZoneSummary {
  zoneId: string;
  zoneName: string;
  kind: string;
  terminalId: string;
  pax: number;
  paxNext30: number;
  internationalShare: number;
  medianDwellMinutes: number;
  topDestinations: RankedShare[];
}

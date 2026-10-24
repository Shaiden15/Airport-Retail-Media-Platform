import type { Segment } from '@dwellcast/shared';

interface Beta {
  alpha: number;
  beta: number;
}

export interface HistoryRow {
  campaignId: string;
  impressions: number;
  redemptions: number;
  segmentRedemptions: Record<string, number>;
}

const PRIOR_STRENGTH = 400;

// Beta-Bernoulli conversion estimate per campaign and segment; redemptions update it so later decisions improve
export class Learner {
  private readonly state = new Map<string, Beta>();
  private readonly baseline = new Map<string, number>();

  constructor(private readonly history: readonly HistoryRow[]) {
    this.prime();
  }

  // Back to the priors learned from 30 days of history
  reset(): void {
    this.state.clear();
    this.baseline.clear();
    this.prime();
  }

  private prime(): void {
    for (const h of this.history) {
      const rate = h.impressions > 0 ? Math.max(0.0005, h.redemptions / h.impressions) : 0.002;
      this.baseline.set(h.campaignId, rate);
      const total = Object.values(h.segmentRedemptions).reduce((s, v) => s + v, 0) || 1;
      for (const [segment, n] of Object.entries(h.segmentRedemptions)) {
        // Segments that redeemed more than their share get a higher prior rate
        const segRate = Math.max(0.0002, rate * (n / total) * 4);
        this.state.set(`${h.campaignId}|${segment}`, { alpha: segRate * PRIOR_STRENGTH, beta: (1 - segRate) * PRIOR_STRENGTH });
      }
    }
  }

  private get(campaignId: string, segment: string): Beta {
    const found = this.state.get(`${campaignId}|${segment}`);
    if (found) return found;
    const rate = this.baseline.get(campaignId) ?? 0.002;
    return { alpha: rate * PRIOR_STRENGTH, beta: (1 - rate) * PRIOR_STRENGTH };
  }

  mean(campaignId: string, segment: string): number {
    const b = this.get(campaignId, segment);
    return b.alpha / (b.alpha + b.beta);
  }

  baselineRate(campaignId: string): number {
    return this.baseline.get(campaignId) ?? 0.002;
  }

  // Expected conversion for this crowd relative to the campaign's own average, clamped to plus or minus range
  lift(campaignId: string, weights: Partial<Record<Segment, number>>, shares: Record<Segment, number>, range: number): number {
    const sharesMap = new Map(Object.entries(shares));
    let weighted = 0;
    let mass = 0;
    for (const segment of Object.keys(weights)) {
      const share = sharesMap.get(segment) ?? 0;
      if (share <= 0) continue;
      weighted += share * this.mean(campaignId, segment);
      mass += share;
    }
    if (mass === 0) return 1;
    const ratio = weighted / mass / this.baselineRate(campaignId);
    return Math.min(1 + range, Math.max(1 - range, ratio));
  }

  observe(campaignId: string, segment: string, conversions: number, exposures: number): void {
    const b = { ...this.get(campaignId, segment) };
    b.alpha += conversions;
    b.beta += Math.max(0, exposures - conversions);
    this.state.set(`${campaignId}|${segment}`, b);
  }

  snapshot(campaignId: string): { segment: string; rate: number; observations: number }[] {
    const out: { segment: string; rate: number; observations: number }[] = [];
    for (const [key, b] of this.state) {
      const [cid, segment] = key.split('|');
      if (cid === campaignId && segment) out.push({ segment, rate: b.alpha / (b.alpha + b.beta), observations: Math.round(b.alpha + b.beta) });
    }
    return out.sort((a, b) => b.rate - a.rate);
  }
}

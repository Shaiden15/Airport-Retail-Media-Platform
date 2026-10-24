import { Prng } from '../generator/prng.ts';

const WINDOW = 2000;

function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.at(Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))) ?? 0;
}

// Rolling performance figures for the Platform Admin performance panel
export class Metrics {
  private readonly requests: number[] = [];
  private readonly slots: number[] = [];
  private readonly onlineSamples: number[] = [];
  private readonly pastUptime: number[];

  constructor(seed: number) {
    const prng = new Prng(seed ^ 0x0f7e);
    this.pastUptime = Array.from({ length: 6 }, () => Math.round(prng.float(99.1, 99.95) * 100) / 100);
  }

  private push(list: number[], value: number): void {
    list.push(value);
    if (list.length > WINDOW) list.splice(0, list.length - WINDOW);
  }

  recordRequest(ms: number): void {
    this.push(this.requests, ms);
  }

  recordSlot(ms: number): void {
    this.push(this.slots, ms);
  }

  recordOnlineShare(share: number): void {
    this.push(this.onlineSamples, share);
  }

  snapshot(dateIso: string) {
    const avg = (list: readonly number[]) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0);
    const todayUptime = this.onlineSamples.length ? Math.round(avg(this.onlineSamples) * 10_000) / 100 : 100;
    const day = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
    return {
      apiP50Ms: Math.round(percentile(this.requests, 50) * 100) / 100,
      apiP95Ms: Math.round(percentile(this.requests, 95) * 100) / 100,
      requestsSampled: this.requests.length,
      playlistBuildAvgMs: Math.round(avg(this.slots) * 100) / 100,
      playlistBuildP95Ms: Math.round(percentile(this.slots, 95) * 100) / 100,
      uptime7d: [...this.pastUptime, todayUptime].map((pct, i) => ({ date: new Date(day - (6 - i) * 86_400_000).toISOString().slice(0, 10), uptimePct: pct })),
    };
  }
}

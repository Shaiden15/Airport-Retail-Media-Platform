import type { Campaign } from '@dwellcast/shared';
import type { Database } from '../db/database.ts';

interface HourlyTotal {
  campaignId: string;
  screenId: string;
  hour: string;
  plays: number;
  impressions: number;
  spend: number;
}

export interface LedgerTotals {
  plays: number;
  impressions: number;
  spend: number;
}

// Plays, impressions and spend as the day runs; also remembers what each screen showed for frequency and separation rules
export class Ledger {
  private readonly today = new Map<string, LedgerTotals>();
  private readonly perScreenHour = new Map<string, number>();
  private readonly lastOnScreen = new Map<string, { campaignId: string; category: string; advertiserId: string }>();
  private pending = new Map<string, HourlyTotal>();
  private dayTotals: LedgerTotals = { plays: 0, impressions: 0, spend: 0 };

  constructor(private readonly db: Database | null) {}

  record(campaign: Campaign, screenId: string, simMs: number, impressions: number): void {
    const spend = campaign.budget.pricePerPlay;
    const totals = this.today.get(campaign.id) ?? { plays: 0, impressions: 0, spend: 0 };
    totals.plays++;
    totals.impressions += impressions;
    totals.spend = Math.round((totals.spend + spend) * 100) / 100;
    this.today.set(campaign.id, totals);
    campaign.budget.spent = Math.round((campaign.budget.spent + spend) * 100) / 100;
    this.dayTotals = { plays: this.dayTotals.plays + 1, impressions: this.dayTotals.impressions + impressions, spend: Math.round((this.dayTotals.spend + spend) * 100) / 100 };

    const hour = new Date(simMs).toISOString().slice(0, 13);
    const freqKey = `${screenId}|${campaign.id}|${hour}`;
    this.perScreenHour.set(freqKey, (this.perScreenHour.get(freqKey) ?? 0) + 1);
    this.lastOnScreen.set(screenId, { campaignId: campaign.id, category: campaign.category, advertiserId: campaign.advertiserId });

    const key = `${campaign.id}|${screenId}|${hour}`;
    const row = this.pending.get(key) ?? { campaignId: campaign.id, screenId, hour, plays: 0, impressions: 0, spend: 0 };
    row.plays++;
    row.impressions += impressions;
    row.spend = Math.round((row.spend + spend) * 100) / 100;
    this.pending.set(key, row);
  }

  playsThisHour(screenId: string, campaignId: string, simMs: number): number {
    return this.perScreenHour.get(`${screenId}|${campaignId}|${new Date(simMs).toISOString().slice(0, 13)}`) ?? 0;
  }

  last(screenId: string): { campaignId: string; category: string; advertiserId: string } | null {
    return this.lastOnScreen.get(screenId) ?? null;
  }

  spentToday(campaignId: string): number {
    return this.today.get(campaignId)?.spend ?? 0;
  }

  campaignToday(campaignId: string): LedgerTotals {
    return this.today.get(campaignId) ?? { plays: 0, impressions: 0, spend: 0 };
  }

  totals(): LedgerTotals {
    return this.dayTotals;
  }

  // Going back in time replays the day, so today's totals start again from zero
  resetDay(): void {
    this.today.clear();
    this.pending.clear();
    this.dayTotals = { plays: 0, impressions: 0, spend: 0 };
  }

  // Per-screen memory is cleared on a time jump so a new moment starts fresh
  forgetScreens(): void {
    this.perScreenHour.clear();
    this.lastOnScreen.clear();
  }

  flush(): number {
    if (!this.db || !this.pending.size) {
      this.pending.clear();
      return 0;
    }
    const upsert = this.db.prepare(
      'INSERT INTO play_stats_hourly (campaign_id, screen_id, hour, plays, impressions, spend) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (campaign_id, screen_id, hour) DO UPDATE SET plays = plays + excluded.plays, impressions = impressions + excluded.impressions, spend = spend + excluded.spend',
    );
    const rows = [...this.pending.values()];
    this.db.exec('BEGIN');
    try {
      for (const r of rows) upsert.run(r.campaignId, r.screenId, r.hour, r.plays, r.impressions, r.spend);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    this.pending = new Map();
    return rows.length;
  }
}

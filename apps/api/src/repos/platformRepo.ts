import {
  advertiserSchema,
  campaignSchema,
  creativeSchema,
  outletSchema,
  screenSchema,
  type Advertiser,
  type Campaign,
  type Creative,
  type Outlet,
  type Screen,
} from '@dwellcast/shared';
import type { Database } from '../db/database.ts';
import type { GateInfo, ZoneInfo } from '../state/AirportState.ts';

type Row = Record<string, unknown>;

const text = (row: Row, key: string): string => String(new Map(Object.entries(row)).get(key) ?? '');
const numberOf = (row: Row, key: string): number => Number(new Map(Object.entries(row)).get(key) ?? 0);
const json = (row: Row, key: string): unknown => JSON.parse(text(row, key) || 'null');
const nullable = (row: Row, key: string): string | null => {
  const v = new Map(Object.entries(row)).get(key);
  return v === null || v === undefined ? null : String(v);
};

// Reads platform tables into the canonical shapes, validating every row on the way out
export class PlatformRepo {
  constructor(private readonly db: Database) {}

  zones(): ZoneInfo[] {
    return this.db.prepare('SELECT id, name, terminal_id, kind, centroid_x, centroid_y FROM zones ORDER BY id').all().map((r) => ({
      id: text(r, 'id'),
      name: text(r, 'name'),
      terminalId: text(r, 'terminal_id'),
      kind: text(r, 'kind') as ZoneInfo['kind'],
      centroid: { x: numberOf(r, 'centroid_x'), y: numberOf(r, 'centroid_y') },
    }));
  }

  gates(): GateInfo[] {
    return this.db.prepare('SELECT id, terminal_id, zone_id, x, y FROM gates ORDER BY id').all().map((r) => ({
      id: text(r, 'id'),
      terminalId: text(r, 'terminal_id'),
      zoneId: text(r, 'zone_id'),
      position: { x: numberOf(r, 'x'), y: numberOf(r, 'y') },
    }));
  }

  screens(): Screen[] {
    return this.db.prepare('SELECT * FROM screens ORDER BY id').all().map((r) =>
      screenSchema.parse({
        id: text(r, 'id'),
        name: text(r, 'name'),
        terminalId: text(r, 'terminal_id'),
        zoneId: text(r, 'zone_id'),
        sizeInches: numberOf(r, 'size_inches'),
        orientation: text(r, 'orientation'),
        resolution: text(r, 'resolution'),
        position: { x: numberOf(r, 'x'), y: numberOf(r, 'y') },
        nearestGates: json(r, 'nearest_gates'),
        vendorId: text(r, 'vendor_id'),
        status: text(r, 'status'),
        premium: numberOf(r, 'premium') === 1,
      }),
    );
  }

  airlines(): { code: string; icaoCode: string; name: string; model: string; hubRegion: string; brandColor: string }[] {
    return this.db.prepare('SELECT * FROM airlines ORDER BY code').all().map((r) => ({
      code: text(r, 'code'),
      icaoCode: text(r, 'icao_code'),
      name: text(r, 'name'),
      model: text(r, 'model'),
      hubRegion: text(r, 'hub_region'),
      brandColor: text(r, 'brand_color'),
    }));
  }

  advertisers(): Advertiser[] {
    return this.db.prepare('SELECT * FROM advertisers ORDER BY id').all().map((r) =>
      advertiserSchema.parse({ id: text(r, 'id'), name: text(r, 'name'), kind: text(r, 'kind'), category: text(r, 'category'), airlineCode: nullable(r, 'airline_code'), brandColor: text(r, 'brand_color') }),
    );
  }

  outlets(): Outlet[] {
    return this.db.prepare('SELECT * FROM outlets ORDER BY id').all().map((r) =>
      outletSchema.parse({
        id: text(r, 'id'),
        advertiserId: text(r, 'advertiser_id'),
        name: text(r, 'name'),
        category: text(r, 'category'),
        terminalId: text(r, 'terminal_id'),
        zoneId: text(r, 'zone_id'),
        nearestGates: json(r, 'nearest_gates'),
        avgBasket: numberOf(r, 'avg_basket'),
        inStock: numberOf(r, 'in_stock') === 1,
      }),
    );
  }

  creatives(): Creative[] {
    return this.db.prepare('SELECT * FROM creatives ORDER BY id').all().map((r) =>
      creativeSchema.parse({
        id: text(r, 'id'),
        advertiserId: text(r, 'advertiser_id'),
        name: text(r, 'name'),
        template: text(r, 'template'),
        content: json(r, 'content'),
        translations: json(r, 'translations'),
        approval: text(r, 'approval'),
        createdAt: text(r, 'created_at'),
      }),
    );
  }

  campaigns(): Campaign[] {
    return this.db.prepare('SELECT * FROM campaigns ORDER BY id').all().map((r) =>
      campaignSchema.parse({
        id: text(r, 'id'),
        advertiserId: text(r, 'advertiser_id'),
        outletId: nullable(r, 'outlet_id'),
        name: text(r, 'name'),
        category: text(r, 'category'),
        status: text(r, 'status'),
        creativeIds: json(r, 'creative_ids'),
        targeting: json(r, 'targeting'),
        schedule: json(r, 'schedule'),
        budget: json(r, 'budget'),
        offer: json(r, 'offer'),
        brandSafety: json(r, 'brand_safety'),
        createdAt: text(r, 'created_at'),
      }),
    );
  }

  campaignHistory(): { campaignId: string; impressions: number; redemptions: number; segmentRedemptions: Record<string, number> }[] {
    return this.db
      .prepare('SELECT campaign_id, SUM(impressions) AS impressions, SUM(redemptions) AS redemptions, json_group_array(segment_redemptions) AS segs FROM campaign_daily_stats GROUP BY campaign_id')
      .all()
      .map((r) => {
        const totals = new Map<string, number>();
        for (const day of JSON.parse(text(r, 'segs')) as string[]) {
          for (const [k, v] of Object.entries(JSON.parse(day) as Record<string, number>)) totals.set(k, (totals.get(k) ?? 0) + v);
        }
        return { campaignId: text(r, 'campaign_id'), impressions: numberOf(r, 'impressions'), redemptions: numberOf(r, 'redemptions'), segmentRedemptions: Object.fromEntries(totals) };
      });
  }
}

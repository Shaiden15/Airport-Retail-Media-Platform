import type { AirportLayout } from '../generator/layout.ts';
import type { PlatformData } from '../generator/platform.ts';
import { AIRLINES } from '../generator/reference.ts';
import { transaction, type Database } from './database.ts';

// Child tables first so foreign keys never block the reset
const RESET_STATEMENTS = [
  'DELETE FROM goodwill_rules',
  'DELETE FROM campaign_reviews',
  'DELETE FROM assets',
  'DELETE FROM incidents',
  'DELETE FROM decisions',
  'DELETE FROM play_stats_hourly',
  'DELETE FROM learner_state',
  'DELETE FROM redemptions',
  'DELETE FROM impressions',
  'DELETE FROM promo_codes',
  'DELETE FROM campaign_daily_stats',
  'DELETE FROM campaigns',
  'DELETE FROM creatives',
  'DELETE FROM screens',
  'DELETE FROM outlets',
  'DELETE FROM advertisers',
  'DELETE FROM gates',
  'DELETE FROM zones',
  'DELETE FROM concourses',
  'DELETE FROM terminals',
  'DELETE FROM vendors',
  'DELETE FROM airlines',
] as const;

const json = (value: unknown): string => JSON.stringify(value);
const flag = (value: boolean): number => (value ? 1 : 0);

export function isSeeded(db: Database): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM screens').get();
  return Number(row?.n ?? 0) > 0;
}

export function seedVersion(db: Database): string | null {
  const row = db.prepare("SELECT value FROM engine_settings WHERE key = 'seed_version'").get();
  return row ? String(JSON.parse(String(row.value))) : null;
}

export function markSeedVersion(db: Database, version: string): void {
  db.prepare("INSERT INTO engine_settings (key, value, updated_at) VALUES ('seed_version', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(JSON.stringify(version), new Date().toISOString());
}

export function seedDatabase(db: Database, layout: AirportLayout, platform: PlatformData, options: { reset: boolean }): void {
  transaction(db, () => {
    if (options.reset) for (const statement of RESET_STATEMENTS) db.exec(statement);

    const airline = db.prepare('INSERT INTO airlines (code, icao_code, name, model, hub_region, brand_color) VALUES (?, ?, ?, ?, ?, ?)');
    for (const a of AIRLINES) airline.run(a.code, a.icaoCode, a.name, a.model, a.hubRegion, a.brandColor);

    const vendor = db.prepare('INSERT INTO vendors (id, name, kind, contact_email) VALUES (?, ?, ?, ?)');
    for (const v of platform.vendors) vendor.run(v.id, v.name, v.kind, v.contactEmail);

    const terminal = db.prepare('INSERT INTO terminals (id, code, name) VALUES (?, ?, ?)');
    for (const t of layout.terminals) terminal.run(t.id, t.code, t.name);

    const concourse = db.prepare('INSERT INTO concourses (id, code, name, terminal_id) VALUES (?, ?, ?, ?)');
    for (const c of layout.concourses) concourse.run(c.id, c.code, c.name, c.terminalId);

    const zone = db.prepare('INSERT INTO zones (id, name, terminal_id, concourse_id, kind, airside, centroid_x, centroid_y, radius) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const z of layout.zones) zone.run(z.id, z.name, z.terminalId, z.concourseId, z.kind, flag(z.airside), z.centroid.x, z.centroid.y, z.radius);

    const gate = db.prepare('INSERT INTO gates (id, terminal_id, concourse_id, zone_id, x, y, bus) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const g of layout.gates) gate.run(g.id, g.terminalId, g.concourseId, g.zoneId, g.position.x, g.position.y, flag(g.bus));

    const advertiser = db.prepare('INSERT INTO advertisers (id, name, kind, category, airline_code, brand_color) VALUES (?, ?, ?, ?, ?, ?)');
    for (const a of platform.advertisers) advertiser.run(a.id, a.name, a.kind, a.category, a.airlineCode, a.brandColor);

    const outlet = db.prepare('INSERT INTO outlets (id, advertiser_id, name, category, terminal_id, zone_id, nearest_gates, avg_basket, in_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const o of platform.outlets) outlet.run(o.id, o.advertiserId, o.name, o.category, o.terminalId, o.zoneId, json(o.nearestGates), o.avgBasket, flag(o.inStock));

    const screen = db.prepare('INSERT INTO screens (id, name, terminal_id, zone_id, size_inches, orientation, resolution, x, y, nearest_gates, vendor_id, status, premium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of platform.screens) screen.run(s.id, s.name, s.terminalId, s.zoneId, s.sizeInches, s.orientation, s.resolution, s.position.x, s.position.y, json(s.nearestGates), s.vendorId, s.status, flag(s.premium));

    const creative = db.prepare('INSERT INTO creatives (id, advertiser_id, name, template, content, translations, approval, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const c of platform.creatives) creative.run(c.id, c.advertiserId, c.name, c.template, json(c.content), json(c.translations), c.approval, c.createdAt);

    const campaign = db.prepare('INSERT INTO campaigns (id, advertiser_id, outlet_id, name, category, status, creative_ids, targeting, schedule, budget, offer, brand_safety, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const c of platform.campaigns) {
      campaign.run(c.id, c.advertiserId, c.outletId, c.name, c.category, c.status, json(c.creativeIds), json(c.targeting), json(c.schedule), json(c.budget), json(c.offer), json(c.brandSafety), c.createdAt);
    }

    const stat = db.prepare('INSERT INTO campaign_daily_stats (campaign_id, date, plays, impressions, scans, redemptions, spend, revenue, segment_redemptions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const s of platform.dailyStats) stat.run(s.campaignId, s.date, s.plays, s.impressions, s.scans, s.redemptions, s.spend, s.revenue, json(s.segmentRedemptions));
  });
}

import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { ADVERTISER_KINDS, CATEGORIES, REGIONS, ZONE_KINDS, advertiserSchema, outletSchema, screenSchema, type Screen } from '@dwellcast/shared';
import type { Database } from '../db/database.ts';
import type { DecisionEngine } from '../decision/DecisionEngine.ts';
import { METRES_PER_UNIT } from '../generator/layout.ts';
import type { PresenceEngine } from '../presence/PresenceEngine.ts';
import type { AirportState } from '../state/AirportState.ts';

export class MasterDataError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'MasterDataError';
  }
}

const id = z.string().min(1).max(60).regex(/^[A-Za-z0-9._-]+$/);
const name = z.string().min(2).max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const coord = z.number().min(0).max(2000);

export const ENTITY_SCHEMAS = {
  vendors: z.object({ id: id.optional(), name, kind: z.enum(['screen-hardware', 'network', 'content-agency']), contactEmail: z.email() }),
  advertisers: z.object({ id: id.optional(), name, kind: z.enum(ADVERTISER_KINDS), category: z.enum(CATEGORIES), airlineCode: z.string().min(2).max(3).nullable().default(null), brandColor: color }),
  outlets: z.object({ id: id.optional(), advertiserId: id, name, category: z.enum(CATEGORIES), zoneId: id, avgBasket: z.number().positive().max(10_000), inStock: z.boolean().default(true) }),
  airlines: z.object({ code: z.string().regex(/^[A-Z0-9]{2}$/), icaoCode: z.string().regex(/^[A-Z]{3}$/), name, model: z.enum(['full-service', 'low-cost']), hubRegion: z.enum(REGIONS), brandColor: color }),
  terminals: z.object({ id: id.optional(), code: z.string().min(1).max(6), name }),
  zones: z.object({ id: id.optional(), name, terminalId: id, concourseId: id.nullable().default(null), kind: z.enum(ZONE_KINDS), airside: z.boolean(), centroidX: coord, centroidY: coord, radius: z.number().min(10).max(300).default(60) }),
  gates: z.object({ id, terminalId: id, zoneId: id, x: coord, y: coord, bus: z.boolean().default(false) }),
  screens: z.object({
    id: id.optional(),
    name,
    zoneId: id,
    sizeInches: z.number().int().min(10).max(150),
    orientation: z.enum(['portrait', 'landscape']),
    resolution: z.string().regex(/^\d{3,4}x\d{3,4}$/),
    x: coord,
    y: coord,
    vendorId: id,
    status: z.enum(['online', 'degraded', 'offline']).default('online'),
    premium: z.boolean().default(false),
  }),
} as const;

export type EntityKind = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_KINDS = Object.keys(ENTITY_SCHEMAS) as EntityKind[];

const newId = (prefix: string) => `${prefix}-${randomInt(36 ** 5).toString(36).padStart(5, '0')}`;

// Create and edit for every master data type; changes reach the live engine immediately
export class MasterDataService {
  constructor(
    private readonly db: Database,
    private readonly state: AirportState,
    private readonly engine: DecisionEngine,
    private readonly presence: PresenceEngine,
  ) {}

  list(kind: EntityKind): unknown[] {
    switch (kind) {
      case 'vendors':
        return this.db.prepare('SELECT id, name, kind, contact_email AS contactEmail FROM vendors ORDER BY name').all();
      case 'advertisers':
        return this.engine.advertisersList().sort((a, b) => a.name.localeCompare(b.name));
      case 'outlets':
        return this.engine.outletsList().sort((a, b) => a.name.localeCompare(b.name));
      case 'airlines':
        return this.db.prepare('SELECT code, icao_code AS icaoCode, name, model, hub_region AS hubRegion, brand_color AS brandColor FROM airlines ORDER BY code').all();
      case 'terminals':
        return this.db.prepare('SELECT id, code, name FROM terminals ORDER BY id').all();
      case 'zones':
        return this.db.prepare('SELECT id, name, terminal_id AS terminalId, concourse_id AS concourseId, kind, airside, centroid_x AS centroidX, centroid_y AS centroidY, radius FROM zones ORDER BY id').all().map((z) => ({ ...z, airside: z.airside === 1 }));
      case 'gates':
        return this.db.prepare('SELECT id, terminal_id AS terminalId, zone_id AS zoneId, x, y, bus FROM gates ORDER BY terminal_id, id').all().map((g) => ({ ...g, bus: g.bus === 1 }));
      case 'screens':
        return [...this.state.screens.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
  }

  private zoneTerminal(zoneId: string): string {
    const zone = this.state.zones.get(zoneId);
    if (!zone) throw new MasterDataError(`Unknown zone ${zoneId}`, 400);
    return zone.terminalId;
  }

  private nearestGates(terminalId: string, x: number, y: number): Screen['nearestGates'] {
    return [...this.state.gates.values()]
      .filter((g) => g.terminalId === terminalId)
      .map((g) => ({ gate: g.id, distanceM: Math.round(Math.hypot(g.position.x - x, g.position.y - y) * METRES_PER_UNIT) }))
      .filter((g) => g.distanceM <= 400)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 6);
  }

  save(kind: EntityKind, raw: unknown, existingId?: string): unknown {
    try {
      return this.saveUnchecked(kind, raw, existingId);
    } catch (error) {
      if (error instanceof MasterDataError) throw error;
      // Foreign key and uniqueness violations come back as a clean 409 instead of a 500
      if (error instanceof Error && error.message.includes('constraint')) throw new MasterDataError('That change conflicts with existing data (check referenced IDs)', 409);
      throw error;
    }
  }

  private saveUnchecked(kind: EntityKind, raw: unknown, existingId?: string): unknown {
    switch (kind) {
      case 'vendors': {
        const v = ENTITY_SCHEMAS.vendors.parse(raw);
        const vid = existingId ?? v.id ?? newId('ven');
        this.db.prepare('INSERT INTO vendors (id, name, kind, contact_email) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, contact_email = excluded.contact_email').run(vid, v.name, v.kind, v.contactEmail);
        return { ...v, id: vid };
      }
      case 'advertisers': {
        const a = ENTITY_SCHEMAS.advertisers.parse(raw);
        const advertiser = advertiserSchema.parse({ ...a, id: existingId ?? a.id ?? newId('adv') });
        this.db.prepare('INSERT INTO advertisers (id, name, kind, category, airline_code, brand_color) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, kind = excluded.kind, category = excluded.category, airline_code = excluded.airline_code, brand_color = excluded.brand_color').run(advertiser.id, advertiser.name, advertiser.kind, advertiser.category, advertiser.airlineCode, advertiser.brandColor);
        this.engine.upsertAdvertiser(advertiser);
        return advertiser;
      }
      case 'outlets': {
        const o = ENTITY_SCHEMAS.outlets.parse(raw);
        const terminalId = this.zoneTerminal(o.zoneId);
        const zone = this.state.zones.get(o.zoneId);
        const gates = zone ? this.nearestGates(terminalId, zone.centroid.x, zone.centroid.y).slice(0, 3).map((g) => g.gate) : [];
        const outlet = outletSchema.parse({ ...o, id: existingId ?? o.id ?? newId('out'), terminalId, nearestGates: gates });
        this.db.prepare('INSERT INTO outlets (id, advertiser_id, name, category, terminal_id, zone_id, nearest_gates, avg_basket, in_stock) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET advertiser_id = excluded.advertiser_id, name = excluded.name, category = excluded.category, terminal_id = excluded.terminal_id, zone_id = excluded.zone_id, nearest_gates = excluded.nearest_gates, avg_basket = excluded.avg_basket, in_stock = excluded.in_stock').run(outlet.id, outlet.advertiserId, outlet.name, outlet.category, outlet.terminalId, outlet.zoneId, JSON.stringify(outlet.nearestGates), outlet.avgBasket, outlet.inStock ? 1 : 0);
        this.engine.upsertOutlet(outlet);
        return outlet;
      }
      case 'airlines': {
        const a = ENTITY_SCHEMAS.airlines.parse(raw);
        this.db.prepare('INSERT INTO airlines (code, icao_code, name, model, hub_region, brand_color) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (code) DO UPDATE SET icao_code = excluded.icao_code, name = excluded.name, model = excluded.model, hub_region = excluded.hub_region, brand_color = excluded.brand_color').run(existingId ?? a.code, a.icaoCode, a.name, a.model, a.hubRegion, a.brandColor);
        return { ...a, code: existingId ?? a.code };
      }
      case 'terminals': {
        const t = ENTITY_SCHEMAS.terminals.parse(raw);
        const tid = existingId ?? t.id ?? t.code;
        this.db.prepare('INSERT INTO terminals (id, code, name) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET code = excluded.code, name = excluded.name').run(tid, t.code, t.name);
        return { ...t, id: tid };
      }
      case 'zones': {
        const z = ENTITY_SCHEMAS.zones.parse(raw);
        const zid = existingId ?? z.id ?? newId('Z');
        this.db.prepare('INSERT INTO zones (id, name, terminal_id, concourse_id, kind, airside, centroid_x, centroid_y, radius) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, terminal_id = excluded.terminal_id, concourse_id = excluded.concourse_id, kind = excluded.kind, airside = excluded.airside, centroid_x = excluded.centroid_x, centroid_y = excluded.centroid_y, radius = excluded.radius').run(zid, z.name, z.terminalId, z.concourseId, z.kind, z.airside ? 1 : 0, z.centroidX, z.centroidY, z.radius);
        this.state.upsertZone({ id: zid, name: z.name, terminalId: z.terminalId, kind: z.kind, centroid: { x: z.centroidX, y: z.centroidY } });
        this.presence.refreshTopology();
        return { ...z, id: zid };
      }
      case 'gates': {
        const g = ENTITY_SCHEMAS.gates.parse(raw);
        const concourse = this.db.prepare('SELECT concourse_id FROM zones WHERE id = ?').get(g.zoneId);
        const concourseId = concourse?.concourse_id ?? this.db.prepare('SELECT id FROM concourses WHERE terminal_id = ? LIMIT 1').get(g.terminalId)?.id;
        if (!concourseId) throw new MasterDataError('No concourse found for that terminal', 400);
        const gid = existingId ?? g.id;
        this.db.prepare('INSERT INTO gates (id, terminal_id, concourse_id, zone_id, x, y, bus) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET terminal_id = excluded.terminal_id, concourse_id = excluded.concourse_id, zone_id = excluded.zone_id, x = excluded.x, y = excluded.y, bus = excluded.bus').run(gid, g.terminalId, String(concourseId), g.zoneId, g.x, g.y, g.bus ? 1 : 0);
        this.state.upsertGate({ id: gid, terminalId: g.terminalId, zoneId: g.zoneId, position: { x: g.x, y: g.y } });
        this.presence.refreshTopology();
        return { ...g, id: gid };
      }
      case 'screens': {
        const s = ENTITY_SCHEMAS.screens.parse(raw);
        const terminalId = this.zoneTerminal(s.zoneId);
        const sid = existingId ?? s.id ?? `SCR-${String(this.state.screens.size + 1).padStart(3, '0')}`;
        const screen = screenSchema.parse({ id: sid, name: s.name, terminalId, zoneId: s.zoneId, sizeInches: s.sizeInches, orientation: s.orientation, resolution: s.resolution, position: { x: s.x, y: s.y }, nearestGates: this.nearestGates(terminalId, s.x, s.y), vendorId: s.vendorId, status: s.status, premium: s.premium });
        this.db.prepare('INSERT INTO screens (id, name, terminal_id, zone_id, size_inches, orientation, resolution, x, y, nearest_gates, vendor_id, status, premium) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, terminal_id = excluded.terminal_id, zone_id = excluded.zone_id, size_inches = excluded.size_inches, orientation = excluded.orientation, resolution = excluded.resolution, x = excluded.x, y = excluded.y, nearest_gates = excluded.nearest_gates, vendor_id = excluded.vendor_id, status = excluded.status, premium = excluded.premium').run(screen.id, screen.name, screen.terminalId, screen.zoneId, screen.sizeInches, screen.orientation, screen.resolution, screen.position.x, screen.position.y, JSON.stringify(screen.nearestGates), screen.vendorId, screen.status, screen.premium ? 1 : 0);
        this.state.upsertScreen(screen);
        this.presence.refreshTopology();
        return screen;
      }
    }
  }
}

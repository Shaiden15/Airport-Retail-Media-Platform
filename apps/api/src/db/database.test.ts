import { describe, expect, it } from 'vitest';
import { loadAirportConfig } from '../airportConfig.ts';
import { buildLayout } from '../generator/layout.ts';
import { generatePlatform } from '../generator/platform.ts';
import { migrate, openDatabase } from './database.ts';
import { isSeeded, seedDatabase } from './seed.ts';

const airport = loadAirportConfig();
const layout = buildLayout();
const platform = generatePlatform(layout, { date: airport.operatingDate, seed: airport.seed });

function freshDb() {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

const count = (db: ReturnType<typeof openDatabase>, sql: string) => Number(db.prepare(sql).get()?.n ?? 0);

describe('database', () => {
  it('applies migrations once and records them', () => {
    const db = openDatabase(':memory:');
    expect(migrate(db)).toEqual(['001_master_data', '002_campaigns', '003_activity']);
    expect(migrate(db)).toEqual([]);
  });

  it('seeds master data, campaigns and history', () => {
    const db = freshDb();
    expect(isSeeded(db)).toBe(false);
    seedDatabase(db, layout, platform, { reset: false });
    expect(isSeeded(db)).toBe(true);
    expect(count(db, 'SELECT COUNT(*) AS n FROM screens')).toBe(180);
    expect(count(db, 'SELECT COUNT(*) AS n FROM outlets')).toBe(40);
    expect(count(db, 'SELECT COUNT(*) AS n FROM airlines')).toBe(11);
    expect(count(db, 'SELECT COUNT(*) AS n FROM campaigns')).toBe(25);
    expect(count(db, "SELECT COUNT(*) AS n FROM gates WHERE id = '42'")).toBe(1);
  });

  it('reseeds cleanly with reset', () => {
    const db = freshDb();
    seedDatabase(db, layout, platform, { reset: false });
    seedDatabase(db, layout, platform, { reset: true });
    expect(count(db, 'SELECT COUNT(*) AS n FROM screens')).toBe(180);
  });

  it('enforces foreign keys and JSON validity', () => {
    const db = freshDb();
    expect(() => db.prepare("INSERT INTO gates (id, terminal_id, concourse_id, zone_id, x, y, bus) VALUES ('X1', 'T9', 'C9', 'Z9', 0, 0, 0)").run()).toThrow();
    seedDatabase(db, layout, platform, { reset: false });
    expect(() => db.prepare("UPDATE campaigns SET targeting = 'not json' WHERE id = 'cmp-perfume-15'").run()).toThrow();
  });

  it('rolls back a failed seed completely', () => {
    const db = freshDb();
    const broken = { ...platform, outlets: [...platform.outlets, { ...platform.outlets[0]!, zoneId: 'Z-MISSING' }] };
    expect(() => seedDatabase(db, layout, broken, { reset: false })).toThrow();
    expect(count(db, 'SELECT COUNT(*) AS n FROM airlines')).toBe(0);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FlightEvent, QueueMeasurement } from '@dwellcast/shared';
import { loadAirportConfig } from '../airportConfig.ts';
import { loadConfig } from '../config.ts';
import { writeFeeds } from '../feeds/writeFeeds.ts';
import { generateDay } from '../generator/index.ts';
import { createFlightSource, createZoneSource } from './registry.ts';
import { AdapterNotConfiguredError } from './types.ts';
import { MockAidxFlightSource } from './flight/MockAidxFlightSource.ts';

const airport = loadAirportConfig();
const ctx = { homeAirport: airport.iataCode, now: () => new Date().toISOString() };
let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dwellcast-feeds-'));
  process.env.FEEDS_DIR = dir;
  writeFeeds(generateDay(airport), airport.iataCode);
});

afterAll(() => {
  delete process.env.FEEDS_DIR;
  rmSync(dir, { recursive: true, force: true });
});

describe('FLIGHT_SOURCE=mock-aidx end to end', () => {
  it('loads the AODB snapshot and resolves every AIDX message to a flight', async () => {
    const source = createFlightSource(loadConfig({}), ctx, airport.operatingDate);
    expect(source).toBeInstanceOf(MockAidxFlightSource);
    const snapshot = await source.snapshot();
    expect(snapshot.flights).toHaveLength(900);
    const events: FlightEvent[] = [];
    for await (const event of source.stream()) events.push(event);
    expect(events.length).toBeGreaterThan(3000);
    expect((source as MockAidxFlightSource).unresolved).toBe(0);
    const times = events.map((e) => e.provenance.observedAt);
    expect([...times].sort()).toEqual(times);
  });

  it('announces the XH501 delay before the 14:10 worked-example moment', async () => {
    const source = createFlightSource(loadConfig({}), ctx, airport.operatingDate);
    await source.snapshot();
    let delay: FlightEvent | undefined;
    for await (const event of source.stream()) {
      if (event.flightId.startsWith('XH501-') && event.kind === 'delay') delay = event;
    }
    expect(delay).toMatchObject({ delayMinutes: 45, delayCodes: ['93'], estimatedTime: `${airport.operatingDate}T15:40:00Z` });
    expect(delay && delay.provenance.observedAt < `${airport.operatingDate}T14:10:00Z`).toBe(true);
  });
});

describe('ZONE_SOURCE=mock-acris end to end', () => {
  it('loads ACRIS locations and links every queue measurement to a known zone', async () => {
    const source = createZoneSource(loadConfig({}), ctx, airport.operatingDate);
    const snapshot = await source.snapshot();
    expect(snapshot.terminals.map((t) => t.id)).toEqual(['T1', 'T2']);
    expect(snapshot.zones).toHaveLength(22);
    expect(snapshot.queues).toHaveLength(5);
    const zoneIds = new Set(snapshot.zones.map((z) => z.id));
    const measurements: QueueMeasurement[] = [];
    for await (const m of source.stream()) measurements.push(m);
    expect(measurements).toHaveLength(1440);
    expect(measurements.every((m) => zoneIds.has(m.zoneId))).toBe(true);
    expect(Math.max(...measurements.map((m) => m.occupancy))).toBeGreaterThan(0);
  });
});

describe('live adapter stubs', () => {
  it('fail loudly and name the settings a real feed needs', async () => {
    const flights = createFlightSource(loadConfig({ FLIGHT_SOURCE: 'vendor-api' }), ctx, airport.operatingDate);
    await expect(flights.snapshot()).rejects.toThrow(AdapterNotConfiguredError);
    await expect(flights.snapshot()).rejects.toThrow(/AODB_API_URL/);
    const zones = createZoneSource(loadConfig({ ZONE_SOURCE: 'fiware-live' }), ctx, airport.operatingDate);
    await expect(zones.snapshot()).rejects.toThrow(/NGSI_LD_BROKER_URL/);
  });
});

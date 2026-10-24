import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadAirportConfig } from '../airportConfig.ts';
import { writeAodbCsv } from '../formats/aodbCsv.ts';
import { generateDay } from './index.ts';
import { AIRLINES } from './reference.ts';

const airport = loadAirportConfig();
const day = generateDay(airport);

describe('mock data generator', () => {
  it('produces one day at spec scale', () => {
    expect(day.legs).toHaveLength(900);
    expect(day.platform.screens).toHaveLength(180);
    expect(day.platform.outlets).toHaveLength(40);
    expect(day.platform.campaigns).toHaveLength(25);
    expect(AIRLINES).toHaveLength(11);
  });

  it('pairs every arrival with its departure on the same aircraft, like the sample file', () => {
    const byId = new Map(day.legs.map((l) => [l.aodbFlightId, l]));
    for (const leg of day.legs) {
      const twin = byId.get(leg.linkedFlightId);
      expect(twin?.linkedFlightId).toBe(leg.aodbFlightId);
      expect(twin?.registration).toBe(leg.registration);
      expect(twin?.direction).not.toBe(leg.direction);
    }
  });

  it('is deterministic for a given seed', () => {
    const hash = (csv: string) => createHash('sha256').update(csv).digest('hex');
    expect(hash(writeAodbCsv(generateDay(airport).aodbEndOfDay))).toBe(hash(writeAodbCsv(day.aodbEndOfDay)));
  });

  it('never double-books a contact gate', () => {
    const windows = new Map<string, [number, number][]>();
    for (const leg of day.legs) {
      if (leg.direction !== 'D' || leg.cancelled || leg.gate.startsWith('BUS')) continue;
      const slot: [number, number] = [leg.estimated - 50 * 60_000, leg.estimated + 5 * 60_000];
      const taken = windows.get(leg.gate) ?? [];
      expect(taken.some(([a, b]) => slot[0] < b && slot[1] > a), `gate ${leg.gate} overlap`).toBe(false);
      windows.set(leg.gate, [...taken, slot]);
    }
  });

  it('follows the sample A-CDM timing rules', () => {
    for (const leg of day.legs.filter((l) => l.direction === 'D' && !l.cancelled)) {
      expect(leg.tsat).toBe(leg.estimated);
      expect(leg.tobt).toBe(leg.estimated - 2 * 60_000);
      expect(leg.runwayEstimated - leg.estimated).toBe(14 * 60_000);
    }
  });

  it('contains the worked-example crowd at Gates 41-46 around 14:10', () => {
    const row = (callsign: string) => day.aodbEndOfDay.find((r) => r.callsign === callsign);
    expect(row('HCZ501')).toMatchObject({ destination: 'ZHQ', gate: '42', pax_total: '240', flight_nature: 'I', delay_codes: '93', STA_STD: `${day.date}T14:55:00Z`, ETA_ETD: `${day.date}T15:40:00Z` });
    expect(row('SKJ881')).toMatchObject({ destination: 'SMG', gate: '44', pax_total: '180', flight_nature: 'I' });
    expect(row('AUQ233')).toMatchObject({ destination: 'OKZ', gate: '43', flight_nature: 'D' });
  });

  it('streams AIDX messages in time order with unique transaction ids', () => {
    const times = day.aidx.map((m) => m.deliverAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(new Set(day.aidx.map((m) => m.notification.transactionId)).size).toBe(day.aidx.length);
  });

  it('keeps the start-of-day snapshot free of actual times', () => {
    expect(day.aodbStartOfDay.every((r) => r.ALDT_ATOT === '' && r.AIBT_AOBT === '' && r.status === 'SCH')).toBe(true);
  });

  it('gives campaigns at most 30 days of history before the operating day', () => {
    const start = Date.parse(`${day.date}T00:00:00Z`) - 30 * 86_400_000;
    expect(day.platform.dailyStats.length).toBeGreaterThan(300);
    expect(day.platform.dailyStats.every((s) => Date.parse(`${s.date}T00:00:00Z`) >= start && s.date < day.date)).toBe(true);
  });
});

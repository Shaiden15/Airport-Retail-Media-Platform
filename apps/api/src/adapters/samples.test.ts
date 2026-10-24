import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flightSchema } from '@dwellcast/shared';
import { AODB_COLUMNS, parseAodbRows, parseCsv, writeAodbCsv } from '../formats/aodbCsv.ts';
import { buildAidxXml, parseAidxXml } from '../formats/aidxXml.ts';
import { samplesDir } from '../feeds/paths.ts';
import { aidxToFlightEvent, FlightIndex } from './aidx/aidxAdapter.ts';
import { aodbRowsToSnapshot } from './aodb/aodbAdapter.ts';
import { AcrisTranslator } from './acris/acrisAdapter.ts';
import type { NgsiEntity } from '../formats/acrisNgsi.ts';

const ctx = { homeAirport: 'MQI', now: () => '2026-10-14T12:00:00Z' };
const sampleCsv = readFileSync(join(samplesDir(), 'MQI_aodb_flights_2026-10-14_SYNTHETIC.csv'), 'utf8');
const sampleXml = readFileSync(join(samplesDir(), 'AIDX_FlightLegNotifRQ_XH960_arrival_ILLUSTRATIVE.xml'), 'utf8');
const acrisDir = join(samplesDir(), '..', 'reference', 'acris');

describe('AODB CSV adapter against the official sample', () => {
  const rows = parseAodbRows(sampleCsv);

  it('reads all 320 rows with the 33 sample columns', () => {
    expect(rows).toHaveLength(320);
    expect(Object.keys(rows[0] ?? {})).toEqual([...AODB_COLUMNS]);
  });

  it('translates every row into a valid canonical Flight', () => {
    const { flights, gateAssignments, aircraftTypes } = aodbRowsToSnapshot(rows, ctx);
    expect(flights).toHaveLength(320);
    for (const flight of flights) expect(() => flightSchema.parse(flight)).not.toThrow();
    expect(gateAssignments.length).toBeGreaterThan(0);
    expect(aircraftTypes.map((a) => a.icaoCode)).toContain('A359');
  });

  it('maps the XH960 arrival field by field', () => {
    const { flights } = aodbRowsToSnapshot(rows, ctx);
    const xh960 = flights.find((f) => f.airlineCode === 'XH' && f.flightNumber === '960');
    expect(xh960).toMatchObject({
      direction: 'arrival',
      origin: 'ZHQ',
      destination: 'MQI',
      international: true,
      region: 'gulf',
      terminalId: 'T2',
      stand: 'C38',
      baggageBelt: '3',
      status: 'on-block',
      seatCapacity: 283,
      paxCount: 224,
      codeshares: ['XD', 'XH'],
      cdm: { aibt: '2026-10-14T00:18:00Z', aobt: null },
      provenance: { source: 'aodb', sourceRef: 'aodb_flight_id=100180', adapter: 'aodb-csv' },
    });
  });

  it('splits multi-code delays and handles cancelled rows', () => {
    const { flights } = aodbRowsToSnapshot(rows, ctx);
    expect(flights.some((f) => f.delayCodes.join('/') === '63/11' && f.delayCodes.length === 2)).toBe(true);
    const cancelled = flights.filter((f) => f.status === 'cancelled');
    expect(cancelled).toHaveLength(6);
    expect(cancelled.every((f) => f.paxCount === 0 && f.actualTime === null)).toBe(true);
  });

  it('round-trips through the CSV writer, including quoted cells', () => {
    expect(parseAodbRows(writeAodbCsv(rows))).toEqual(rows);
    expect(parseCsv('a,"b,c","say ""hi"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'say "hi"'], ['1', '2', '3']]);
  });

  it('rejects a file missing required columns', () => {
    expect(() => parseAodbRows('aodb_flight_id,direction\n1,A\n')).toThrow(/missing columns/);
  });
});

describe('AIDX adapter against the official sample', () => {
  it('parses every field of the XH960 FlightLegNotifRQ', () => {
    const n = parseAidxXml(sampleXml);
    expect(n.leg).toEqual({ airline: 'XH', flightNumber: '960', departureAirport: 'ZHQ', arrivalAirport: 'MQI', originDate: '2026-10-13' });
    expect(n).toMatchObject({ publicStatus: 'ARR', operationalStatus: 'ONB', domestic: false, sequence: 184533 });
    expect(n.resources).toMatchObject({ usage: 'Actual', direction: 'Arrival', stand: 'C38', belt: '3', terminal: 'T2' });
    expect(n.times).toHaveLength(3);
    expect(n.cabins).toEqual([{ cls: 'J', seats: 30, pax: 27 }, { cls: 'Y', seats: 253, pax: 197 }]);
  });

  it('round-trips build then parse without loss', () => {
    const n = parseAidxXml(sampleXml);
    expect(parseAidxXml(buildAidxXml(n))).toEqual(n);
  });

  it('resolves the message to the matching AODB flight across the origin-date boundary', () => {
    const { flights } = aodbRowsToSnapshot(parseAodbRows(sampleCsv), ctx);
    const n = parseAidxXml(sampleXml);
    const flight = new FlightIndex(flights, 'MQI').resolve(n.leg);
    expect(flight?.provenance.sourceRef).toBe('aodb_flight_id=100180');
    const event = aidxToFlightEvent(n, flight ?? flights[0]!, ctx);
    expect(event).toMatchObject({ kind: 'status', status: 'on-block', provenance: { source: 'aidx', sourceRef: 'MQI-AODB-000184533' } });
  });

  it('does not expand XML entities (XXE safe)', () => {
    const hostile = sampleXml.replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY boom "EXPANDED">]>').replace('<PublicStatus>ARR</PublicStatus>', '<PublicStatus>&boom;</PublicStatus>');
    expect(parseAidxXml(hostile).publicStatus).not.toBe('EXPANDED');
  });

  it('rejects documents that are not AIDX flight-leg notifications', () => {
    expect(() => parseAidxXml('<Other/>')).toThrow(/IATA_AIDX_FlightLegNotifRQ/);
  });
});

describe('ACRIS adapter against the official FIWARE examples', () => {
  const load = (name: string) => JSON.parse(readFileSync(join(acrisDir, `${name}.example-normalized.jsonld`), 'utf8')) as NgsiEntity;
  const files = readdirSync(acrisDir).filter((f) => f.endsWith('.jsonld'));

  it('ships the six reference entity types', () => {
    expect(files).toHaveLength(6);
  });

  it('translates every reference entity into canonical locations', () => {
    const translator = new AcrisTranslator(ctx);
    const snap = translator.snapshot(['TerminalFacility', 'ConcourseFacility', 'ZoneAreaLocation', 'CheckpointFacility', 'PassengerQueue'].map(load), ctx.now());
    expect(snap.terminals[0]).toMatchObject({ code: 'BA/C', name: 'Boarding Area C' });
    expect(snap.concourses[0]).toMatchObject({ code: 'BA/B', name: 'Boarding Area B' });
    expect(snap.zones).toHaveLength(1);
    expect(snap.checkpoints[0]).toMatchObject({ id: 'control-1', kind: 'security' });
    expect(snap.queues[0]).toMatchObject({ id: '1', checkpointId: '1bdaec90-7a42-11e7-bb31-be2e44b06b34' });
  });

  it('reads queue measurements with provenance', () => {
    const m = new AcrisTranslator(ctx).measurement(load('QueueMeasurement'));
    expect(m).toMatchObject({ occupancy: 58, waitTimeSec: 645.9, projectedWaitTimeSec: 544.4, throughputPerHour: 384, queueId: '1', periodEnd: '2023-03-22T18:59:02Z', provenance: { source: 'acris' } });
  });
});

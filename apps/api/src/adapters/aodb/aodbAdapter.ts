import { flightKey, flightSchema, type AircraftType, type Flight, type FlightStatus, type GateAssignment } from '@dwellcast/shared';
import type { AodbRow } from '../../formats/aodbCsv.ts';
import { AIRCRAFT_BY_ICAO, CITY_BY_CODE } from '../../generator/reference.ts';
import type { AdapterContext, FlightSnapshot } from '../types.ts';

export const AODB_ADAPTER = 'aodb-csv';

const STATUS: ReadonlyMap<string, FlightStatus> = new Map([
  ['SCH', 'scheduled'],
  ['DLY', 'delayed'],
  ['BRD', 'boarding'],
  ['FCL', 'final-call'],
  ['GCL', 'gate-closed'],
  ['DEP', 'departed'],
  ['CNL', 'cancelled'],
  ['EXP', 'approaching'],
  ['LND', 'landed'],
  ['ARR', 'on-block'],
]);

export function mapAodbStatus(code: string): FlightStatus {
  return STATUS.get(code.trim().toUpperCase()) ?? 'scheduled';
}

const blank = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const minutesBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 60_000);

export function aodbRowToFlight(row: AodbRow, ctx: AdapterContext): Flight {
  const direction = row.direction === 'A' ? 'arrival' : 'departure';
  const scheduled = row.STA_STD;
  const estimated = blank(row.ETA_ETD);
  const block = blank(row.AIBT_AOBT);
  const destinationCity = direction === 'departure' ? row.destination : row.origin;
  const international = row.flight_nature === 'I';
  const city = CITY_BY_CODE.get(destinationCity);

  return flightSchema.parse({
    id: flightKey(row.airline_iata, row.flight_number, scheduled.slice(0, 10), direction),
    airlineCode: row.airline_iata,
    flightNumber: row.flight_number,
    direction,
    originDate: scheduled.slice(0, 10),
    origin: row.origin,
    destination: row.destination,
    via: blank(row.via),
    international,
    region: city?.region ?? (international ? 'other' : 'domestic'),
    terminalId: row.terminal,
    scheduledTime: scheduled,
    estimatedTime: estimated,
    actualTime: block,
    cdm: {
      tobt: blank(row.TOBT),
      tsat: blank(row.TSAT),
      aibt: direction === 'arrival' ? block : null,
      aobt: direction === 'departure' ? block : null,
    },
    gate: blank(row.gate),
    stand: blank(row.stand),
    checkInCounters: blank(row.checkin_counters),
    baggageBelt: blank(row.baggage_belt),
    aircraftType: row.aircraft_type_icao,
    registration: blank(row.aircraft_reg),
    seatCapacity: Number(row.seats),
    paxCount: Number(row.pax_total || 0),
    status: mapAodbStatus(row.status),
    delayMinutes: estimated ? Math.max(0, minutesBetween(scheduled, estimated)) : 0,
    delayCodes: row.delay_codes ? row.delay_codes.split('/').map((c) => c.trim()).filter(Boolean) : [],
    codeshares: row.codeshares ? row.codeshares.split('|').map((c) => c.trim()).filter(Boolean) : [],
    provenance: {
      source: 'aodb',
      sourceRef: `aodb_flight_id=${row.aodb_flight_id}`,
      adapter: AODB_ADAPTER,
      observedAt: row.last_update_utc,
      receivedAt: ctx.now(),
    },
  });
}

export function aodbRowsToSnapshot(rows: readonly AodbRow[], ctx: AdapterContext): FlightSnapshot {
  const flights = rows.map((row) => aodbRowToFlight(row, ctx));
  const gateAssignments: GateAssignment[] = flights
    .filter((f) => f.direction === 'departure' && f.gate && f.status !== 'cancelled')
    .map((f) => {
      const off = Date.parse(f.estimatedTime ?? f.scheduledTime);
      return {
        flightId: f.id,
        gate: f.gate ?? '',
        stand: f.stand,
        from: new Date(off - 50 * 60_000).toISOString(),
        to: new Date(off + 5 * 60_000).toISOString(),
        provenance: f.provenance,
      };
    });
  const types = new Set(flights.map((f) => f.aircraftType));
  const aircraftTypes: AircraftType[] = [...types].flatMap((icao) => {
    const known = AIRCRAFT_BY_ICAO.get(icao);
    return known ? [known] : [];
  });
  return { flights, gateAssignments, aircraftTypes };
}

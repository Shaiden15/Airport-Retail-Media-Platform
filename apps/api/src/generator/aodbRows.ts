import type { AodbRow } from '../formats/aodbCsv.ts';
import type { LegRecord } from './schedule.ts';

export type SnapshotKind = 'start-of-day' | 'end-of-day';

const iso = (ms: number | null): string => (ms === null ? '' : new Date(ms).toISOString().replace('.000Z', 'Z'));

// Start-of-day rows carry the plan only; end-of-day rows carry actuals, like the sample file
export function legToAodbRow(leg: LegRecord, kind: SnapshotKind, lastUpdate: number): AodbRow {
  const final = kind === 'end-of-day';
  const departure = leg.direction === 'D';
  const status = final ? (leg.cancelled ? 'CNL' : departure ? 'DEP' : 'ARR') : 'SCH';
  const callsign = `${leg.airline.icaoCode}${leg.flightNumber}`;

  return {
    aodb_flight_id: String(leg.aodbFlightId),
    linked_flight_id: String(leg.linkedFlightId),
    direction: leg.direction,
    airline_iata: leg.airline.code,
    airline_icao: leg.airline.icaoCode,
    flight_number: String(leg.flightNumber),
    callsign,
    service_type: 'J',
    flight_nature: leg.nature,
    origin: leg.origin,
    destination: leg.destination,
    via: '',
    terminal: leg.terminal,
    STA_STD: iso(leg.scheduled),
    ETA_ETD: iso(final ? leg.estimated : leg.scheduled),
    ELDT_ETOT: iso(final ? leg.runwayEstimated : departure ? leg.scheduled + 14 * 60_000 : leg.scheduled - 8 * 60_000),
    ALDT_ATOT: final ? iso(leg.runwayActual) : '',
    AIBT_AOBT: final ? iso(leg.blockActual) : '',
    TOBT: departure ? iso(final ? leg.tobt : leg.scheduled - 2 * 60_000) : '',
    TSAT: departure ? iso(final ? leg.tsat : null) : '',
    stand: leg.stand,
    gate: final || !leg.gateChange ? leg.gate : leg.gateChange.from,
    checkin_counters: leg.checkinCounters,
    baggage_belt: final ? leg.baggageBelt : '',
    aircraft_reg: leg.registration,
    aircraft_type_icao: leg.aircraftIcao,
    seats: String(leg.seats),
    // Before the day runs, a cancelled flight still shows its booked load
    pax_total: final ? (leg.pax === null ? '' : String(leg.pax)) : String(leg.pax ?? Math.round(leg.seats * 0.8)),
    status,
    delay_codes: final ? leg.delayCodes : '',
    codeshares: leg.codeshares,
    handler: leg.handler,
    last_update_utc: iso(lastUpdate),
  };
}

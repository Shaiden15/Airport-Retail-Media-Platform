import { Prng } from './prng.ts';
import { AIRLINES, CITY_BY_CODE, CODESHARE_SETS, DELAY_CODES, HANDLERS, HOURLY_WAVE, type AirlineReference } from './reference.ts';
import type { AirportLayout, LayoutGate } from './layout.ts';

// One leg as the AODB knows it; fields map one-to-one onto the 33 sample CSV columns
export interface LegRecord {
  aodbFlightId: number;
  linkedFlightId: number;
  direction: 'A' | 'D';
  airline: AirlineReference;
  flightNumber: number;
  nature: 'D' | 'I';
  origin: string;
  destination: string;
  terminal: string;
  scheduled: number;
  estimated: number;
  runwayEstimated: number;
  runwayActual: number | null;
  blockActual: number | null;
  tobt: number | null;
  tsat: number | null;
  stand: string;
  gate: string;
  checkinCounters: string;
  baggageBelt: string;
  registration: string;
  aircraftIcao: string;
  seats: number;
  businessSeats: number;
  pax: number | null;
  cancelled: boolean;
  delayMinutes: number;
  delayCodes: string;
  codeshares: string;
  handler: string;
  // Times when the AIDX feed announces changes during the day
  delayAnnouncedAt: number | null;
  gateChange: { at: number; from: string; to: string } | null;
  cancelAnnouncedAt: number | null;
}

export interface PinnedDeparture {
  airlineCode: string;
  flightNumber: number;
  destination: string;
  aircraftIcao: string;
  seats: number;
  businessSeats: number;
  pax: number;
  scheduledUtc: string;
  gate: string;
  delayMinutes: number;
  delayCode: string;
  delayAnnouncedUtc: string;
}

// Worked example from the spec, relabelled to the sample's fictional world (see docs/assumptions.md)
export const WORKED_EXAMPLE_FLIGHTS: readonly PinnedDeparture[] = [
  { airlineCode: 'XH', flightNumber: 501, destination: 'ZHQ', aircraftIcao: 'A359', seats: 283, businessSeats: 30, pax: 240, scheduledUtc: 'T14:55:00Z', gate: '42', delayMinutes: 45, delayCode: '93', delayAnnouncedUtc: 'T13:45:00Z' },
  { airlineCode: 'XD', flightNumber: 881, destination: 'SMG', aircraftIcao: 'A20N', seats: 186, businessSeats: 0, pax: 180, scheduledUtc: 'T14:40:00Z', gate: '44', delayMinutes: 0, delayCode: '', delayAnnouncedUtc: '' },
  { airlineCode: 'YA', flightNumber: 233, destination: 'OKZ', aircraftIcao: 'A359', seats: 316, businessSeats: 36, pax: 290, scheduledUtc: 'T14:35:00Z', gate: '43', delayMinutes: 0, delayCode: '', delayAnnouncedUtc: '' },
];

const MINUTE = 60_000;

interface GateBook {
  gate: LayoutGate;
  busy: [number, number][];
}

function isFree(book: GateBook, from: number, to: number): boolean {
  return book.busy.every(([a, b]) => to <= a || from >= b);
}

function letters(prng: Prng, count: number): string {
  const alphabet = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return Array.from({ length: count }, () => alphabet.charAt(prng.int(0, alphabet.length - 1))).join('');
}

function roundTo5(ms: number): number {
  return Math.round(ms / (5 * MINUTE)) * 5 * MINUTE;
}

export interface ScheduleOptions {
  date: string;
  seed: number;
}

export function generateSchedule(layout: AirportLayout, options: ScheduleOptions): LegRecord[] {
  const prng = new Prng(options.seed);
  const dayStart = Date.parse(`${options.date}T00:00:00Z`);
  const dayEnd = dayStart + 24 * 60 * MINUTE;

  const books = new Map<string, GateBook[]>();
  for (const terminal of layout.terminals) {
    books.set(`${terminal.id}:contact`, layout.gates.filter((g) => g.terminalId === terminal.id && !g.bus).map((gate) => ({ gate, busy: [] })));
    books.set(`${terminal.id}:bus`, layout.gates.filter((g) => g.terminalId === terminal.id && g.bus).map((gate) => ({ gate, busy: [] })));
  }

  const usedNumbers = new Map<string, Set<number>>(AIRLINES.map((a) => [a.code, new Set<number>()]));
  const registrations = new Map<string, string[]>();
  for (const airline of AIRLINES) {
    const fleetSize = Math.max(2, Math.ceil(airline.rotations / 3));
    registrations.set(airline.code, Array.from({ length: fleetSize }, () => `${airline.regPrefix}-${letters(prng, prng.chance(0.2) ? 2 : 3)}`));
  }

  const legs: LegRecord[] = [];
  let nextId = 200000;

  function takeGate(terminal: string, bus: boolean, from: number, to: number, preferred?: string): string {
    const pool = books.get(`${terminal}:${bus ? 'bus' : 'contact'}`) ?? [];
    const exact = preferred ? pool.find((b) => b.gate.id === preferred) : undefined;
    if (exact) {
      exact.busy.push([from, to]);
      return exact.gate.id;
    }
    const offset = prng.int(0, Math.max(0, pool.length - 1));
    for (let i = 0; i < pool.length; i++) {
      const book = pool.at((offset + i) % pool.length);
      if (book && isFree(book, from, to)) {
        book.busy.push([from, to]);
        return book.gate.id;
      }
    }
    return bus ? (pool.at(0)?.gate.id ?? '') : takeGate(terminal, true, from, to);
  }

  function flightNumberPair(airline: AirlineReference, wanted?: number): number {
    const used = usedNumbers.get(airline.code) ?? new Set<number>();
    let number = wanted ?? prng.int(airline.flightNumberRange[0], airline.flightNumberRange[1] - 1);
    // Arrival takes N and departure takes N+1, as in the sample (944 in, 945 out)
    while (used.has(number) || used.has(number + 1) || used.has(number - 1)) number = wanted !== undefined ? number - 2 : prng.int(airline.flightNumberRange[0], airline.flightNumberRange[1] - 1);
    used.add(number);
    used.add(number + 1);
    return number;
  }

  function terminalFor(airline: AirlineReference, international: boolean): string {
    if (international) return 'T2';
    const t1Share = new Map([['XD', 0.6], ['YN', 0.35], ['XU', 0.5], ['YF', 0.85]]).get(airline.code) ?? 0;
    return prng.chance(t1Share) ? 'T1' : 'T2';
  }

  function delayMinutes(): number {
    if (!prng.chance(0.32)) return 0;
    return prng.weighted([
      { value: prng.int(5, 14), weight: 50 },
      { value: prng.int(15, 29), weight: 30 },
      { value: prng.int(30, 59), weight: 15 },
      { value: prng.int(60, 120), weight: 5 },
    ]);
  }

  function addRotation(airline: AirlineReference, pinned?: PinnedDeparture): void {
    const cityCode = pinned?.destination ?? prng.weighted(airline.routes.map((r) => ({ value: r.code, weight: r.weight })));
    const city = CITY_BY_CODE.get(cityCode);
    if (!city) throw new Error(`unknown city ${cityCode}`);
    const fleet = pinned
      ? { icao: pinned.aircraftIcao, seats: pinned.seats, businessSeats: pinned.businessSeats, weight: 1 }
      : prng.weighted(airline.fleet.map((f) => ({ value: f, weight: f.weight })));
    const widebody = fleet.seats > 250;
    const turn = (fleet.icao === 'AT76' ? prng.int(45, 60) : widebody ? prng.int(80, 135) : prng.int(50, 90)) * MINUTE;

    let std: number;
    if (pinned) {
      std = Date.parse(`${options.date}${pinned.scheduledUtc}`);
    } else {
      do {
        const hour = prng.weighted(HOURLY_WAVE.map((weight, value) => ({ value, weight })));
        std = dayStart + hour * 60 * MINUTE + prng.int(0, 11) * 5 * MINUTE;
      } while (std - turn < dayStart + 5 * MINUTE || std > dayEnd - 5 * MINUTE);
    }
    const sta = roundTo5(std - turn);

    const number = flightNumberPair(airline, pinned ? pinned.flightNumber - 1 : undefined);
    const terminal = pinned ? 'T2' : terminalFor(airline, city.international);
    const depDelay = pinned ? pinned.delayMinutes : delayMinutes();
    const arrDelta = prng.chance(0.3) ? -prng.int(1, 12) : delayMinutes();
    const cancelled = !pinned && prng.chance(0.02);
    const bus = !pinned && prng.chance(0.18);
    const etd = std + depDelay * MINUTE;
    const gate = takeGate(terminal, bus, etd - 50 * MINUTE, etd + 5 * MINUTE, pinned?.gate);
    const standPool = bus ? (prng.chance(0.55) ? layout.stands.apron : layout.stands.remote) : layout.stands.contact;
    const stand = prng.pick(standPool);
    const registration = prng.pick(registrations.get(airline.code) ?? ['QX-AAA']);
    const handler = prng.pick(HANDLERS);
    const codeshares = prng.chance(0.39) ? prng.pick(CODESHARE_SETS) : '';
    const loadFactor = prng.float(0.7, 0.98);
    const nature = city.international ? 'I' : 'D';

    const arrId = nextId++;
    const depId = nextId++;
    const eta = sta + arrDelta * MINUTE;
    const eldt = eta - 8 * MINUTE;
    const arrCodes = arrDelta > 4 ? prng.weighted(DELAY_CODES.map((d) => ({ value: d.code, weight: d.weight }))) : '';

    legs.push({
      aodbFlightId: arrId,
      linkedFlightId: depId,
      direction: 'A',
      airline,
      flightNumber: number,
      nature,
      origin: city.code,
      destination: 'MQI',
      terminal,
      scheduled: sta,
      estimated: eta,
      runwayEstimated: eldt,
      runwayActual: cancelled ? null : eldt,
      blockActual: cancelled ? null : eldt + 8 * MINUTE,
      tobt: null,
      tsat: null,
      stand,
      gate: prng.chance(0.22) ? gate : '',
      checkinCounters: '',
      baggageBelt: cancelled ? '' : String(prng.int(1, 14)),
      registration,
      aircraftIcao: fleet.icao,
      seats: fleet.seats,
      businessSeats: fleet.businessSeats,
      pax: cancelled ? null : Math.round(fleet.seats * prng.float(0.7, 0.98)),
      cancelled,
      delayMinutes: Math.max(0, arrDelta),
      delayCodes: arrCodes,
      codeshares,
      handler,
      delayAnnouncedAt: arrDelta > 4 ? Math.max(dayStart, sta - prng.int(40, 90) * MINUTE) : null,
      gateChange: null,
      cancelAnnouncedAt: cancelled ? Math.max(dayStart, sta - 150 * MINUTE) : null,
    });

    const depCodes = pinned ? pinned.delayCode : depDelay > 0 ? prng.weighted(DELAY_CODES.map((d) => ({ value: d.code, weight: d.weight }))) : '';
    const announced = pinned?.delayAnnouncedUtc ? Date.parse(`${options.date}${pinned.delayAnnouncedUtc}`) : Math.max(dayStart, std - prng.int(30, 100) * MINUTE);
    const wantsGateChange = !pinned && !bus && !cancelled && prng.chance(0.05);
    let gateChange: LegRecord['gateChange'] = null;
    let finalGate = gate;
    if (wantsGateChange) {
      const moved = takeGate(terminal, false, etd - 50 * MINUTE, etd + 5 * MINUTE);
      if (moved !== gate) {
        gateChange = { at: Math.max(dayStart, std - prng.int(45, 80) * MINUTE), from: gate, to: moved };
        finalGate = moved;
      }
    }
    const checkLetter = 'ABCDEFGH'.charAt(prng.int(0, 7));

    legs.push({
      aodbFlightId: depId,
      linkedFlightId: arrId,
      direction: 'D',
      airline,
      flightNumber: number + 1,
      nature,
      origin: 'MQI',
      destination: city.code,
      terminal,
      scheduled: std,
      estimated: etd,
      runwayEstimated: etd + 14 * MINUTE,
      runwayActual: cancelled ? null : etd + prng.int(10, 25) * MINUTE,
      blockActual: cancelled ? null : etd,
      tobt: cancelled ? null : etd - 2 * MINUTE,
      tsat: cancelled ? null : etd,
      stand,
      gate: finalGate,
      checkinCounters: `${terminal}-${checkLetter}${String(prng.int(1, 14)).padStart(2, '0')}-${prng.int(30, 55)}`,
      baggageBelt: '',
      registration,
      aircraftIcao: fleet.icao,
      seats: fleet.seats,
      businessSeats: fleet.businessSeats,
      pax: cancelled ? null : (pinned?.pax ?? Math.round(fleet.seats * loadFactor)),
      cancelled,
      delayMinutes: depDelay,
      delayCodes: depCodes,
      codeshares,
      handler,
      delayAnnouncedAt: depDelay > 0 ? announced : null,
      gateChange,
      cancelAnnouncedAt: cancelled ? Math.max(dayStart, std - 120 * MINUTE) : null,
    });
  }

  for (const pinned of WORKED_EXAMPLE_FLIGHTS) {
    const airline = AIRLINES.find((a) => a.code === pinned.airlineCode);
    if (!airline) throw new Error(`unknown airline ${pinned.airlineCode}`);
    addRotation(airline, pinned);
  }
  for (const airline of AIRLINES) {
    const pinnedCount = WORKED_EXAMPLE_FLIGHTS.filter((p) => p.airlineCode === airline.code).length;
    for (let i = pinnedCount; i < airline.rotations; i++) addRotation(airline);
  }

  return legs.sort((a, b) => a.scheduled - b.scheduled || a.aodbFlightId - b.aodbFlightId);
}

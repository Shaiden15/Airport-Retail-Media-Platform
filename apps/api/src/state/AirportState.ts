import type { Flight, FlightEvent, QueueMeasurement, Screen } from '@dwellcast/shared';
import type { FlightSnapshot } from '../adapters/types.ts';

export interface ZoneInfo {
  id: string;
  name: string;
  terminalId: string;
  kind: 'gate-area' | 'retail' | 'security' | 'landside';
  centroid: { x: number; y: number };
}

export interface GateInfo {
  id: string;
  terminalId: string;
  zoneId: string;
  position: { x: number; y: number };
}

export interface FlightChange {
  flight: Flight;
  previousGate: string | null;
  event: FlightEvent;
}

const statusAfter = (flight: Flight, event: FlightEvent): Flight['status'] => {
  if (event.kind === 'cancel') return 'cancelled';
  if (event.status) return event.status;
  if (event.kind === 'delay') return 'delayed';
  return flight.status;
};

// Live view of the airport that every engine component reads; only the feed pump and injector write to it
export class AirportState {
  readonly flights = new Map<string, Flight>();
  readonly queues = new Map<string, QueueMeasurement>();
  readonly screens = new Map<string, Screen>();
  readonly gateChangedAt = new Map<string, number>();
  readonly zones: ReadonlyMap<string, ZoneInfo>;
  readonly gates: ReadonlyMap<string, GateInfo>;
  private baseline: Flight[] = [];
  private readonly screenBaseline = new Map<string, Screen['status']>();
  version = 0;

  constructor(zones: readonly ZoneInfo[], gates: readonly GateInfo[], screens: readonly Screen[]) {
    this.zones = new Map(zones.map((z) => [z.id, z]));
    this.gates = new Map(gates.map((g) => [g.id, g]));
    for (const s of screens) {
      this.screens.set(s.id, structuredClone(s));
      this.screenBaseline.set(s.id, s.status);
    }
  }

  loadSnapshot(snapshot: FlightSnapshot): void {
    this.baseline = snapshot.flights.map((f) => structuredClone(f));
    this.reset();
  }

  // Back to the start-of-day state, used before replaying feeds after a backwards jump
  reset(): void {
    this.flights.clear();
    for (const f of this.baseline) this.flights.set(f.id, structuredClone(f));
    this.queues.clear();
    this.gateChangedAt.clear();
    for (const [id, status] of this.screenBaseline) {
      const screen = this.screens.get(id);
      if (screen) screen.status = status;
    }
    this.version++;
  }

  applyFlightEvent(event: FlightEvent): FlightChange | null {
    const flight = this.flights.get(event.flightId);
    if (!flight) return null;
    const previousGate = flight.gate;
    flight.status = statusAfter(flight, event);
    if (event.gate && event.gate !== previousGate && previousGate) this.gateChangedAt.set(flight.id, Date.parse(event.provenance.observedAt));
    if (event.gate) flight.gate = event.gate;
    if (event.estimatedTime) {
      flight.estimatedTime = event.estimatedTime;
      flight.delayMinutes = Math.max(0, Math.round((Date.parse(event.estimatedTime) - Date.parse(flight.scheduledTime)) / 60_000));
    }
    if (event.delayMinutes !== null && !event.estimatedTime) flight.delayMinutes = event.delayMinutes;
    if (event.delayCodes.length) flight.delayCodes = event.delayCodes;
    if (flight.status === 'departed' && !flight.actualTime) flight.actualTime = event.provenance.observedAt;
    if (flight.status === 'on-block' && !flight.actualTime) flight.actualTime = event.provenance.observedAt;
    flight.provenance = event.provenance;
    this.version++;
    return { flight, previousGate, event };
  }

  applyMeasurement(m: QueueMeasurement): void {
    this.queues.set(m.queueId, m);
    this.version++;
  }

  setScreenStatus(screenId: string, status: Screen['status']): Screen | null {
    const screen = this.screens.get(screenId);
    if (!screen) return null;
    screen.status = status;
    this.version++;
    return screen;
  }

  departuresAtGates(gates: ReadonlySet<string>): Flight[] {
    const out: Flight[] = [];
    for (const f of this.flights.values()) {
      if (f.direction === 'departure' && f.gate && gates.has(f.gate)) out.push(f);
    }
    return out;
  }

  departuresInTerminal(terminalId: string): Flight[] {
    const out: Flight[] = [];
    for (const f of this.flights.values()) {
      if (f.direction === 'departure' && f.terminalId === terminalId) out.push(f);
    }
    return out;
  }
}

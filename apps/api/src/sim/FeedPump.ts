import type { FlightEvent, QueueMeasurement } from '@dwellcast/shared';
import type { FlightSource, ZoneSource } from '../adapters/types.ts';
import type { AirportState, FlightChange } from '../state/AirportState.ts';

export interface FeedHealth {
  name: string;
  adapter: string;
  received: number;
  delivered: number;
  lastMessageAt: string | null;
  status: 'ok' | 'lagging' | 'down';
}

interface Timed<T> {
  at: number;
  item: T;
}

// Buffers adapter streams and delivers each record to the airport state when simulation time reaches it
export class FeedPump {
  private flightEvents: Timed<FlightEvent>[] = [];
  private baselineEvents: Timed<FlightEvent>[] = [];
  private measurements: Timed<QueueMeasurement>[] = [];
  private flightCursor = 0;
  private measureCursor = 0;
  private flightsDone = false;
  private zonesDone = false;
  private flightError: string | null = null;
  private zoneError: string | null = null;

  constructor(
    private readonly state: AirportState,
    private readonly flightSource: FlightSource,
    private readonly zoneSource: ZoneSource,
  ) {}

  async start(): Promise<void> {
    this.state.loadSnapshot(await this.flightSource.snapshot());
    await this.zoneSource.snapshot();
    await Promise.all([this.drainFlights(), this.drainZones()]);
    this.baselineEvents = this.flightEvents.map((e) => ({ ...e }));
  }

  // Drops every injected event and shifted milestone, back to the feed exactly as delivered
  restoreBaseline(): void {
    this.flightEvents = this.baselineEvents.map((e) => ({ ...e }));
    this.rewind();
  }

  private async drainFlights(): Promise<void> {
    try {
      for await (const event of this.flightSource.stream()) this.insertFlightEvent(event);
    } catch (error) {
      this.flightError = error instanceof Error ? error.message : String(error);
    }
    this.flightsDone = true;
  }

  private async drainZones(): Promise<void> {
    try {
      for await (const m of this.zoneSource.stream()) this.measurements.push({ at: Date.parse(m.periodEnd), item: m });
    } catch (error) {
      this.zoneError = error instanceof Error ? error.message : String(error);
    }
    this.zonesDone = true;
  }

  // Keeps the buffer time-ordered; injected events land after anything already scheduled for the same instant
  insertFlightEvent(event: FlightEvent): void {
    const at = Date.parse(event.provenance.observedAt);
    let i = this.flightEvents.length;
    while (i > 0 && (this.flightEvents.at(i - 1)?.at ?? 0) > at) i--;
    this.flightEvents.splice(i, 0, { at, item: event });
    if (i < this.flightCursor) this.flightCursor++;
  }

  // A live delay moves this flight's not-yet-delivered milestones (boarding, gate closed, departure) by the same amount
  shiftFutureEvents(flightId: string, fromMs: number, deltaMs: number): number {
    let moved = 0;
    const kept: Timed<FlightEvent>[] = [];
    const shifted: Timed<FlightEvent>[] = [];
    this.flightEvents.forEach((entry, i) => {
      const shiftable = i >= this.flightCursor && entry.at > fromMs && entry.item.flightId === flightId && (entry.item.kind === 'status' || entry.item.kind === 'boarding');
      if (!shiftable) {
        kept.push(entry);
        return;
      }
      const at = entry.at + deltaMs;
      shifted.push({ at, item: { ...entry.item, provenance: { ...entry.item.provenance, observedAt: new Date(at).toISOString() } } });
      moved++;
    });
    this.flightEvents = kept;
    for (const entry of shifted) this.insertFlightEvent(entry.item);
    return moved;
  }

  // A live gate change must not be undone by later messages that still carry the old gate
  retargetFutureGate(flightId: string, fromMs: number, gate: string): number {
    let patched = 0;
    this.flightEvents.forEach((entry, i) => {
      if (i >= this.flightCursor && entry.at > fromMs && entry.item.flightId === flightId && entry.item.gate && entry.item.gate !== gate) {
        entry.item = { ...entry.item, gate };
        patched++;
      }
    });
    return patched;
  }

  deliverUntil(simMs: number): { changes: FlightChange[]; measurements: QueueMeasurement[] } {
    const changes: FlightChange[] = [];
    const measurements: QueueMeasurement[] = [];
    for (let next = this.flightEvents.at(this.flightCursor); next && next.at <= simMs; next = this.flightEvents.at(this.flightCursor)) {
      const change = this.state.applyFlightEvent(next.item);
      if (change) changes.push(change);
      this.flightCursor++;
    }
    for (let next = this.measurements.at(this.measureCursor); next && next.at <= simMs; next = this.measurements.at(this.measureCursor)) {
      this.state.applyMeasurement(next.item);
      measurements.push(next.item);
      this.measureCursor++;
    }
    return { changes, measurements };
  }

  rewind(): void {
    this.state.reset();
    this.flightCursor = 0;
    this.measureCursor = 0;
  }

  health(simMs: number): FeedHealth[] {
    const last = <T>(list: Timed<T>[], cursor: number) => list.at(cursor - 1)?.at ?? null;
    const status = (error: string | null, lastAt: number | null, maxLagMs: number): FeedHealth['status'] =>
      error ? 'down' : lastAt === null || simMs - lastAt > maxLagMs ? 'lagging' : 'ok';
    const flightLast = last(this.flightEvents, this.flightCursor);
    const zoneLast = last(this.measurements, this.measureCursor);
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
    return [
      { name: 'AODB', adapter: `${this.flightSource.name} (aodb-csv)`, received: this.state.flights.size, delivered: this.state.flights.size, lastMessageAt: iso(flightLast), status: this.flightError ? 'down' : 'ok' },
      { name: 'AIDX', adapter: `${this.flightSource.name} (aidx-xml)`, received: this.flightEvents.length, delivered: this.flightCursor, lastMessageAt: iso(flightLast), status: status(this.flightError, flightLast, 30 * 60_000) },
      { name: 'ACRIS', adapter: `${this.zoneSource.name} (ngsi-ld)`, received: this.measurements.length, delivered: this.measureCursor, lastMessageAt: iso(zoneLast), status: status(this.zoneError, zoneLast, 10 * 60_000) },
    ];
  }

  get ready(): boolean {
    return this.flightsDone && this.zonesDone;
  }

  // Messages delivered in the last simulated minute, for the feed health panel
  ratePerMinute(simMs: number): { aidx: number; acris: number } {
    const since = simMs - 60_000;
    const count = <T>(list: Timed<T>[], cursor: number) => {
      let n = 0;
      for (let i = cursor - 1; i >= 0 && (list.at(i)?.at ?? 0) > since; i--) n++;
      return n;
    };
    return { aidx: count(this.flightEvents, this.flightCursor), acris: count(this.measurements, this.measureCursor) };
  }
}

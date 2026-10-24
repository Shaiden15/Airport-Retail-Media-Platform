import type { Flight } from '@dwellcast/shared';
import { aidxToFlightEvent } from '../adapters/aidx/aidxAdapter.ts';
import type { AdapterContext } from '../adapters/types.ts';
import { buildAidxXml, parseAidxXml, type AidxNotification } from '../formats/aidxXml.ts';
import type { AirportState, FlightChange } from '../state/AirportState.ts';
import type { FeedPump } from './FeedPump.ts';
import type { SimClock } from './SimClock.ts';

const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');

export class InjectionError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'InjectionError';
  }
}

// Demo controls that publish real AIDX messages into the same adapter path as the feed
export class EventInjector {
  private sequence = 900000;

  constructor(
    private readonly state: AirportState,
    private readonly pump: FeedPump,
    private readonly clock: SimClock,
    private readonly ctx: AdapterContext,
  ) {}

  private departure(flightId: string): Flight {
    const flight = this.state.flights.get(flightId);
    if (!flight) throw new InjectionError(`unknown flight ${flightId}`, 404);
    if (flight.direction !== 'departure') throw new InjectionError('only departures can be delayed or moved');
    if (flight.status === 'departed' || flight.status === 'cancelled') throw new InjectionError(`${flight.airlineCode}${flight.flightNumber} has already ${flight.status}`);
    return flight;
  }

  private publish(flight: Flight, patch: Partial<AidxNotification>): { xml: string; change: FlightChange | null } {
    const now = this.clock.nowMs();
    const seq = ++this.sequence;
    const notification: AidxNotification = {
      transactionId: `MQI-INJ-${String(seq).padStart(9, '0')}`,
      sequence: seq,
      timestamp: iso(now),
      originator: 'MQI',
      leg: { airline: flight.airlineCode, flightNumber: flight.flightNumber, departureAirport: flight.origin, arrivalAirport: flight.destination, originDate: flight.originDate },
      domestic: !flight.international,
      publicStatus: null,
      operationalStatus: null,
      remark: null,
      codeshares: [],
      resources: null,
      times: [],
      aircraft: null,
      cabins: [],
      delays: [],
      ...patch,
    };
    // Round-trip through XML so injected events take exactly the path a real AIDX message would
    const xml = buildAidxXml(notification);
    const event = aidxToFlightEvent(parseAidxXml(xml), flight, this.ctx);
    this.pump.insertFlightEvent(event);
    const { changes } = this.pump.deliverUntil(now);
    return { xml, change: changes.find((c) => c.flight.id === flight.id) ?? null };
  }

  delay(flightId: string, totalDelayMinutes: number, code = '93'): { xml: string; change: FlightChange | null; shiftedMilestones: number } {
    const flight = this.departure(flightId);
    const oldEtd = Date.parse(flight.estimatedTime ?? flight.scheduledTime);
    const newEtd = Date.parse(flight.scheduledTime) + totalDelayMinutes * 60_000;
    const shiftedMilestones = this.pump.shiftFutureEvents(flight.id, this.clock.nowMs(), newEtd - oldEtd);
    const { xml, change } = this.publish(flight, {
      publicStatus: 'DLY',
      times: [
        { qualifier: 'OFB', type: 'SCT', at: iso(Date.parse(flight.scheduledTime)) },
        { qualifier: 'OFB', type: 'EST', at: iso(newEtd) },
      ],
      delays: [{ code, minutes: totalDelayMinutes }],
    });
    return { xml, change, shiftedMilestones };
  }

  gateChange(flightId: string, gate: string): { xml: string; change: FlightChange | null } {
    const flight = this.departure(flightId);
    if (!this.state.gates.has(gate)) throw new InjectionError(`unknown gate ${gate}`, 404);
    if (flight.gate === gate) throw new InjectionError(`already at gate ${gate}`);
    this.pump.retargetFutureGate(flight.id, this.clock.nowMs(), gate);
    return this.publish(flight, {
      remark: `GATE CHANGE FROM ${flight.gate ?? 'TBA'}`,
      resources: { usage: 'Planned', direction: 'Departure', stand: flight.stand, gate, belt: null, terminal: flight.terminalId },
    });
  }
}

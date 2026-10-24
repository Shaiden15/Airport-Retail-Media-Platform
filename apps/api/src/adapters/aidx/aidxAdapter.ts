import { flightEventSchema, type Flight, type FlightEvent, type FlightStatus } from '@dwellcast/shared';
import type { AidxNotification } from '../../formats/aidxXml.ts';
import type { AdapterContext } from '../types.ts';

export const AIDX_ADAPTER = 'aidx-xml';

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

// Finds the canonical flight for an AIDX leg identifier (airline, number, direction, origin date)
export class FlightIndex {
  private readonly byKey = new Map<string, Flight[]>();

  constructor(
    flights: readonly Flight[],
    private readonly homeAirport: string,
  ) {
    for (const f of flights) {
      const key = `${f.airlineCode}|${f.flightNumber}|${f.direction}`;
      this.byKey.set(key, [...(this.byKey.get(key) ?? []), f]);
    }
  }

  resolve(leg: AidxNotification['leg']): Flight | null {
    const direction = leg.arrivalAirport === this.homeAirport ? 'arrival' : 'departure';
    const candidates = this.byKey.get(`${leg.airline}|${leg.flightNumber}|${direction}`) ?? [];
    const origin = Date.parse(`${leg.originDate}T00:00:00Z`);
    // Arrivals may land the day after they left their origin
    return candidates.find((f) => {
      const day = Date.parse(`${f.scheduledTime.slice(0, 10)}T00:00:00Z`);
      return day === origin || day === origin + 86_400_000;
    }) ?? null;
  }
}

function eventKind(n: AidxNotification): FlightEvent['kind'] {
  if (n.publicStatus === 'CNL') return 'cancel';
  if (n.publicStatus === 'DLY') return 'delay';
  if (n.publicStatus === 'BRD') return 'boarding';
  if (!n.publicStatus && n.resources?.gate && n.resources.usage === 'Planned') return 'gate-change';
  if (n.publicStatus === 'EXP' || (!n.publicStatus && n.times.some((t) => t.type === 'EST'))) return 'estimate';
  return 'status';
}

export function aidxToFlightEvent(n: AidxNotification, flight: Flight, ctx: AdapterContext): FlightEvent {
  const estimateQualifier = flight.direction === 'departure' ? 'OFB' : 'ONB';
  const estimate = n.times.find((t) => t.qualifier === estimateQualifier && t.type === 'EST')?.at ?? null;
  const delay = n.delays.reduce<number | null>((max, d) => Math.max(max ?? 0, d.minutes), null);
  const previousGate = n.remark?.startsWith('GATE CHANGE FROM ') ? n.remark.slice('GATE CHANGE FROM '.length).trim() : null;

  return flightEventSchema.parse({
    id: n.transactionId || `${flight.id}-${n.sequence}`,
    flightId: flight.id,
    kind: eventKind(n),
    status: n.publicStatus ? (STATUS.get(n.publicStatus) ?? null) : null,
    gate: n.resources?.gate ?? null,
    previousGate,
    estimatedTime: estimate,
    delayMinutes: delay,
    delayCodes: n.delays.map((d) => d.code),
    provenance: {
      source: 'aidx',
      sourceRef: n.transactionId || `seq=${n.sequence}`,
      adapter: AIDX_ADAPTER,
      observedAt: n.timestamp,
      receivedAt: ctx.now(),
    },
  });
}

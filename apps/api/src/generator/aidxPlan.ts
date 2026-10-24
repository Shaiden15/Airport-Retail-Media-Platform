import type { AidxNotification, AidxTime } from '../formats/aidxXml.ts';
import { AIRCRAFT_BY_ICAO, CITY_BY_CODE } from './reference.ts';
import type { LegRecord } from './schedule.ts';

export interface PlannedMessage {
  deliverAt: number;
  notification: AidxNotification;
}

const MINUTE = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

function originDate(leg: LegRecord): string {
  if (leg.direction === 'D') return iso(leg.scheduled).slice(0, 10);
  // Arrivals are identified by the date the flight left its origin, as in the sample (XH960)
  const block = CITY_BY_CODE.get(leg.origin)?.blockMinutes ?? 120;
  return iso(leg.scheduled - block * MINUTE).slice(0, 10);
}

function cabins(leg: LegRecord): AidxNotification['cabins'] {
  if (leg.pax === null) return [];
  if (leg.businessSeats === 0) return [{ cls: 'Y', seats: leg.seats, pax: leg.pax }];
  const businessPax = Math.min(leg.businessSeats, Math.round(leg.pax * (leg.businessSeats / leg.seats) * 0.9));
  return [
    { cls: 'J', seats: leg.businessSeats, pax: businessPax },
    { cls: 'Y', seats: leg.seats - leg.businessSeats, pax: leg.pax - businessPax },
  ];
}

export function planAidxMessages(legs: readonly LegRecord[]): PlannedMessage[] {
  const out: PlannedMessage[] = [];

  for (const leg of legs) {
    const departure = leg.direction === 'D';
    const base = (at: number, patch: Partial<AidxNotification>): PlannedMessage => ({
      deliverAt: at,
      notification: {
        transactionId: '',
        sequence: 0,
        timestamp: iso(at),
        originator: 'MQI',
        leg: {
          airline: leg.airline.code,
          flightNumber: String(leg.flightNumber),
          departureAirport: leg.origin,
          arrivalAirport: leg.destination,
          originDate: originDate(leg),
        },
        domestic: leg.nature === 'D',
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
      },
    });
    const delays = leg.delayCodes ? leg.delayCodes.split('/').map((code) => ({ code, minutes: leg.delayMinutes })) : [];
    const aircraftIata = AIRCRAFT_BY_ICAO.get(leg.aircraftIcao)?.iataCode ?? leg.aircraftIcao;
    const time = (qualifier: AidxTime['qualifier'], type: AidxTime['type'], at: number): AidxTime => ({ qualifier, type, at: iso(at) });

    if (leg.cancelAnnouncedAt !== null) {
      out.push(base(leg.cancelAnnouncedAt, { publicStatus: 'CNL', remark: 'FLIGHT CANCELLED' }));
      continue;
    }

    if (departure) {
      const resource = (usage: string, gate: string) => ({ usage, direction: 'Departure' as const, stand: leg.stand, gate, belt: null, terminal: leg.terminal });
      if (leg.delayAnnouncedAt !== null) {
        out.push(base(leg.delayAnnouncedAt, { publicStatus: 'DLY', times: [time('OFB', 'SCT', leg.scheduled), time('OFB', 'EST', leg.estimated)], delays }));
      }
      if (leg.gateChange) {
        out.push(base(leg.gateChange.at, { remark: `GATE CHANGE FROM ${leg.gateChange.from}`, resources: resource('Planned', leg.gateChange.to) }));
      }
      out.push(base(leg.estimated - 40 * MINUTE, { publicStatus: 'BRD', resources: resource('Actual', leg.gate) }));
      out.push(base(leg.estimated - 20 * MINUTE, { publicStatus: 'FCL' }));
      out.push(base(leg.estimated - 15 * MINUTE, { publicStatus: 'GCL' }));
      if (leg.blockActual !== null) {
        out.push(base(leg.blockActual, {
          publicStatus: 'DEP',
          operationalStatus: 'OFB',
          times: [time('OFB', 'SCT', leg.scheduled), time('OFB', 'ACT', leg.blockActual)],
          aircraft: { type: aircraftIata, registration: leg.registration },
          cabins: cabins(leg),
        }));
      }
      if (leg.runwayActual !== null) {
        out.push(base(leg.runwayActual, { publicStatus: 'DEP', operationalStatus: 'TKO', times: [time('TKO', 'ACT', leg.runwayActual)] }));
      }
    } else {
      const late = leg.delayMinutes > 4;
      const estimateAt = leg.delayAnnouncedAt ?? Math.max(leg.scheduled - 60 * MINUTE, Date.parse(`${iso(leg.scheduled).slice(0, 10)}T00:00:00Z`));
      out.push(base(estimateAt, { publicStatus: late ? 'DLY' : 'EXP', times: [time('TDN', 'EST', leg.runwayEstimated), time('ONB', 'EST', leg.estimated)], delays: late ? delays : [] }));
      if (leg.runwayActual !== null) {
        out.push(base(leg.runwayActual, { publicStatus: 'LND', operationalStatus: 'TDN', times: [time('TDN', 'ACT', leg.runwayActual)] }));
      }
      if (leg.blockActual !== null && leg.runwayActual !== null) {
        out.push(base(leg.blockActual, {
          publicStatus: 'ARR',
          operationalStatus: 'ONB',
          resources: { usage: 'Actual', direction: 'Arrival', stand: leg.stand, gate: leg.gate || null, belt: leg.baggageBelt || null, terminal: leg.terminal },
          times: [time('ONB', 'SCT', leg.scheduled), time('TDN', 'ACT', leg.runwayActual), time('ONB', 'ACT', leg.blockActual)],
          aircraft: { type: aircraftIata, registration: leg.registration },
          cabins: cabins(leg),
        }));
      }
    }
  }

  out.sort((a, b) => a.deliverAt - b.deliverAt);
  out.forEach((message, i) => {
    message.notification.sequence = 500001 + i;
    message.notification.transactionId = `MQI-AODB-${String(500001 + i).padStart(9, '0')}`;
  });
  return out;
}

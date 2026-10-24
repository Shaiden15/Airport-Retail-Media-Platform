import {
  checkpointEntity,
  concourseEntity,
  measurementEntity,
  queueEntity,
  terminalEntity,
  zoneEntity,
  type AirportRef,
  type NgsiEntity,
} from '../formats/acrisNgsi.ts';
import type { AirportLayout, LayoutCheckpoint } from './layout.ts';
import { Prng } from './prng.ts';
import type { LegRecord } from './schedule.ts';

const MINUTE = 60_000;
const WINDOW = 5 * MINUTE;
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

export interface AcrisFeed {
  entities: NgsiEntity[];
  measurements: { deliverAt: number; entity: NgsiEntity }[];
}

// Share of a flight's passengers clearing security in each 5-minute window, peaking about 90 minutes before departure
function arrivalCurve(minutesBefore: number): number {
  if (minutesBefore < 40 || minutesBefore > 170) return 0;
  const peak = 95;
  const spread = 32;
  return Math.exp(-((minutesBefore - peak) ** 2) / (2 * spread * spread));
}

export function generateAcris(layout: AirportLayout, legs: readonly LegRecord[], airport: AirportRef, date: string, seed: number): AcrisFeed {
  const prng = new Prng(seed ^ 0xac215);
  const terminalById = new Map(layout.terminals.map((t) => [t.id, t]));
  const zoneById = new Map(layout.zones.map((z) => [z.id, z]));

  const checkpointRef = (cp: LayoutCheckpoint) => {
    const terminal = terminalById.get(cp.terminalId);
    const zone = zoneById.get(cp.zoneId);
    if (!terminal || !zone) throw new Error(`checkpoint ${cp.id} has no terminal or zone`);
    return { id: cp.id, name: cp.name, kind: cp.kind, zoneName: zone.name, terminal: { code: terminal.code, name: terminal.name }, position: { x: zone.centroid.x, y: zone.centroid.y, name: cp.name } };
  };

  const entities: NgsiEntity[] = [
    ...layout.terminals.map((t) => terminalEntity(airport, t.id, t.code, t.name)),
    ...layout.concourses.map((c) => {
      const terminal = terminalById.get(c.terminalId);
      return concourseEntity(airport, c.id, c.code, c.name, { code: terminal?.code ?? c.terminalId, name: terminal?.name ?? c.terminalId });
    }),
    ...layout.zones.map((z) => zoneEntity(airport, z.id, z.name, terminalById.get(z.terminalId)?.name ?? z.terminalId, { x: z.centroid.x, y: z.centroid.y, name: z.name })),
    ...layout.checkpoints.map((cp) => checkpointEntity(airport, checkpointRef(cp))),
    ...layout.queues.map((q) => {
      const cp = layout.checkpoints.find((c) => c.id === q.checkpointId);
      if (!cp) throw new Error(`queue ${q.id} has no checkpoint`);
      return queueEntity(airport, q, checkpointRef(cp));
    }),
  ];

  const dayStart = Date.parse(`${date}T00:00:00Z`);
  const windows = (24 * 60) / 5;
  const departures = legs.filter((l) => l.direction === 'D' && !l.cancelled);
  const measurements: AcrisFeed['measurements'] = [];
  const backlog = new Map(layout.queues.map((q) => [q.id, 0]));

  for (let w = 0; w < windows; w++) {
    const start = dayStart + w * WINDOW;
    const end = start + WINDOW;
    for (const queue of layout.queues) {
      const cp = layout.checkpoints.find((c) => c.id === queue.checkpointId);
      if (!cp) continue;
      const fast = queue.name.includes('Fast');
      let demand = 0;
      for (const leg of departures) {
        if (leg.terminal !== cp.terminalId) continue;
        if (cp.kind === 'passport' && leg.nature !== 'I') continue;
        const minutesBefore = (leg.estimated - end) / MINUTE;
        const curve = arrivalCurve(minutesBefore);
        if (curve === 0) continue;
        const businessShare = leg.businessSeats / leg.seats;
        const queueShare = cp.kind === 'passport' ? 1 : fast ? Math.max(0.06, businessShare) : 1 - Math.max(0.06, businessShare);
        demand += (leg.pax ?? 0) * queueShare * curve * 0.105;
      }
      const capacity = (queue.capacityPerHour / 12) * prng.jitter(0.08);
      const waiting = Math.max(0, (backlog.get(queue.id) ?? 0) + demand - capacity);
      backlog.set(queue.id, waiting);
      const served = Math.min(capacity, (backlog.get(queue.id) ?? 0) + demand);
      const waitTimeSec = Math.round((waiting / (queue.capacityPerHour / 3600)) * 10) / 10 + 60;
      const id = `${queue.id}-${iso(start).slice(11, 16).replace(':', '')}`;
      measurements.push({
        deliverAt: end,
        entity: measurementEntity(
          airport,
          { id, occupancy: Math.round(waiting + served / 4), waitTimeSec, projectedWaitTimeSec: Math.round(waitTimeSec * prng.jitter(0.15) * 10) / 10, throughputPerHour: Math.round(served * 12), start: iso(start), end: iso(end) },
          queue,
          checkpointRef(cp),
        ),
      });
    }
  }

  return { entities, measurements };
}

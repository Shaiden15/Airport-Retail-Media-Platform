import {
  checkpointSchema,
  concourseSchema,
  passengerQueueSchema,
  queueMeasurementSchema,
  terminalSchema,
  zoneSchema,
  type Provenance,
  type QueueMeasurement,
  type Zone,
} from '@dwellcast/shared';
import { localId, num, path, propertyValue, str, type NgsiEntity } from '../../formats/acrisNgsi.ts';
import type { AdapterContext, ZoneSnapshot } from '../types.ts';

export const ACRIS_ADAPTER = 'acris-ngsi-ld';

export function zoneKindFromName(name: string): Zone['kind'] {
  const lower = name.toLowerCase();
  if (lower.includes('gate')) return 'gate-area';
  if (lower.includes('security') || lower.includes('passport')) return 'security';
  if (lower.includes('check-in') || lower.includes('arrivals hall') || lower.includes('landside')) return 'landside';
  return 'retail';
}

// Translates ACRIS NGSI-LD entities into canonical locations; zone and checkpoint links resolve by identifier or name
export class AcrisTranslator {
  private readonly zoneIdByName = new Map<string, string>();
  private readonly terminalIdByName = new Map<string, string>();
  private readonly terminalIdByCode = new Map<string, string>();
  private readonly checkpointZone = new Map<string, string>();

  constructor(private readonly ctx: AdapterContext) {}

  private provenance(entity: NgsiEntity, observedAt: string): Provenance {
    return { source: 'acris', sourceRef: entity.id, adapter: ACRIS_ADAPTER, observedAt, receivedAt: this.ctx.now() };
  }

  private terminalFor(nameOrCode: string | null): string {
    if (!nameOrCode) return 'unknown';
    return this.terminalIdByCode.get(nameOrCode) ?? this.terminalIdByName.get(nameOrCode) ?? nameOrCode;
  }

  snapshot(entities: readonly NgsiEntity[], observedAt: string): ZoneSnapshot {
    const of = (type: string) => entities.filter((e) => e.type === type);

    const terminals = of('TerminalFacility').map((e) => {
      const id = localId(e);
      const code = str(propertyValue(e, 'Identifier')) ?? id;
      const name = str(propertyValue(e, 'Name')) ?? code;
      this.terminalIdByCode.set(code, id);
      this.terminalIdByName.set(name, id);
      return terminalSchema.parse({ id, code, name, provenance: this.provenance(e, observedAt) });
    });

    const concourses = of('ConcourseFacility').map((e) => {
      const terminal = propertyValue(e, 'TerminalFacility');
      return concourseSchema.parse({
        id: localId(e),
        code: str(propertyValue(e, 'Identifier')) ?? localId(e),
        name: str(propertyValue(e, 'Name')) ?? localId(e),
        terminalId: this.terminalFor(str(path(terminal, 'Identifier')) ?? str(path(terminal, 'Name'))),
        provenance: this.provenance(e, observedAt),
      });
    });

    const zones = of('ZoneAreaLocation').map((e) => {
      const id = localId(e);
      const name = str(propertyValue(e, 'Name')) ?? id;
      const area = propertyValue(e, 'TerminalAreaLocation');
      const local = num(path(area, 'AirportLocation', 'Srid')) === 0;
      this.zoneIdByName.set(name, id);
      const kind = zoneKindFromName(name);
      return zoneSchema.parse({
        id,
        name,
        terminalId: this.terminalFor(str(path(area, 'Name'))),
        concourseId: null,
        kind,
        airside: kind === 'gate-area' || kind === 'retail',
        centroid: local ? { x: num(path(area, 'AirportLocation', 'Longitude')) ?? 0, y: num(path(area, 'AirportLocation', 'Latitude')) ?? 0 } : { x: 0, y: 0 },
        provenance: this.provenance(e, observedAt),
      });
    });

    const checkpoints = of('CheckpointFacility').map((e) => {
      const id = str(propertyValue(e, 'Identifier')) ?? localId(e);
      const zoneName = str(path(propertyValue(e, 'CheckpointAreaLocation'), 'ZoneAreaLocation', 'Name'));
      const zoneId = (zoneName && this.zoneIdByName.get(zoneName)) || 'unknown';
      this.checkpointZone.set(id, zoneId);
      const description = (str(propertyValue(e, 'Description')) ?? '').toLowerCase();
      return checkpointSchema.parse({
        id,
        name: str(propertyValue(e, 'Name')) ?? id,
        terminalId: this.terminalFor(str(path(propertyValue(e, 'ConcourseFacility'), 'TerminalFacility', 'Identifier'))),
        zoneId,
        kind: description.includes('passport') ? 'passport' : description.includes('boarding') ? 'boarding' : 'security',
        provenance: this.provenance(e, observedAt),
      });
    });

    const queues = of('PassengerQueue').map((e) => {
      const checkpoint = propertyValue(e, 'CheckpointFacility');
      const checkpointId = str(path(checkpoint, 'Identifier')) ?? 'unknown';
      return passengerQueueSchema.parse({
        id: str(propertyValue(e, 'Identifier')) ?? localId(e),
        name: str(propertyValue(e, 'Name')) ?? localId(e),
        checkpointId,
        zoneId: this.checkpointZone.get(checkpointId) ?? this.zoneFromCheckpoint(checkpoint),
        provenance: this.provenance(e, observedAt),
      });
    });

    return { terminals, concourses, zones, checkpoints, queues };
  }

  private zoneFromCheckpoint(checkpoint: unknown): string {
    const name = str(path(checkpoint, 'CheckpointAreaLocation', 'ZoneAreaLocation', 'Name'));
    return (name && this.zoneIdByName.get(name)) || 'unknown';
  }

  measurement(e: NgsiEntity): QueueMeasurement {
    const queue = propertyValue(e, 'PassengerQueue');
    const checkpoint = path(queue, 'CheckpointFacility');
    const checkpointId = str(path(checkpoint, 'Identifier')) ?? 'unknown';
    const period = propertyValue(e, 'MeasurementTimePeriod');
    const end = str(path(period, 'EndTime')) ?? this.ctx.now();
    const start = str(path(period, 'StartTime')) ?? new Date(Date.parse(end) - 5 * 60_000).toISOString();
    return queueMeasurementSchema.parse({
      id: localId(e),
      queueId: str(path(queue, 'Identifier')) ?? 'unknown',
      checkpointId,
      zoneId: this.checkpointZone.get(checkpointId) ?? this.zoneFromCheckpoint(checkpoint),
      occupancy: Math.max(0, Math.round(num(propertyValue(e, 'Occupancy')) ?? 0)),
      waitTimeSec: Math.max(0, num(propertyValue(e, 'WaitTime')) ?? 0),
      projectedWaitTimeSec: Math.max(0, num(propertyValue(e, 'ProjectedWaitTime')) ?? 0),
      throughputPerHour: Math.max(0, num(propertyValue(e, 'Throughput')) ?? 0),
      periodStart: start,
      periodEnd: end,
      provenance: this.provenance(e, end),
    });
  }
}

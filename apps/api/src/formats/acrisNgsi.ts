// ACI ACRIS entities in NGSI-LD normalized form, following data/reference/acris (FIWARE dataModel.ACRIS)

export const ACRIS_CONTEXT = ['https://raw.githubusercontent.com/smart-data-models/dataModel.ACRIS/master/context.jsonld'] as const;

export interface NgsiEntity {
  id: string;
  type: string;
  '@context'?: readonly string[];
  [property: string]: unknown;
}

const prop = (value: unknown) => ({ type: 'Property', value });

export interface AirportRef { iata: string; icao: string; name: string }
export interface PlanPoint { x: number; y: number; name: string }

const airportFacility = (a: AirportRef) => ({ IataCode: a.iata, IcaoCode: a.icao, Name: a.name });
// Srid 0 marks local floor-plan coordinates: Longitude carries x and Latitude carries y
const location = (p: PlanPoint) => ({ Latitude: p.y, Longitude: p.x, Name: p.name, Srid: 0 });

export function terminalEntity(airport: AirportRef, id: string, code: string, name: string): NgsiEntity {
  return { id: `urn:ngsi-ld:TerminalFacility:${airport.iata}:${id}`, type: 'TerminalFacility', Identifier: prop(code), Name: prop(name), AirportFacility: prop(airportFacility(airport)), '@context': ACRIS_CONTEXT };
}

export function concourseEntity(airport: AirportRef, id: string, code: string, name: string, terminal: { code: string; name: string }): NgsiEntity {
  return {
    id: `urn:ngsi-ld:ConcourseFacility:${airport.iata}:${id}`,
    type: 'ConcourseFacility',
    Identifier: prop(code),
    Name: prop(name),
    TerminalFacility: prop({ Identifier: terminal.code, Name: terminal.name, AirportFacility: airportFacility(airport) }),
    '@context': ACRIS_CONTEXT,
  };
}

export function zoneEntity(airport: AirportRef, id: string, name: string, terminalName: string, centroid: PlanPoint): NgsiEntity {
  return {
    id: `urn:ngsi-ld:ZoneAreaLocation:${airport.iata}:${id}`,
    type: 'ZoneAreaLocation',
    Name: prop(name),
    TerminalAreaLocation: prop({ Name: terminalName, AirportLocation: location(centroid) }),
    '@context': ACRIS_CONTEXT,
  };
}

interface CheckpointRef {
  id: string;
  name: string;
  kind: string;
  zoneName: string;
  terminal: { code: string; name: string };
  position: PlanPoint;
}

function checkpointValue(airport: AirportRef, cp: CheckpointRef) {
  return {
    Description: cp.kind,
    Identifier: cp.id,
    Name: cp.name,
    CheckpointAreaLocation: { ...location(cp.position), ZoneAreaLocation: { Name: cp.zoneName, TerminalAreaLocation: { Name: cp.terminal.name, AirportLocation: location(cp.position) } } },
    CheckpointFacilityOperatorParty: { Name: 'Meridian Airport Security' },
    CheckpointFacilityType: { Code: cp.kind.toUpperCase(), Description: cp.kind },
    ConcourseFacility: { Identifier: '', Name: '', TerminalFacility: { Identifier: cp.terminal.code, Name: cp.terminal.name, AirportFacility: airportFacility(airport) } },
    OperationTimePeriod: { ClosingTime: '23:59:00Z', OpeningTime: '00:00:00Z' },
  };
}

export function checkpointEntity(airport: AirportRef, cp: CheckpointRef): NgsiEntity {
  const value = checkpointValue(airport, cp);
  return {
    id: `urn:ngsi-ld:CheckpointFacility:${airport.iata}:${cp.id}`,
    type: 'CheckpointFacility',
    Description: prop(value.Description),
    Identifier: prop(value.Identifier),
    Name: prop(value.Name),
    CheckpointAreaLocation: prop(value.CheckpointAreaLocation),
    CheckpointFacilityOperatorParty: prop(value.CheckpointFacilityOperatorParty),
    CheckpointFacilityType: prop(value.CheckpointFacilityType),
    ConcourseFacility: prop(value.ConcourseFacility),
    OperationTimePeriod: prop(value.OperationTimePeriod),
    '@context': ACRIS_CONTEXT,
  };
}

function queueValue(airport: AirportRef, queue: { id: string; name: string }, cp: CheckpointRef) {
  return {
    Identifier: queue.id,
    Name: queue.name,
    CheckpointFacility: checkpointValue(airport, cp),
    PassengerProcess: { Name: cp.kind, PassengerProcessType: { Code: cp.kind.toUpperCase(), Description: cp.kind } },
    QueueLocation: { Name: cp.zoneName },
    QueueStatus: { Name: 'Open' },
    QueueType: { Code: queue.name.includes('Fast') ? 'PRIORITY' : 'STANDARD', Description: queue.name },
  };
}

export function queueEntity(airport: AirportRef, queue: { id: string; name: string }, cp: CheckpointRef): NgsiEntity {
  const value = queueValue(airport, queue, cp);
  return {
    id: `urn:ngsi-ld:PassengerQueue:${airport.iata}:${queue.id}`,
    type: 'PassengerQueue',
    Identifier: prop(value.Identifier),
    Name: prop(value.Name),
    CheckpointFacility: prop(value.CheckpointFacility),
    PassengerProcess: prop(value.PassengerProcess),
    QueueLocation: prop(value.QueueLocation),
    QueueStatus: prop(value.QueueStatus),
    QueueType: prop(value.QueueType),
    '@context': ACRIS_CONTEXT,
  };
}

export interface MeasurementInput {
  id: string;
  occupancy: number;
  waitTimeSec: number;
  projectedWaitTimeSec: number;
  throughputPerHour: number;
  start: string;
  end: string;
}

export function measurementEntity(airport: AirportRef, m: MeasurementInput, queue: { id: string; name: string }, cp: CheckpointRef): NgsiEntity {
  return {
    id: `urn:ngsi-ld:QueueMeasurement:${airport.iata}:${m.id}`,
    type: 'QueueMeasurement',
    Occupancy: prop(m.occupancy),
    ProjectedWaitTime: prop(m.projectedWaitTimeSec),
    Throughput: prop(m.throughputPerHour),
    WaitTime: prop(m.waitTimeSec),
    MeasurementDevice: prop({ Name: `${queue.id}-sensor`, MeasurementDeviceLocation: { Name: cp.zoneName } }),
    MeasurementTimePeriod: prop({ StartTime: m.start, EndTime: m.end }),
    PassengerQueue: prop(queueValue(airport, queue, cp)),
    '@context': ACRIS_CONTEXT,
  };
}

// Reading helpers tolerate both normalized ({type, value}) and keyValues payloads
export function propertyValue(entity: NgsiEntity, name: string): unknown {
  const raw = new Map(Object.entries(entity)).get(name);
  if (typeof raw === 'object' && raw !== null && new Map(Object.entries(raw)).get('type') === 'Property') {
    return new Map(Object.entries(raw)).get('value');
  }
  return raw;
}

export function path(value: unknown, ...keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = new Map(Object.entries(current)).get(key);
  }
  return current;
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : typeof value === 'number' ? String(value) : null;
}

export function num(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

export function localId(entity: NgsiEntity): string {
  return entity.id.split(':').at(-1) ?? entity.id;
}

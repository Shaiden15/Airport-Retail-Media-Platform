import type {
  AircraftType,
  Checkpoint,
  Concourse,
  Flight,
  FlightEvent,
  GateAssignment,
  PassengerQueue,
  QueueMeasurement,
  Terminal,
  Zone,
} from '@dwellcast/shared';

// The app core only ever sees these canonical shapes; adapters translate source formats into them

export interface FlightSnapshot {
  flights: Flight[];
  gateAssignments: GateAssignment[];
  aircraftTypes: AircraftType[];
}

export interface FlightSource {
  readonly name: string;
  snapshot(): Promise<FlightSnapshot>;
  stream(): AsyncIterable<FlightEvent>;
}

export interface ZoneSnapshot {
  terminals: Terminal[];
  concourses: Concourse[];
  zones: Zone[];
  checkpoints: Checkpoint[];
  queues: PassengerQueue[];
}

export interface ZoneSource {
  readonly name: string;
  snapshot(): Promise<ZoneSnapshot>;
  stream(): AsyncIterable<QueueMeasurement>;
}

export interface AdapterContext {
  homeAirport: string;
  // Clock used for provenance.receivedAt; the simulation injects its own time
  now: () => string;
}

export class AdapterNotConfiguredError extends Error {
  constructor(adapter: string, requiredEnv: readonly string[]) {
    super(`${adapter} is a live adapter stub. Set ${requiredEnv.join(', ')} and implement the HTTP client to use it.`);
    this.name = 'AdapterNotConfiguredError';
  }
}

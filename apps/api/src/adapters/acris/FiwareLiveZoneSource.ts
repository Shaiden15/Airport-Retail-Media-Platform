import type { QueueMeasurement } from '@dwellcast/shared';
import { AdapterNotConfiguredError, type ZoneSnapshot, type ZoneSource } from '../types.ts';

// ZONE_SOURCE=fiware-live: where an NGSI-LD context broker (for example FIWARE Orion-LD) subscription plugs in
export class FiwareLiveZoneSource implements ZoneSource {
  readonly name = 'fiware-live';
  static readonly REQUIRED_ENV = ['NGSI_LD_BROKER_URL', 'NGSI_LD_TENANT'] as const;

  snapshot(): Promise<ZoneSnapshot> {
    return Promise.reject(new AdapterNotConfiguredError(this.name, FiwareLiveZoneSource.REQUIRED_ENV));
  }

  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<QueueMeasurement> {
    throw new AdapterNotConfiguredError(this.name, FiwareLiveZoneSource.REQUIRED_ENV);
  }
}

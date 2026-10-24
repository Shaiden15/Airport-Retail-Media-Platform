import type { FlightEvent } from '@dwellcast/shared';
import { AdapterNotConfiguredError, type FlightSnapshot, type FlightSource } from '../types.ts';

// FLIGHT_SOURCE=vendor-api: where a real AODB vendor API and AIDX message broker plug in (see docs/adapter-guide.md)
export class VendorApiFlightSource implements FlightSource {
  readonly name = 'vendor-api';
  static readonly REQUIRED_ENV = ['AODB_API_URL', 'AODB_API_TOKEN', 'AIDX_BROKER_URL'] as const;

  snapshot(): Promise<FlightSnapshot> {
    return Promise.reject(new AdapterNotConfiguredError(this.name, VendorApiFlightSource.REQUIRED_ENV));
  }

  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<FlightEvent> {
    throw new AdapterNotConfiguredError(this.name, VendorApiFlightSource.REQUIRED_ENV);
  }
}

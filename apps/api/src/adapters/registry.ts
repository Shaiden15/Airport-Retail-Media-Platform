import type { AppConfig } from '../config.ts';
import { feedFiles } from '../feeds/paths.ts';
import { FiwareLiveZoneSource } from './acris/FiwareLiveZoneSource.ts';
import { MockAcrisZoneSource } from './acris/MockAcrisZoneSource.ts';
import { MockAidxFlightSource } from './flight/MockAidxFlightSource.ts';
import { VendorApiFlightSource } from './flight/VendorApiFlightSource.ts';
import type { AdapterContext, FlightSource, ZoneSource } from './types.ts';

// The only place that knows which adapter backs each source; switching is one config value
export function createFlightSource(config: AppConfig, ctx: AdapterContext, date: string): FlightSource {
  switch (config.FLIGHT_SOURCE) {
    case 'mock-aidx': {
      const files = feedFiles(ctx.homeAirport, date);
      return new MockAidxFlightSource({ aodbSnapshot: files.aodbStartOfDay, aidxStream: files.aidxStream }, ctx);
    }
    case 'vendor-api':
      return new VendorApiFlightSource();
  }
}

export function createZoneSource(config: AppConfig, ctx: AdapterContext, date: string): ZoneSource {
  switch (config.ZONE_SOURCE) {
    case 'mock-acris': {
      const files = feedFiles(ctx.homeAirport, date);
      return new MockAcrisZoneSource({ entities: files.acrisEntities, measurements: files.acrisMeasurements }, ctx);
    }
    case 'fiware-live':
      return new FiwareLiveZoneSource();
  }
}

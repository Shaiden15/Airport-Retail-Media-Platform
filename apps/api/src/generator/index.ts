import type { AirportConfig } from '../airportConfig.ts';
import type { AodbRow } from '../formats/aodbCsv.ts';
import { generateAcris, type AcrisFeed } from './acrisPlan.ts';
import { planAidxMessages, type PlannedMessage } from './aidxPlan.ts';
import { legToAodbRow } from './aodbRows.ts';
import { buildLayout, type AirportLayout } from './layout.ts';
import { generatePlatform, type PlatformData } from './platform.ts';
import { generateSchedule, type LegRecord } from './schedule.ts';

export interface GeneratedDay {
  date: string;
  layout: AirportLayout;
  legs: LegRecord[];
  aodbStartOfDay: AodbRow[];
  aodbEndOfDay: AodbRow[];
  aidx: PlannedMessage[];
  acris: AcrisFeed;
  platform: PlatformData;
}

// Bump when generated data changes so existing databases re-seed on next boot
export const GENERATOR_VERSION = '2026-10-24.3';

// One deterministic airport day: same config and seed always give the same output
export function generateDay(airport: AirportConfig): GeneratedDay {
  const date = airport.operatingDate;
  const layout = buildLayout();
  const legs = generateSchedule(layout, { date, seed: airport.seed });
  const dayStart = Date.parse(`${date}T00:00:00Z`);
  const ref = { iata: airport.iataCode, icao: airport.icaoCode, name: airport.name };

  return {
    date,
    layout,
    legs,
    aodbStartOfDay: legs.map((leg) => legToAodbRow(leg, 'start-of-day', dayStart - 60 * 60_000)),
    aodbEndOfDay: legs.map((leg) => legToAodbRow(leg, 'end-of-day', dayStart + 26 * 60 * 60_000)),
    aidx: planAidxMessages(legs),
    acris: generateAcris(layout, legs, ref, date, airport.seed),
    platform: generatePlatform(layout, { date, seed: airport.seed }),
  };
}

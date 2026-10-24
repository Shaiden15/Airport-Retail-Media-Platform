import { loadAirportConfig } from '../airportConfig.ts';
import { generateDay } from '../generator/index.ts';
import { writeFeeds } from '../feeds/writeFeeds.ts';

const airport = loadAirportConfig();
const started = Date.now();
const day = generateDay(airport);
const files = writeFeeds(day, airport.iataCode);
const legs = day.legs.length;
const departures = day.legs.filter((l) => l.direction === 'D').length;
process.stdout.write(
  [
    `generated ${airport.iataCode} ${day.date} in ${Date.now() - started} ms`,
    `  flights: ${legs} legs (${departures} departures, ${legs - departures} arrivals)`,
    `  AIDX messages: ${day.aidx.length}`,
    `  ACRIS: ${day.acris.entities.length} entities, ${day.acris.measurements.length} queue measurements`,
    `  platform: ${day.platform.screens.length} screens, ${day.platform.outlets.length} outlets, ${day.platform.campaigns.length} campaigns, ${day.platform.dailyStats.length} daily stats`,
    `  written to ${files.root}`,
  ].join('\n') + '\n',
);

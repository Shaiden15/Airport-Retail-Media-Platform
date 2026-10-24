import { readFileSync } from 'node:fs';
import { z } from 'zod';

const airportSchema = z.object({
  iataCode: z.string().length(3),
  icaoCode: z.string().length(4),
  name: z.string().min(1),
  utcOffsetMinutes: z.number().int().min(-720).max(840),
  operatingDate: z.iso.date(),
  festivalDates: z.array(z.iso.date()),
  seed: z.number().int().nonnegative(),
});

export type AirportConfig = z.infer<typeof airportSchema>;

const AIRPORT_FILE = new URL('../../../config/airport.json', import.meta.url);

export function loadAirportConfig(): AirportConfig {
  return airportSchema.parse(JSON.parse(readFileSync(AIRPORT_FILE, 'utf8')));
}

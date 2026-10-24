import { z } from 'zod';
import { isoDateTime, provenanceSchema } from './provenance.ts';

export const FLIGHT_STATUSES = [
  'scheduled',
  'check-in',
  'boarding',
  'final-call',
  'gate-closed',
  'departed',
  'delayed',
  'cancelled',
  'approaching',
  'landed',
  'on-block',
  'baggage',
] as const;
export const flightStatusSchema = z.enum(FLIGHT_STATUSES);
export type FlightStatus = z.infer<typeof flightStatusSchema>;

export const REGIONS = ['domestic', 'gulf', 'europe', 'asia', 'africa', 'americas', 'oceania', 'indian-ocean', 'other'] as const;
export const regionSchema = z.enum(REGIONS);
export type Region = z.infer<typeof regionSchema>;

export const aircraftTypeSchema = z.object({
  iataCode: z.string().min(2).max(4),
  icaoCode: z.string().min(3).max(4),
  name: z.string(),
  widebody: z.boolean(),
  seats: z.object({
    economy: z.number().int().nonnegative(),
    premiumEconomy: z.number().int().nonnegative(),
    business: z.number().int().nonnegative(),
    first: z.number().int().nonnegative(),
  }),
});
export type AircraftType = z.infer<typeof aircraftTypeSchema>;

// A-CDM milestone times; any may be missing until the milestone happens
export const cdmTimesSchema = z.object({
  tobt: isoDateTime.nullable(),
  tsat: isoDateTime.nullable(),
  aibt: isoDateTime.nullable(),
  aobt: isoDateTime.nullable(),
});

export const flightSchema = z.object({
  id: z.string(),
  airlineCode: z.string().min(2).max(3),
  flightNumber: z.string(),
  direction: z.enum(['departure', 'arrival']),
  originDate: z.iso.date(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  via: z.string().length(3).nullable(),
  international: z.boolean(),
  region: regionSchema,
  terminalId: z.string(),
  scheduledTime: isoDateTime,
  estimatedTime: isoDateTime.nullable(),
  actualTime: isoDateTime.nullable(),
  cdm: cdmTimesSchema,
  gate: z.string().nullable(),
  stand: z.string().nullable(),
  checkInCounters: z.string().nullable(),
  baggageBelt: z.string().nullable(),
  aircraftType: z.string(),
  registration: z.string().nullable(),
  seatCapacity: z.number().int().positive(),
  paxCount: z.number().int().nonnegative(),
  status: flightStatusSchema,
  delayMinutes: z.number().int().nonnegative(),
  delayCodes: z.array(z.string()),
  codeshares: z.array(z.string()),
  provenance: provenanceSchema,
});
export type Flight = z.infer<typeof flightSchema>;

export const gateAssignmentSchema = z.object({
  flightId: z.string(),
  gate: z.string(),
  stand: z.string().nullable(),
  from: isoDateTime,
  to: isoDateTime,
  provenance: provenanceSchema,
});
export type GateAssignment = z.infer<typeof gateAssignmentSchema>;

export const FLIGHT_EVENT_KINDS = ['status', 'gate-change', 'delay', 'estimate', 'boarding', 'cancel'] as const;

export const flightEventSchema = z.object({
  id: z.string(),
  flightId: z.string(),
  kind: z.enum(FLIGHT_EVENT_KINDS),
  status: flightStatusSchema.nullable(),
  gate: z.string().nullable(),
  previousGate: z.string().nullable(),
  estimatedTime: isoDateTime.nullable(),
  delayMinutes: z.number().int().nonnegative().nullable(),
  delayCodes: z.array(z.string()),
  provenance: provenanceSchema,
});
export type FlightEvent = z.infer<typeof flightEventSchema>;

export function flightKey(airlineCode: string, flightNumber: string, originDate: string, direction: Flight['direction']): string {
  return `${airlineCode}${flightNumber}-${originDate}-${direction === 'departure' ? 'D' : 'A'}`;
}

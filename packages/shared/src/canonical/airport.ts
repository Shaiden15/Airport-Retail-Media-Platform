import { z } from 'zod';
import { isoDateTime, provenanceSchema } from './provenance.ts';

export const pointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof pointSchema>;

export const terminalSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  provenance: provenanceSchema,
});
export type Terminal = z.infer<typeof terminalSchema>;

export const concourseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  terminalId: z.string(),
  provenance: provenanceSchema,
});
export type Concourse = z.infer<typeof concourseSchema>;

export const ZONE_KINDS = ['gate-area', 'retail', 'security', 'landside'] as const;

export const zoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  terminalId: z.string(),
  concourseId: z.string().nullable(),
  kind: z.enum(ZONE_KINDS),
  airside: z.boolean(),
  centroid: pointSchema,
  provenance: provenanceSchema,
});
export type Zone = z.infer<typeof zoneSchema>;

export const gateSchema = z.object({
  id: z.string(),
  terminalId: z.string(),
  concourseId: z.string(),
  zoneId: z.string(),
  position: pointSchema,
});
export type Gate = z.infer<typeof gateSchema>;

export const checkpointSchema = z.object({
  id: z.string(),
  name: z.string(),
  terminalId: z.string(),
  zoneId: z.string(),
  kind: z.enum(['security', 'passport', 'boarding']),
  provenance: provenanceSchema,
});
export type Checkpoint = z.infer<typeof checkpointSchema>;

export const passengerQueueSchema = z.object({
  id: z.string(),
  name: z.string(),
  checkpointId: z.string(),
  zoneId: z.string(),
  provenance: provenanceSchema,
});
export type PassengerQueue = z.infer<typeof passengerQueueSchema>;

export const queueMeasurementSchema = z.object({
  id: z.string(),
  queueId: z.string(),
  checkpointId: z.string(),
  zoneId: z.string(),
  occupancy: z.number().int().nonnegative(),
  waitTimeSec: z.number().nonnegative(),
  projectedWaitTimeSec: z.number().nonnegative(),
  throughputPerHour: z.number().nonnegative(),
  periodStart: isoDateTime,
  periodEnd: isoDateTime,
  provenance: provenanceSchema,
});
export type QueueMeasurement = z.infer<typeof queueMeasurementSchema>;

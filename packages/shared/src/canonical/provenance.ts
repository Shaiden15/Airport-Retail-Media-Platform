import { z } from 'zod';

export const SOURCES = ['aodb', 'aidx', 'acris', 'platform', 'simulation'] as const;
export const sourceSchema = z.enum(SOURCES);
export type Source = z.infer<typeof sourceSchema>;

// Every fact the decision engine may cite carries where it came from and how fresh it is
export const provenanceSchema = z.object({
  source: sourceSchema,
  sourceRef: z.string().min(1),
  adapter: z.string().min(1),
  observedAt: z.iso.datetime(),
  receivedAt: z.iso.datetime(),
});
export type Provenance = z.infer<typeof provenanceSchema>;

export const isoDateTime = z.iso.datetime();

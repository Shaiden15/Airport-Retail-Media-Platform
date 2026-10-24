import { z } from 'zod';

export const SCORING_VERSION = 'score-v1';

// Rule engine settings the Platform Admin can change at runtime
export const engineSettingsSchema = z.object({
  explorationPct: z.number().min(0).max(0.3),
  globalFrequencyCapPerScreenHour: z.number().int().min(1).max(240),
  competitorSeparation: z.boolean(),
  airlinePriority: z.boolean(),
  learnLiftRange: z.number().min(0).max(0.5),
  attentionFactor: z.number().min(0.05).max(1),
  freshnessMinutes: z.object({
    aodb: z.number().int().positive(),
    aidx: z.number().int().positive(),
    acris: z.number().int().positive(),
  }),
});

export type EngineSettings = z.infer<typeof engineSettingsSchema>;

export const DEFAULT_SETTINGS: EngineSettings = {
  explorationPct: 0.05,
  globalFrequencyCapPerScreenHour: 40,
  competitorSeparation: true,
  airlinePriority: true,
  learnLiftRange: 0.15,
  attentionFactor: 0.35,
  freshnessMinutes: { aodb: 36 * 60, aidx: 12 * 60, acris: 15 },
};

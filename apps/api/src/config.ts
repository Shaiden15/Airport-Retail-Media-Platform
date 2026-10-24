import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  PUBLIC_BASE_URL: z.url().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  FLIGHT_SOURCE: z.enum(['mock-aidx', 'vendor-api']).default('mock-aidx'),
  ZONE_SOURCE: z.enum(['mock-acris', 'fiware-live']).default('mock-acris'),
  AI_PROVIDER: z.enum(['mock', 'anthropic', 'openai-compatible']).default('mock'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}

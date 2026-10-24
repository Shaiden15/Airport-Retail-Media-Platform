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
  LAN_IP: z.ipv4().optional(),
  WEB_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  SERVE_WEB: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  CLAIM_SECRET: z.string().min(16).optional(),
  SIM_START: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('13:50'),
  SIM_AUTOPLAY: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return envSchema.parse(env);
}

import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import type { AppConfig } from './config.ts';
import { loadTheme } from './theme.ts';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, { global: true });

  const theme = loadTheme();

  // Never leak stack traces or internals to clients
  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    const status = error.statusCode ?? 500;
    request.log.error({ err: error }, 'request failed');
    void reply.status(status).send({ error: status >= 500 ? 'Internal Server Error' : error.message });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    adapters: {
      flight: config.FLIGHT_SOURCE,
      zones: config.ZONE_SOURCE,
      ai: config.AI_PROVIDER,
    },
  }));

  app.get('/api/theme', async () => theme);

  return app;
}

import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { AppConfig } from './config.ts';
import { webDistDir } from './feeds/paths.ts';
import { registerClaimRoutes } from './routes/claimRoutes.ts';
import { registerEngineRoutes } from './routes/engineRoutes.ts';
import { registerRoleRoutes } from './routes/roleRoutes.ts';
import { HttpError } from './routes/http.ts';
import type { Runtime } from './runtime/Runtime.ts';
import { loadTheme } from './theme.ts';

export async function buildApp(config: AppConfig, runtime: Runtime | null = null): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === 'test' ? false : { level: config.LOG_LEVEL },
    bodyLimit: 1_048_576,
    trustProxy: config.SERVE_WEB,
    // Signed offer tokens in claim links are about 150 characters; zod still caps them at 500
    routerOptions: { maxParamLength: 512 },
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'data:'], 'connect-src': ["'self'"] } },
  });
  await app.register(rateLimit, { global: true, max: 1200, timeWindow: '1 minute' });

  const theme = loadTheme();

  // Validation errors carry field details; anything unexpected is logged and never leaks internals
  app.setErrorHandler((error: { statusCode?: number; message: string }, request, reply) => {
    if (error instanceof HttpError) {
      void reply.status(error.statusCode).send({ error: error.message, ...(error.details ? { details: error.details } : {}) });
      return;
    }
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
    simulation: runtime ? { simTime: runtime.clock.nowIso(), running: runtime.clock.running, speed: runtime.clock.speed } : null,
  }));

  app.get('/api/theme', async () => theme);

  if (runtime) {
    // Request timings feed the admin performance panel; the long-lived SSE stream is excluded
    app.addHook('onResponse', async (request, reply) => {
      if (!request.url.startsWith('/api/stream')) runtime.metrics.recordRequest(reply.elapsedTime);
    });
    registerEngineRoutes(app, runtime);
    registerClaimRoutes(app, runtime, config);
    registerRoleRoutes(app, runtime);
  }

  // Single-image deploys serve the built web app from the API; unknown non-API paths fall back to the SPA
  const dist = webDistDir();
  if (config.SERVE_WEB && existsSync(dist)) {
    await app.register(fastifyStatic, { root: dist, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !request.url.startsWith('/api/')) return reply.sendFile('index.html', { maxAge: 0 });
      return reply.status(404).send({ error: 'Not Found' });
    });
  }

  return app;
}

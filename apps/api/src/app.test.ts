import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

describe('api app', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp(loadConfig({ NODE_ENV: 'test' }));
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health and the adapters in use', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'ok',
      adapters: { flight: 'mock-aodb', flightEvents: 'mock-aidx', zones: 'mock-acris', ai: 'mock' },
    });
  });

  it('serves the white-label theme', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/theme' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ productName: 'Dwellcast' });
  });

  it('sets security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns 404 without leaking internals', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('at ');
  });
});

describe('config', () => {
  it('rejects an unknown adapter name', () => {
    expect(() => loadConfig({ FLIGHT_SOURCE: 'made-up' })).toThrow();
  });
});

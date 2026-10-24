import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import type { Runtime } from '../runtime/Runtime.ts';
import { createTestRuntime } from '../testRuntime.ts';

let rt: Runtime;
let app: FastifyInstance;

beforeAll(async () => {
  rt = await createTestRuntime();
  app = await buildApp(loadConfig({ NODE_ENV: 'test' }), rt);
});

afterAll(async () => {
  await app.close();
  rt.stop();
});

const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, payload });

describe('simulation API', () => {
  it('reports clock, KPIs and feed health', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sim' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.clock).toMatchObject({ running: false, speed: 1 });
    expect(body.feeds.adapters).toEqual({ flight: 'mock-aidx', zones: 'mock-acris', ai: 'mock' });
    expect(body.feeds.feeds.map((f: { name: string }) => f.name)).toEqual(['AODB', 'AIDX', 'ACRIS']);
  });

  it('controls the clock: speed, jump, play and pause', async () => {
    expect((await post('/api/sim/control', { action: 'speed', speed: 60 })).json().speed).toBe(60);
    expect((await post('/api/sim/control', { action: 'jump', time: '14:10' })).json().simTime).toBe(`${rt.airport.operatingDate}T14:10:00.000Z`);
    expect((await post('/api/sim/control', { action: 'play' })).json().running).toBe(true);
    expect((await post('/api/sim/control', { action: 'pause' })).json().running).toBe(false);
  });

  it('rejects invalid control and inject bodies with field details', async () => {
    const bad = await post('/api/sim/control', { action: 'speed', speed: 7 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().details.length).toBeGreaterThan(0);
    expect((await post('/api/sim/inject', { type: 'delay', flightId: 'X', minutes: 9999 })).statusCode).toBe(400);
    expect((await post('/api/sim/inject', { type: 'delay', flightId: '<script>', minutes: 10 })).statusCode).toBe(400);
    expect((await post('/api/sim/control', { action: 'jump', time: 'not-a-time' })).statusCode).toBe(400);
  });

  it('returns 404 for unknown flights and screens', async () => {
    expect((await post('/api/sim/inject', { type: 'delay', flightId: 'ZZ1-2026-11-06-D', minutes: 30 })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/screens/SCR-999/decision' })).statusCode).toBe(404);
  });

  it('reproduces the worked example in one call', async () => {
    const res = await post('/api/sim/scenario/worked-example', {});
    expect(res.statusCode).toBe(200);
    expect(res.json().decision.winner.campaignId).toBe('cmp-perfume-15');
    expect(res.json().clock.running).toBe(false);
  });
});

describe('read API', () => {
  it('lists flights, presence, screens and the full why-this-ad decision', async () => {
    const flights = (await app.inject({ method: 'GET', url: '/api/flights?direction=departure&airline=XH' })).json();
    expect(flights.every((f: { airlineCode: string }) => f.airlineCode === 'XH')).toBe(true);
    const presence = (await app.inject({ method: 'GET', url: '/api/presence' })).json();
    expect(presence.zones).toHaveLength(22);
    const screens = (await app.inject({ method: 'GET', url: '/api/screens' })).json();
    expect(screens).toHaveLength(180);
    const screenId = rt.screenClosestToGate('42')?.id ?? '';
    const detail = (await app.inject({ method: 'GET', url: `/api/screens/${screenId}` })).json();
    expect(detail.nearbyFlights.length).toBeGreaterThan(0);
    const decision = (await app.inject({ method: 'GET', url: `/api/screens/${screenId}/decision` })).json();
    expect(decision.candidates.length).toBe(25);
    expect(decision.crowd.tripPurpose).toBeDefined();
  });

  it('searches the decision log', async () => {
    const res = (await app.inject({ method: 'GET', url: '/api/decisions?q=perfume&limit=5' })).json();
    expect(res.length).toBeGreaterThan(0);
    expect(res.every((d: { name: string | null; rule: string }) => `${d.name} ${d.rule}`.toLowerCase().includes('perfume'))).toBe(true);
  });

  it('updates rule engine settings with validation', async () => {
    const ok = await app.inject({ method: 'PUT', url: '/api/engine/settings', payload: { explorationPct: 0.1 } });
    expect(ok.json().explorationPct).toBe(0.1);
    expect((await app.inject({ method: 'PUT', url: '/api/engine/settings', payload: { explorationPct: 5 } })).statusCode).toBe(400);
    await app.inject({ method: 'PUT', url: '/api/engine/settings', payload: { explorationPct: 0 } });
  });
});

describe('live stream', () => {
  it('pushes clock and inject events over SSE', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const controller = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/stream?topics=clock,inject`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let text = '';
    const screenId = rt.screenClosestToGate('42')?.id ?? '';
    setTimeout(() => void post('/api/sim/inject', { type: 'hallucination', screenId }), 50);
    const deadline = Date.now() + 3000;
    while (reader && Date.now() < deadline && !(text.includes('event: clock') && text.includes('event: inject'))) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    controller.abort();
    expect(text).toContain('event: clock');
    expect(text).toContain('event: inject');
  });
});

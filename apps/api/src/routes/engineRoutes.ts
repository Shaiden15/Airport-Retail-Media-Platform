import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { engineSettingsSchema } from '../decision/settings.ts';
import { TOPICS, type Topic } from '../live/SseHub.ts';
import { decisionSummary, flightSummary, type Runtime } from '../runtime/Runtime.ts';
import { InjectionError } from '../sim/EventInjector.ts';
import { HttpError, parse } from './http.ts';

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9._:-]+$/);

const controlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('play') }),
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('speed'), speed: z.union([z.literal(1), z.literal(10), z.literal(60)]) }),
  z.object({ action: z.literal('jump'), time: z.string().min(5).max(30) }),
]);

const injectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delay'), flightId: id, minutes: z.number().int().min(0).max(600) }),
  z.object({ type: z.literal('gate-change'), flightId: id, gate: id }),
  z.object({ type: z.literal('screen-offline'), screenId: id }),
  z.object({ type: z.literal('screen-online'), screenId: id }),
  z.object({ type: z.literal('hallucination'), screenId: id }),
]);

const flightQuery = z.object({
  direction: z.enum(['departure', 'arrival']).optional(),
  airline: z.string().length(2).optional(),
  terminal: z.enum(['T1', 'T2']).optional(),
  gate: id.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
});

const decisionQuery = z.object({
  screenId: id.optional(),
  campaignId: id.optional(),
  source: z.enum(['agent-verified', 'rule-based', 'delay-goodwill', 'airline-priority', 'manual-pin', 'house-default']).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

// Topics are parsed and capped by the schema, so handlers never iterate raw query input
const streamQuery = z.object({
  topics: z
    .string()
    .max(200)
    .transform((s) => s.split(','))
    .pipe(z.array(z.enum(TOPICS)).min(1).max(TOPICS.length))
    .optional(),
});

function rethrow(error: unknown): never {
  if (error instanceof InjectionError) throw new HttpError(error.statusCode, error.message);
  throw error;
}

export function registerEngineRoutes(app: FastifyInstance, rt: Runtime): void {
  app.get('/api/sim', async () => ({ clock: rt.clockPayload(), kpis: rt.kpis(), feeds: rt.feedHealth() }));

  app.post('/api/sim/control', async (req) => {
    try {
      return rt.control(parse(controlSchema, req.body));
    } catch (error) {
      rethrow(error);
    }
  });

  app.post('/api/sim/inject', async (req) => {
    const body = parse(injectSchema, req.body);
    try {
      switch (body.type) {
        case 'delay':
          return rt.injectDelay(body.flightId, body.minutes);
        case 'gate-change':
          return rt.injectGateChange(body.flightId, body.gate);
        case 'screen-offline':
          return rt.setScreenStatus(body.screenId, 'offline');
        case 'screen-online':
          return rt.setScreenStatus(body.screenId, 'online');
        case 'hallucination':
          return rt.injectHallucination(body.screenId);
      }
    } catch (error) {
      rethrow(error);
    }
  });

  // Reproduces the spec's worked example: Gate 42 at 14:10, paused so the room can read the decision
  app.post('/api/sim/reset', async () => {
    rt.resetDemo();
    return rt.clockPayload();
  });

  app.post('/api/sim/scenario/worked-example', async () => {
    rt.clock.pause();
    rt.resetDemo(rt.resolveTime('14:10'));
    const screen = rt.screenClosestToGate('42');
    if (!screen) throw new HttpError(500, 'no screen near gate 42');
    return { clock: rt.clockPayload(), screenId: screen.id, decision: rt.engine.latest(screen.id) };
  });

  app.get('/api/flights', async (req) => {
    const q = parse(flightQuery, req.query);
    return [...rt.state.flights.values()]
      .filter((f) => (!q.direction || f.direction === q.direction) && (!q.airline || f.airlineCode === q.airline) && (!q.terminal || f.terminalId === q.terminal) && (!q.gate || f.gate === q.gate))
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
      .slice(0, q.limit)
      .map(flightSummary);
  });

  app.get('/api/presence', async () => ({ simTime: rt.clock.nowIso(), zones: rt.presenceSummary() }));

  app.get('/api/presence/:zoneId', async (req) => {
    const { zoneId } = parse(z.object({ zoneId: id }), req.params);
    const zone = rt.presence.zone(zoneId, rt.clock.nowMs());
    if (!zone) throw new HttpError(404, 'zone not found');
    return zone;
  });

  app.get('/api/screens', async () =>
    [...rt.state.screens.values()].map((s) => {
      const d = rt.engine.latest(s.id);
      return { ...s, nowPlaying: d ? decisionSummary(d) : null };
    }),
  );

  app.get('/api/screens/:screenId', async (req) => {
    const { screenId } = parse(z.object({ screenId: id }), req.params);
    const screen = rt.state.screens.get(screenId);
    if (!screen) throw new HttpError(404, 'screen not found');
    const gates = new Set(screen.nearestGates.map((g) => g.gate));
    const nearby = [...rt.state.flights.values()].filter((f) => f.direction === 'departure' && f.gate && gates.has(f.gate) && f.status !== 'departed').sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)).slice(0, 8);
    return { screen, nearbyFlights: nearby.map(flightSummary), decision: rt.engine.latest(screenId) };
  });

  app.get('/api/screens/:screenId/decision', async (req) => {
    const { screenId } = parse(z.object({ screenId: id }), req.params);
    const decision = rt.engine.latest(screenId);
    if (!decision) throw new HttpError(404, 'no decision yet for this screen');
    return decision;
  });

  app.get('/api/decisions', async (req) => {
    const q = parse(decisionQuery, req.query);
    return rt.engine.search({ screenId: q.screenId, campaignId: q.campaignId, source: q.source, text: q.q, limit: q.limit }).map((d) => ({ ...decisionSummary(d), id: d.id, candidates: d.candidates.slice(0, 5).map((c) => ({ campaignId: c.campaignId, name: c.name, status: c.status, reason: c.reason, score: c.breakdown?.score ?? null })) }));
  });

  app.get('/api/kpis', async () => rt.kpis());
  app.get('/api/feeds', async () => rt.feedHealth());

  app.get('/api/engine/settings', async () => rt.engine.settings);
  app.put('/api/engine/settings', async (req) => rt.updateSettings(parse(engineSettingsSchema.partial(), req.body)));

  app.get('/api/stream', (req, reply) => {
    const q = parse(streamQuery, req.query);
    const topics = new Set<Topic>(q.topics ?? TOPICS);
    reply.hijack();
    const remove = rt.hub.add(reply.raw, topics);
    req.raw.on('close', remove);
  });
}

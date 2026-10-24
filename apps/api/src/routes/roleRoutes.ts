import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { incidentCreateSchema, incidentUpdateSchema, INCIDENT_STATUSES } from '../admin/IncidentService.ts';
import { ENTITY_KINDS, ENTITY_SCHEMAS, MasterDataError, type EntityKind } from '../admin/MasterDataService.ts';
import { gateMessageSchema, goodwillInputSchema } from '../airline/AirlineService.ts';
import { CampaignError, campaignInputSchema, creativeInputSchema, reviewInputSchema, targetingInputSchema } from '../campaigns/CampaignService.ts';
import { SCORING_VERSION } from '../decision/settings.ts';
import { GENERATOR_VERSION } from '../generator/index.ts';
import { buildLayout, PLAN_SIZE } from '../generator/layout.ts';
import { PROFILE_MODEL_VERSION } from '../profiles/crowdProfile.ts';
import { flightSummary, type Runtime } from '../runtime/Runtime.ts';
import { HttpError, parse } from './http.ts';

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/);
const idParams = z.object({ id });
const airlineParams = z.object({ code: z.string().regex(/^[A-Z0-9]{2}$/) });
const kindParams = z.object({ kind: z.enum(ENTITY_KINDS as [EntityKind, ...EntityKind[]]) });

function rethrow(error: unknown): never {
  if (error instanceof CampaignError || error instanceof MasterDataError) throw new HttpError(error.statusCode, error.message);
  if (error instanceof z.ZodError) throw new HttpError(400, 'Invalid request', error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  if (error instanceof Error && ['unknown airline', 'partner must be a retailer or F&B outlet', 'not-found'].includes(error.message)) throw new HttpError(error.message === 'not-found' ? 404 : 400, error.message);
  throw error;
}

function guard<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    rethrow(error);
  }
}

const SCHEMAS = new Map(Object.entries(ENTITY_SCHEMAS));
const schemaFor = (kind: EntityKind) => SCHEMAS.get(kind) ?? ENTITY_SCHEMAS.vendors;

export function registerRoleRoutes(app: FastifyInstance, rt: Runtime): void {
  const layout = buildLayout();
  const requireAirline = (code: string) => {
    if (!rt.repo.airlines().some((a) => a.code === code)) throw new HttpError(404, 'airline not found');
  };
  const requireAdvertiser = (advertiserId: string) => {
    if (!rt.engine.advertiserById(advertiserId)) throw new HttpError(404, 'advertiser not found');
  };

  app.get('/api/zones', async () => [...rt.state.zones.values()].sort((a, b) => a.name.localeCompare(b.name)));

  // Platform Admin
  app.get('/api/admin/map', async () => {
    const zones = rt.presenceSummary();
    const paxByZone = new Map(zones.map((z) => [z.zoneId, z.pax]));
    return {
      plan: PLAN_SIZE,
      terminals: layout.terminals.map((t) => ({ id: t.id, name: t.name, bounds: t.bounds })),
      zones: rt.masterData.list('zones').map((z) => ({ ...(z as Record<string, unknown>), pax: paxByZone.get(String((z as { id: string }).id)) ?? 0 })),
      gates: [...rt.state.gates.values()].map((g) => ({ id: g.id, x: g.position.x, y: g.position.y, terminalId: g.terminalId })),
      screens: [...rt.state.screens.values()].map((s) => {
        const d = rt.engine.latest(s.id);
        return { id: s.id, name: s.name, x: s.position.x, y: s.position.y, zoneId: s.zoneId, status: s.status, latencyMs: rt.state.latencyMs.get(s.id) ?? 0, vendorId: s.vendorId, playing: d?.winner?.name ?? null };
      }),
    };
  });

  app.get('/api/admin/performance', async () => rt.metrics.snapshot(rt.clock.nowIso()));
  app.get('/api/admin/model', async () => ({ profileModel: PROFILE_MODEL_VERSION, scoring: SCORING_VERSION, generator: GENERATOR_VERSION, ai: rt.config.AI_PROVIDER, agent: rt.agent.name }));

  app.get('/api/admin/incidents', async (req) => {
    const q = parse(z.object({ status: z.enum([...INCIDENT_STATUSES, 'active']).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }), req.query);
    return { counts: rt.incidents.counts(), incidents: rt.incidents.list({ status: q.status, limit: q.limit }) };
  });
  app.post('/api/admin/incidents', async (req) => rt.incidents.createManual(parse(incidentCreateSchema, req.body)));
  app.put('/api/admin/incidents/:id', async (req) => {
    const { id: incidentId } = parse(idParams, req.params);
    return guard(() => rt.incidents.update(incidentId, parse(incidentUpdateSchema, req.body)));
  });

  app.get('/api/admin/master/:kind', async (req) => rt.masterData.list(parse(kindParams, req.params).kind));
  app.post('/api/admin/master/:kind', async (req) => {
    const { kind } = parse(kindParams, req.params);
    return guard(() => rt.masterData.save(kind, parse(schemaFor(kind), req.body)));
  });
  app.put('/api/admin/master/:kind/:id', async (req) => {
    const { kind, id: entityId } = parse(kindParams.extend({ id }), req.params);
    return guard(() => rt.masterData.save(kind, parse(schemaFor(kind), req.body), entityId));
  });

  // Retailer
  app.get('/api/retailer/:id/flow', async (req) => {
    const { id: advertiserId } = parse(idParams, req.params);
    requireAdvertiser(advertiserId);
    return rt.retailer.flow(advertiserId);
  });
  app.get('/api/retailer/:id/history', async (req) => {
    const { id: advertiserId } = parse(idParams, req.params);
    requireAdvertiser(advertiserId);
    return rt.retailer.history(advertiserId);
  });
  app.get('/api/retailer/:id/codes', async (req) => {
    const { id: advertiserId } = parse(idParams, req.params);
    requireAdvertiser(advertiserId);
    return rt.retailer.codes(advertiserId);
  });

  app.get('/api/campaigns', async (req) => {
    const q = parse(z.object({ advertiserId: id.optional() }), req.query);
    return rt.engine.campaigns.filter((c) => !q.advertiserId || c.advertiserId === q.advertiserId);
  });
  app.get('/api/campaigns/:id', async (req) => {
    const campaign = rt.engine.campaignById(parse(idParams, req.params).id);
    if (!campaign) throw new HttpError(404, 'campaign not found');
    return campaign;
  });
  app.get('/api/campaigns/:id/segments', async (req) => {
    const result = rt.retailer.segments(parse(idParams, req.params).id);
    if (!result) throw new HttpError(404, 'campaign not found');
    return result;
  });
  app.post('/api/campaigns/preview', async (req) => {
    const body = parse(z.object({ targeting: targetingInputSchema, hours: z.number().int().min(1).max(12).default(2), fromIso: z.iso.datetime().optional() }), req.body);
    return rt.campaignsService.preview(body);
  });
  app.post('/api/campaigns', async (req) => guard(() => rt.campaignsService.create(parse(campaignInputSchema, req.body))));
  app.put('/api/campaigns/:id', async (req) => {
    const { id: campaignId } = parse(idParams, req.params);
    return guard(() => rt.campaignsService.update(campaignId, parse(campaignInputSchema, req.body)));
  });
  app.post('/api/campaigns/:id/duplicate', async (req) => guard(() => rt.campaignsService.duplicate(parse(idParams, req.params).id)));
  app.post('/api/campaigns/:id/status', async (req) => {
    const { id: campaignId } = parse(idParams, req.params);
    const { status } = parse(z.object({ status: z.enum(['active', 'paused']) }), req.body);
    return guard(() => rt.campaignsService.setStatus(campaignId, status));
  });

  app.get('/api/creatives', async (req) => {
    const q = parse(z.object({ advertiserId: id.optional() }), req.query);
    return rt.engine.creativesList().filter((c) => !q.advertiserId || c.advertiserId === q.advertiserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  app.post('/api/creatives', async (req) => guard(() => rt.campaignsService.createCreative(parse(creativeInputSchema, req.body))));
  app.post('/api/assets', { bodyLimit: 1_200_000, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ advertiserId: id, data: z.string().min(16).max(1_000_000).regex(/^[A-Za-z0-9+/=]+$/) }), req.body);
    return guard(() => rt.campaignsService.uploadAsset(body.advertiserId, body.data));
  });
  app.get('/api/assets/:id', async (req, reply) => {
    const asset = rt.campaignsService.asset(parse(idParams, req.params).id);
    if (!asset) throw new HttpError(404, 'asset not found');
    return reply.header('Content-Type', asset.mime).header('Cache-Control', 'public, max-age=3600').header('X-Content-Type-Options', 'nosniff').send(asset.bytes);
  });
  app.post('/api/outlets/:id/stock', async (req) => {
    const { id: outletId } = parse(idParams, req.params);
    const { inStock } = parse(z.object({ inStock: z.boolean() }), req.body);
    const outlet = rt.engine.outletById(outletId);
    if (!outlet) throw new HttpError(404, 'outlet not found');
    return guard(() => rt.masterData.save('outlets', { ...outlet, inStock }, outletId));
  });

  // Media Manager
  app.get('/api/media/inventory', async (req) => {
    const { zoneId } = parse(z.object({ zoneId: id }), req.query);
    if (!rt.state.zones.has(zoneId)) throw new HttpError(404, 'zone not found');
    return rt.media.inventory(zoneId);
  });
  app.get('/api/media/yield', async () => rt.media.yield());
  app.get('/api/media/approvals', async () => rt.media.approvals());
  app.post('/api/media/approvals/:id', async (req) => {
    const { id: campaignId } = parse(idParams, req.params);
    return guard(() => rt.campaignsService.review(campaignId, parse(reviewInputSchema, req.body)));
  });
  app.get('/api/media/advertisers', async () => rt.media.advertisers());
  app.get('/api/media/heatmap', async (req) => {
    const { zoneId } = parse(z.object({ zoneId: id }), req.query);
    if (!rt.state.zones.has(zoneId)) throw new HttpError(404, 'zone not found');
    return rt.media.heatmap(zoneId);
  });
  app.get('/api/media/conflict', async (req) => {
    const q = parse(z.object({ screenId: id, a: id.optional(), b: id.optional() }), req.query);
    const result = rt.media.conflict(q.screenId, q.a, q.b);
    if (!result) throw new HttpError(404, 'no decision for this screen yet');
    return result;
  });
  app.get('/api/media/pins', async () => rt.engine.pinsList());
  app.post('/api/media/pins', async (req) => {
    const body = parse(z.object({ screenId: id, campaignId: id, reason: z.string().min(5).max(200), minutes: z.number().int().min(5).max(24 * 60).default(60) }), req.body);
    if (!rt.state.screens.has(body.screenId)) throw new HttpError(404, 'screen not found');
    if (!rt.engine.campaignById(body.campaignId)) throw new HttpError(404, 'campaign not found');
    rt.engine.pin(body.screenId, body.campaignId, body.reason, rt.clock.nowMs() + body.minutes * 60_000);
    const [decision] = rt.engine.replan([body.screenId], rt.clock.nowMs());
    return { pinned: true, decision: decision ? { source: decision.source, rule: decision.winningRule } : null };
  });
  app.delete('/api/media/pins/:id', async (req) => {
    const { id: screenId } = parse(idParams, req.params);
    rt.engine.unpin(screenId);
    rt.engine.replan([screenId], rt.clock.nowMs());
    return { pinned: false };
  });

  // Airline Representative
  app.get('/api/airline/:code/overview', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    const flights = [...rt.state.flights.values()].filter((f) => f.airlineCode === code).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)).map(flightSummary);
    return { flights, profile: rt.airline.profile(code) };
  });
  app.get('/api/airline/:code/partners', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    return rt.airline.partners(code);
  });
  app.get('/api/airline/:code/plays', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    return rt.airline.plays(code);
  });
  app.get('/api/airline/:code/messages', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    return rt.airline.gateMessages(code);
  });
  app.post('/api/airline/:code/messages', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    return guard(() => rt.airline.createGateMessage(code, parse(gateMessageSchema, req.body)));
  });
  app.get('/api/airline/:code/goodwill', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    return { rules: rt.airline.goodwillRules(code), activity: rt.airline.goodwillActivity(code) };
  });
  app.post('/api/airline/:code/goodwill', async (req) => {
    const { code } = parse(airlineParams, req.params);
    requireAirline(code);
    return guard(() => rt.airline.createGoodwill(code, parse(goodwillInputSchema, req.body)));
  });
  app.post('/api/airline/:code/goodwill/:id', async (req) => {
    const { code, id: ruleId } = parse(airlineParams.extend({ id }), req.params);
    const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
    const result = guard(() => rt.airline.toggleGoodwill(code, ruleId, enabled));
    if (!result) throw new HttpError(404, 'rule not found');
    return result;
  });
}

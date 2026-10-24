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
  rt.jump(rt.resolveTime('14:10'));
});

afterAll(async () => {
  await app.close();
  rt.stop();
});

const get = async (url: string) => {
  const res = await app.inject({ method: 'GET', url });
  return { status: res.statusCode, body: res.json() };
};
const send = async (method: 'POST' | 'PUT' | 'DELETE', url: string, payload: Record<string, unknown> = {}) => {
  const res = await app.inject({ method, url, payload });
  return { status: res.statusCode, body: res.json() };
};
const tick = (minutes: number) => {
  rt.control({ action: 'play' });
  for (let i = 0; i < minutes * 4; i++) rt.tick(15_000);
  rt.control({ action: 'pause' });
};

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('platform admin', () => {
  it('serves the live network map with every screen and zone presence', async () => {
    const { body } = await get('/api/admin/map');
    expect(body.screens).toHaveLength(180);
    expect(body.terminals.map((t: { id: string }) => t.id)).toEqual(['T1', 'T2']);
    expect(body.zones.some((z: { pax: number }) => z.pax > 0)).toBe(true);
    expect(body.screens.some((s: { status: string }) => s.status === 'offline')).toBe(true);
  });

  it('raises incidents automatically and resolves them when the cause clears', async () => {
    const screenId = rt.screenClosestToGate('42')?.id ?? '';
    rt.setScreenStatus(screenId, 'offline');
    tick(7);
    let incidents = (await get('/api/admin/incidents?status=active')).body.incidents as { kind: string; subjectId: string; owner: string; id: string }[];
    const offline = incidents.find((i) => i.kind === 'screen-offline' && i.subjectId === screenId);
    expect(offline?.owner).toBeTruthy();
    expect(incidents.some((i) => i.kind === 'creative-failed')).toBe(true);
    const updated = await send('PUT', `/api/admin/incidents/${offline?.id}`, { status: 'acknowledged', owner: 'Night shift' });
    expect(updated.body).toMatchObject({ status: 'acknowledged', owner: 'Night shift' });
    rt.setScreenStatus(screenId, 'online');
    tick(2);
    incidents = (await get('/api/admin/incidents?status=active')).body.incidents;
    expect(incidents.some((i) => i.id === offline?.id)).toBe(false);
  });

  it('creates and edits master data, with validation and conflict errors', async () => {
    const vendor = await send('POST', '/api/admin/master/vendors', { name: 'Brightpixel Signage', kind: 'screen-hardware', contactEmail: 'ops@brightpixel.example' });
    expect(vendor.status).toBe(200);
    const screen = await send('POST', '/api/admin/master/screens', { name: 'T2 North pillar test', zoneId: 'Z-T2-N-41', sizeInches: 55, orientation: 'portrait', resolution: '1080x1920', x: 1000, y: 260, vendorId: vendor.body.id });
    expect(screen.status).toBe(200);
    expect(screen.body.nearestGates.length).toBeGreaterThan(0);
    expect(rt.state.screens.has(screen.body.id)).toBe(true);
    const renamed = await send('PUT', `/api/admin/master/screens/${screen.body.id}`, { ...screen.body, name: 'Renamed pillar', x: 1000, y: 260 });
    expect(renamed.body.name).toBe('Renamed pillar');
    expect((await send('POST', '/api/admin/master/screens', { name: 'Bad', zoneId: 'Z-NOPE', sizeInches: 55, orientation: 'portrait', resolution: '1080x1920', x: 1, y: 1, vendorId: 'ven-luma' })).status).toBe(400);
    expect((await send('POST', '/api/admin/master/outlets', { advertiserId: 'adv-missing', name: 'Ghost shop', category: 'books', zoneId: 'Z-T1-PLAZA', avgBasket: 10 })).status).toBe(409);
    expect((await send('POST', '/api/admin/master/airlines', { code: 'lowercase', icaoCode: 'X', name: 'x', model: 'low-cost', hubRegion: 'domestic', brandColor: 'red' })).status).toBe(400);
    expect((await get('/api/admin/master/zones')).body.length).toBe(22);
  });

  it('reports performance and the model versions in use', async () => {
    const perf = (await get('/api/admin/performance')).body;
    expect(perf.uptime7d).toHaveLength(7);
    expect(perf.apiP95Ms).toBeGreaterThanOrEqual(0);
    expect((await get('/api/admin/model')).body.profileModel).toBe('crowd-rules-1.0');
    expect(rt.kpis().avgScreenLatencyMs).toBeGreaterThan(0);
  });
});

describe('retailer campaign builder', () => {
  let campaignId = '';

  it('previews the audience match and expected delivery before saving', async () => {
    const { body } = await send('POST', '/api/campaigns/preview', {
      targeting: { segmentWeights: { holiday: 1, international: 1 }, hardFilters: { internationalOnly: true }, placement: { zoneIds: ['Z-T2-N-41', 'Z-T2-N-47'] }, triggers: [] },
      hours: 2,
    });
    expect(body.matchPct).toBeGreaterThan(0);
    expect(body.expectedImpressions).toBeGreaterThan(0);
    expect(body.summary).toMatch(/^Matches \d+% of the crowd at .+ from \d\d:\d\d to \d\d:\d\d; expected [\d,]+ impressions and [\d,]+ redemptions$/);
  });

  it('creates a campaign that waits for brand-safety approval, then plays once approved', async () => {
    const now = rt.clock.nowMs();
    const created = await send('POST', '/api/campaigns', {
      advertiserId: 'adv-aurelle',
      outletId: 'out-aurelle-1',
      name: 'Evening fragrance edit',
      creativeIds: ['crv-perfume-15'],
      targeting: { segmentWeights: { holiday: 1, couple: 0.8, international: 1 }, hardFilters: { internationalOnly: true }, placement: { zoneIds: ['Z-T2-N-41'] }, triggers: [] },
      schedule: { start: new Date(now - 60_000).toISOString(), end: new Date(now + 7 * 86_400_000).toISOString() },
      budget: { total: 5000, dailyCap: 800 },
      offer: { headline: 'Evening fragrance edit', discountPct: 10 },
    });
    expect(created.status).toBe(200);
    expect(created.body.status).toBe('pending-approval');
    campaignId = created.body.id;
    const queue = (await get('/api/media/approvals')).body;
    expect(queue.pending.some((p: { campaign: { id: string } }) => p.campaign.id === campaignId)).toBe(true);
    const partial = await send('POST', `/api/media/approvals/${campaignId}`, { decision: 'approved', checklist: { noCompetitorMarks: true, claimsSubstantiated: false, ageAppropriate: true, translationChecked: true, legibleAtDistance: true } });
    expect(partial.status).toBe(400);
    const approved = await send('POST', `/api/media/approvals/${campaignId}`, { decision: 'approved', checklist: { noCompetitorMarks: true, claimsSubstantiated: true, ageAppropriate: true, translationChecked: true, legibleAtDistance: true }, notes: 'ok' });
    expect(approved.body.status).toBe('active');
    tick(1);
    const decision = rt.engine.latest(rt.screenClosestToGate('42')?.id ?? '');
    expect(decision?.candidates.find((c) => c.campaignId === campaignId)?.status).not.toBe('filtered');
  });

  it('rejects creatives from another advertiser and invalid schedules', async () => {
    const now = new Date(rt.clock.nowMs()).toISOString();
    const base = { advertiserId: 'adv-aurelle', name: 'Wrong creative', creativeIds: ['crv-toys-b2g1'], targeting: { segmentWeights: {}, hardFilters: {}, placement: {}, triggers: [] }, schedule: { start: now, end: now }, budget: { total: 100, dailyCap: 50 }, offer: { headline: 'x x x', discountPct: 5 } };
    expect((await send('POST', '/api/campaigns', base)).status).toBe(400);
  });

  it('duplicates a past campaign in one click and pauses it', async () => {
    const copy = await send('POST', '/api/campaigns/cmp-summer-scents/duplicate');
    expect(copy.body.name).toContain('run again');
    expect(copy.body.status).toBe('pending-approval');
    expect((await send('POST', `/api/campaigns/${campaignId}/status`, { status: 'paused' })).body.status).toBe('paused');
  });

  it('creates creatives and accepts only real image uploads', async () => {
    const asset = await send('POST', '/api/assets', { advertiserId: 'adv-aurelle', data: PNG_1X1 });
    expect(asset.body.mime).toBe('image/png');
    const image = await app.inject({ method: 'GET', url: `/api/assets/${asset.body.id}` });
    expect(image.headers['content-type']).toBe('image/png');
    expect((await send('POST', '/api/assets', { advertiserId: 'adv-aurelle', data: Buffer.from('<svg onload=alert(1)>').toString('base64') })).status).toBe(415);
    const creative = await send('POST', '/api/creatives', { advertiserId: 'adv-aurelle', name: 'Night bloom', template: 'hero-offer', headline: 'Night bloom, 12% off', cta: 'Scan', accentColor: '#9d174d', imageAssetId: asset.body.id, translations: { hi: { headline: 'नाइट ब्लूम, 12% छूट', subline: '', cta: 'स्कैन करें' } } });
    expect(creative.body.approval).toBe('pending');
  });
});

describe('retailer insights', () => {
  it('forecasts passenger flow near each store for the next two hours', async () => {
    const flow = (await get('/api/retailer/adv-horizon/flow')).body;
    expect(flow.length).toBe(3);
    const busiest = flow.sort((a: { next60: { uniquePax: number } }, b: { next60: { uniquePax: number } }) => b.next60.uniquePax - a.next60.uniquePax)[0];
    expect(busiest.next60.uniquePax).toBeGreaterThan(0);
    expect(busiest.next120.series).toHaveLength(13);
    expect(busiest.next60.topDestinations.length).toBeGreaterThan(0);
  });

  it('shows campaign history with ROI, codes and performance by segment', async () => {
    const history = (await get('/api/retailer/adv-aurelle/history')).body;
    expect(history.find((h: { id: string }) => h.id === 'cmp-summer-scents')).toMatchObject({ status: 'completed' });
    expect(history.every((h: { roi: number | null }) => h.roi === null || Number.isFinite(h.roi))).toBe(true);
    expect((await get('/api/retailer/adv-aurelle/codes')).body.summary).toBeDefined();
    const seg = (await get('/api/campaigns/cmp-toys-b2g1/segments')).body;
    expect(seg.segments.length).toBeGreaterThan(0);
    expect(typeof seg.headline).toBe('string');
  });

  it('pauses offers for an outlet that runs out of stock', async () => {
    const res = await send('POST', '/api/outlets/out-jetsetters-1/stock', { inStock: false });
    expect(res.body.inStock).toBe(false);
    tick(1);
    const toys = rt.engine.latestAll().flatMap((d) => d.candidates).find((c) => c.campaignId === 'cmp-toys-b2g1');
    expect(toys?.reason).toBe('stock');
    await send('POST', '/api/outlets/out-jetsetters-1/stock', { inStock: true });
  });
});

describe('media manager', () => {
  it('builds the inventory calendar and the 7-day yield outlook', async () => {
    const inv = (await get('/api/media/inventory?zoneId=Z-T2-N-41')).body;
    expect(inv.cells.length).toBe(inv.screens.length * 24);
    expect(inv.cells.some((c: { state: string }) => c.state === 'booked')).toBe(true);
    expect(inv.cells.some((c: { premium: boolean }) => c.premium)).toBe(true);
    const y = (await get('/api/media/yield')).body;
    expect(y.days).toHaveLength(7);
    expect(y.totalForecast).toBeGreaterThan(0);
  });

  it('lists advertisers by spend, the audience heatmap and the conflict view', async () => {
    const advertisers = (await get('/api/media/advertisers')).body;
    expect(advertisers[0].spend30d).toBeGreaterThanOrEqual(advertisers.at(-1).spend30d);
    const heat = (await get('/api/media/heatmap?zoneId=Z-T2-DUTYFREE')).body;
    expect(heat.rows.every((r: { values: number[] }) => r.values.length === 24)).toBe(true);
    const screenId = rt.screenClosestToGate('42')?.id ?? '';
    const conflict = (await get(`/api/media/conflict?screenId=${screenId}`)).body;
    expect(conflict.lines.length).toBeGreaterThan(0);
  });

  it('pins a campaign to a screen with a reason, and unpins it', async () => {
    const screenId = rt.screenClosestToGate('42')?.id ?? '';
    const pinned = await send('POST', '/api/media/pins', { screenId, campaignId: 'cmp-ya-kastell', reason: 'Sponsor launch hour', minutes: 30 });
    expect(pinned.body.decision.source).toBe('manual-pin');
    expect((await get('/api/media/pins')).body.some((p: { screenId: string }) => p.screenId === screenId)).toBe(true);
    await send('DELETE', `/api/media/pins/${screenId}`);
    expect(rt.engine.latest(screenId)?.source).not.toBe('manual-pin');
  });
});

describe('airline representative', () => {
  it('shows my flights and the aggregated crowd on them', async () => {
    const { body } = await get('/api/airline/XH/overview');
    expect(body.flights.length).toBeGreaterThan(0);
    expect(body.flights.every((f: { airlineCode: string }) => f.airlineCode === 'XH')).toBe(true);
    expect(body.profile.internationalShare).toBe(1);
    expect(body.profile.segments.holiday).toBeGreaterThan(0);
    expect((await get('/api/airline/QQ/overview')).status).toBe(404);
  });

  it('ranks partner offers by fit and shows what played at my gates', async () => {
    const partners = (await get('/api/airline/XH/partners')).body;
    expect(partners[0].fit).toBeGreaterThanOrEqual(partners.at(-1).fit);
    rt.jump(rt.resolveTime('14:10'));
    const plays = (await get('/api/airline/XH/plays')).body as { gate: string; flight: string; playing: string | null }[];
    expect(plays.some((p) => p.gate === '42' && p.flight === 'XH501' && p.playing)).toBe(true);
  });

  it('schedules gate messaging for its own boarding windows, pending approval', async () => {
    const res = await send('POST', '/api/airline/XD/messages', { name: 'Skylark seat upgrade', template: 'upgrade', headline: 'Extra legroom from 19', cta: 'Ask at the gate' });
    expect(res.body.status).toBe('pending-approval');
    expect(res.body.targeting.triggers[0]).toMatchObject({ kind: 'boarding', mode: 'required', airlines: ['XD'] });
    expect((await get('/api/airline/XD/messages')).body.some((m: { id: string }) => m.id === res.body.id)).toBe(true);
  });

  it('runs delay goodwill only for its own delayed flights', async () => {
    const rule = await send('POST', '/api/airline/XH/goodwill', { partnerAdvertiserId: 'adv-beanvoyage', thresholdMinutes: 60, airlineSharePct: 50 });
    expect(rule.status).toBe(200);
    rt.jump(rt.resolveTime('14:10'));
    const xh501 = [...rt.state.flights.values()].find((f) => f.airlineCode === 'XH' && f.flightNumber === '501' && f.direction === 'departure');
    rt.injectDelay(xh501?.id ?? '', 75);
    const gate42 = rt.engine.latest(rt.screenClosestToGate('42')?.id ?? '');
    expect(gate42?.candidates.find((c) => c.campaignId === rule.body.campaignId)?.status).not.toBe('filtered');
    const elsewhere = rt.engine.latestAll().find((d) => !d.crowd.flights.some((f) => f.label.startsWith('XH')) && d.crowd.flights.some((f) => f.delayMinutes >= 60));
    if (elsewhere) expect(elsewhere.candidates.find((c) => c.campaignId === rule.body.campaignId)?.reason).toMatch(/trigger-not-active|placement/);
    const toggled = await send('POST', `/api/airline/XH/goodwill/${rule.body.id}`, { enabled: false });
    expect(toggled.body.enabled).toBe(false);
    expect((await get('/api/airline/XH/goodwill')).body.rules[0].campaignStatus).toBe('paused');
  });
});

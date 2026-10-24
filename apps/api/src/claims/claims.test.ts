import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import type { Runtime } from '../runtime/Runtime.ts';
import { createTestRuntime } from '../testRuntime.ts';
import { createOfferToken, readOfferToken } from './tokens.ts';

let rt: Runtime;
let app: FastifyInstance;
let screenId = '';

beforeAll(async () => {
  rt = await createTestRuntime();
  app = await buildApp(loadConfig({ NODE_ENV: 'test', PUBLIC_BASE_URL: 'https://playground.example' }), rt);
  screenId = rt.screenClosestToGate('42')?.id ?? '';
  rt.jump(rt.resolveTime('14:10'));
});

afterAll(async () => {
  await app.close();
  rt.stop();
});

const get = (url: string) => app.inject({ method: 'GET', url });
const post = (url: string) => app.inject({ method: 'POST', url, payload: {} });

describe('offer tokens', () => {
  it('round-trips and rejects tampering', () => {
    const token = createOfferToken('secret-secret-secret', { c: 'cmp-perfume-15', s: 'SCR-052', f: null, e: 1 });
    expect(readOfferToken('secret-secret-secret', token)).toMatchObject({ c: 'cmp-perfume-15' });
    const [body] = token.split('.');
    expect(readOfferToken('secret-secret-secret', `${body}.AAAAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();
    expect(readOfferToken('other-secret-value!!', token)).toBeNull();
  });
});

describe('scan-to-claim flow', () => {
  let token = '';
  let code = '';

  it('gives each screen a signed QR link for what it is playing, expiring at the linked flight gate close', async () => {
    const res = await get(`/api/offers/screen/${screenId}`);
    expect(res.statusCode).toBe(200);
    const offer = res.json();
    expect(offer.url).toMatch(/^https:\/\/playground\.example\/c\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(offer.campaignId).toBe('cmp-perfume-15');
    expect(Date.parse(offer.expiresAt)).toBeGreaterThan(rt.clock.nowMs());
    token = offer.token;
  });

  it('opening the link shows the offer and counts a scan', async () => {
    const before = rt.claims.totals('cmp-perfume-15').scans;
    const res = await get(`/api/claim/${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ campaignId: 'cmp-perfume-15', discountPct: 15, familyShare: true });
    expect(rt.claims.totals('cmp-perfume-15').scans).toBe(before + 1);
  });

  it('claiming issues a unique code per phone and records a redemption the retailer sees at once', async () => {
    const first = (await post(`/api/claim/${token}`)).json();
    const second = (await post(`/api/claim/${token}`)).json();
    expect(first.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(second.code).not.toBe(first.code);
    code = first.code;
    const live = (await get('/api/retailer/adv-aurelle/live')).json();
    expect(live.today.redemptions).toBeGreaterThanOrEqual(2);
    expect(live.recentRedemptions.some((r: { code: string; source: string }) => r.code === code && r.source === 'qr-phone')).toBe(true);
  });

  it('shares one family code per claimed code', async () => {
    const family = (await post(`/api/codes/${code}/share`)).json();
    expect(family.code).toMatch(/^[A-Z0-9]{8}$/);
    expect((await post(`/api/codes/${code}/share`)).json().code).toBe(family.code);
    expect((await post(`/api/codes/${family.code}/share`)).statusCode).toBe(400);
    expect((await get(`/api/codes/${code}`)).json()).toMatchObject({ familyCode: family.code, expired: false });
  });

  it('rejects forged links and expires offers once the flight has boarded', async () => {
    expect((await get(`/api/claim/${token.slice(0, -2)}xx`)).statusCode).toBe(400);
    expect((await get('/api/claim/not-a-token')).statusCode).toBe(400);
    const expires = Date.parse((await get(`/api/codes/${code}`)).json().expiresAt);
    rt.jump(expires + 60_000);
    expect((await get(`/api/claim/${token}`)).statusCode).toBe(410);
    expect((await get(`/api/codes/${code}`)).json().expired).toBe(true);
  });
});

describe('simulated shoppers', () => {
  it('turn plays into scans and redemptions so dashboards tick between phone scans', () => {
    rt.jump(rt.resolveTime('15:00'));
    rt.control({ action: 'speed', speed: 60 });
    rt.control({ action: 'play' });
    for (let i = 0; i < 120; i++) rt.tick(250);
    rt.control({ action: 'pause' });
    const live = rt.retailerLive('adv-horizon');
    expect(live.today.impressions).toBeGreaterThan(0);
    expect(live.today.scans).toBeGreaterThan(0);
    expect(live.today.redemptions).toBeGreaterThan(0);
    expect(live.today.revenueAttributed).toBeGreaterThan(0);
  }, 60_000);

  it('keep learned lifts calibrated, and demo reset restores the worked example', () => {
    const lifts = rt.engine.latestAll().flatMap((d) => d.candidates.flatMap((c) => (c.breakdown ? [c.breakdown.learnLift] : [])));
    const capped = lifts.filter((l) => l >= 1.15).length;
    expect(lifts.length).toBeGreaterThan(100);
    expect(capped / lifts.length).toBeLessThan(0.5);
    rt.resetDemo(rt.resolveTime('14:10'));
    expect(rt.engine.latest(screenId)?.winner?.campaignId).toBe('cmp-perfume-15');
    expect(rt.retailerLive('adv-horizon').today.redemptions).toBe(0);
  });
});

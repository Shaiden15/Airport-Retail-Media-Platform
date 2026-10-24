import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ClaimError } from '../claims/ClaimService.ts';
import { SAMPLE_COMPANIES } from '../generator/platform.ts';
import { publicBaseUrl } from '../network.ts';
import type { AppConfig } from '../config.ts';
import type { Runtime } from '../runtime/Runtime.ts';
import { HttpError, parse } from './http.ts';

const tokenParams = z.object({ token: z.string().min(10).max(500).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/) });
const codeParams = z.object({ code: z.string().regex(/^[A-Z0-9]{8}$/) });
const idParams = z.object({ id: z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/) });
const strict = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

function rethrow(error: unknown): never {
  if (error instanceof ClaimError) throw new HttpError(error.statusCode, error.message);
  throw error;
}

export function registerClaimRoutes(app: FastifyInstance, rt: Runtime, config: AppConfig): void {
  const base = publicBaseUrl(config);

  app.get('/api/config/public', async () => ({
    publicBaseUrl: base,
    airport: { code: rt.airport.iataCode, name: rt.airport.name, operatingDate: rt.airport.operatingDate },
    sampleCompanies: SAMPLE_COMPANIES,
  }));

  app.get('/api/advertisers', async () => rt.repo.advertisers());
  app.get('/api/airlines', async () => rt.repo.airlines());
  app.get('/api/outlets', async () => rt.repo.outlets());
  app.get('/api/gates', async () => [...rt.state.gates.values()].map((g) => ({ id: g.id, terminalId: g.terminalId, zoneId: g.zoneId })));

  app.get('/api/creatives/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    const creative = rt.repo.creatives().find((c) => c.id === id);
    if (!creative) throw new HttpError(404, 'creative not found');
    return creative;
  });

  // The QR on a screen: a signed, expiring offer link for whatever that screen is playing now
  app.get('/api/offers/screen/:id', async (req) => {
    const { id } = parse(idParams, req.params);
    const offer = rt.claims.offerForScreen(id);
    if (!offer) throw new HttpError(404, 'no offer playing on this screen');
    return { ...offer, url: `${base}/c/${offer.token}` };
  });

  app.get('/api/claim/:token', async (req) => {
    const { token } = parse(tokenParams, req.params);
    try {
      return rt.claims.scan(token);
    } catch (error) {
      rethrow(error);
    }
  });

  app.post('/api/claim/:token', strict, async (req) => {
    const { token } = parse(tokenParams, req.params);
    try {
      return rt.claims.claim(token);
    } catch (error) {
      rethrow(error);
    }
  });

  app.get('/api/codes/:code', async (req) => {
    const { code } = parse(codeParams, req.params);
    try {
      return rt.claims.codeStatus(code);
    } catch (error) {
      rethrow(error);
    }
  });

  app.post('/api/codes/:code/share', strict, async (req) => {
    const { code } = parse(codeParams, req.params);
    try {
      return rt.claims.share(code);
    } catch (error) {
      rethrow(error);
    }
  });

  app.get('/api/retailer/:id/live', async (req) => {
    const { id } = parse(idParams, req.params);
    if (!rt.repo.advertisers().some((a) => a.id === id)) throw new HttpError(404, 'advertiser not found');
    return rt.retailerLive(id);
  });
}

import { z } from 'zod';
import { pointSchema } from './airport.ts';
import { regionSchema } from './flight.ts';
import { isoDateTime } from './provenance.ts';
import { segmentSchema } from './profile.ts';

export const airlineSchema = z.object({
  code: z.string().min(2).max(3),
  name: z.string(),
  model: z.enum(['full-service', 'low-cost']),
  hubRegion: regionSchema,
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Airline = z.infer<typeof airlineSchema>;

export const vendorSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['screen-hardware', 'network', 'content-agency']),
  contactEmail: z.email(),
});
export type Vendor = z.infer<typeof vendorSchema>;

export const ADVERTISER_KINDS = ['retailer', 'fnb', 'airline', 'brand', 'lounge'] as const;
export const CATEGORIES = [
  'duty-free',
  'perfume',
  'fashion',
  'electronics',
  'toys',
  'books',
  'pharmacy',
  'chocolate',
  'sweets',
  'coffee',
  'restaurant',
  'bar',
  'lounge',
  'airline',
  'travel-services',
] as const;
export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

export const advertiserSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ADVERTISER_KINDS),
  category: categorySchema,
  airlineCode: z.string().nullable(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export type Advertiser = z.infer<typeof advertiserSchema>;

export const outletSchema = z.object({
  id: z.string(),
  advertiserId: z.string(),
  name: z.string(),
  category: categorySchema,
  terminalId: z.string(),
  zoneId: z.string(),
  nearestGates: z.array(z.string()),
  avgBasket: z.number().positive(),
  inStock: z.boolean(),
});
export type Outlet = z.infer<typeof outletSchema>;

export const SCREEN_STATUSES = ['online', 'degraded', 'offline'] as const;

export const screenSchema = z.object({
  id: z.string(),
  name: z.string(),
  terminalId: z.string(),
  zoneId: z.string(),
  sizeInches: z.number().int().positive(),
  orientation: z.enum(['portrait', 'landscape']),
  resolution: z.string(),
  position: pointSchema,
  nearestGates: z.array(z.object({ gate: z.string(), distanceM: z.number().nonnegative() })),
  vendorId: z.string(),
  status: z.enum(SCREEN_STATUSES),
  premium: z.boolean(),
});
export type Screen = z.infer<typeof screenSchema>;

export const TRIGGER_KINDS = ['delay', 'gate-change', 'boarding', 'festival'] as const;

export const triggerSchema = z.object({
  kind: z.enum(TRIGGER_KINDS),
  minDelayMinutes: z.number().int().nonnegative().nullable(),
  destinations: z.array(z.string().length(3)),
  boost: z.number().min(1).max(3),
  // boost: raises the score when it fires; required: campaign is only eligible while it fires
  mode: z.enum(['boost', 'required']),
});
export type Trigger = z.infer<typeof triggerSchema>;

export const targetingSchema = z.object({
  segmentWeights: z.partialRecord(segmentSchema, z.number().min(0).max(1)),
  hardFilters: z.object({
    internationalOnly: z.boolean(),
    domesticOnly: z.boolean(),
    destinationRegions: z.array(regionSchema),
    destinations: z.array(z.string().length(3)),
    minDwellMinutes: z.number().int().nonnegative(),
    minCrowd: z.number().int().nonnegative(),
  }),
  placement: z.object({
    zoneIds: z.array(z.string()),
    screenIds: z.array(z.string()),
    gates: z.array(z.string()),
  }),
  triggers: z.array(triggerSchema),
});
export type Targeting = z.infer<typeof targetingSchema>;

export const CAMPAIGN_STATUSES = ['draft', 'pending-approval', 'approved', 'rejected', 'active', 'paused', 'completed'] as const;

export const campaignSchema = z.object({
  id: z.string(),
  advertiserId: z.string(),
  outletId: z.string().nullable(),
  name: z.string(),
  category: categorySchema,
  status: z.enum(CAMPAIGN_STATUSES),
  creativeIds: z.array(z.string()),
  targeting: targetingSchema,
  schedule: z.object({
    start: isoDateTime,
    end: isoDateTime,
    dailyHours: z.object({ from: z.number().int().min(0).max(23), to: z.number().int().min(1).max(24) }),
  }),
  budget: z.object({
    total: z.number().nonnegative(),
    dailyCap: z.number().nonnegative(),
    spent: z.number().nonnegative(),
    pricePerPlay: z.number().nonnegative(),
    frequencyCapPerScreenHour: z.number().int().positive(),
  }),
  offer: z.object({
    headline: z.string(),
    discountPct: z.number().min(0).max(100),
    promoValidity: z.enum(['linked-flight-boarding', 'fixed-minutes']),
    fixedMinutes: z.number().int().positive().nullable(),
    perOfferCap: z.number().int().positive().nullable(),
    familyShare: z.boolean(),
  }),
  brandSafety: z.object({ checked: z.boolean(), notes: z.string() }),
  createdAt: isoDateTime,
});
export type Campaign = z.infer<typeof campaignSchema>;

export const CREATIVE_TEMPLATES = ['hero-offer', 'countdown-deal', 'destination', 'upgrade', 'goodwill'] as const;

// Creatives are structured content rendered by React templates, never raw HTML
export const creativeSchema = z.object({
  id: z.string(),
  advertiserId: z.string(),
  name: z.string(),
  template: z.enum(CREATIVE_TEMPLATES),
  content: z.object({
    headline: z.string().max(80),
    subline: z.string().max(140),
    cta: z.string().max(40),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    imageAssetId: z.string().nullable(),
  }),
  translations: z.partialRecord(z.string(), z.object({ headline: z.string(), subline: z.string(), cta: z.string() })),
  approval: z.enum(['pending', 'approved', 'rejected']),
  createdAt: isoDateTime,
});
export type Creative = z.infer<typeof creativeSchema>;

export const promoCodeSchema = z.object({
  code: z.string().min(6).max(16),
  campaignId: z.string(),
  screenId: z.string(),
  linkedFlightId: z.string().nullable(),
  parentCode: z.string().nullable(),
  issuedAt: isoDateTime,
  expiresAt: isoDateTime,
  redeemedAt: isoDateTime.nullable(),
});
export type PromoCode = z.infer<typeof promoCodeSchema>;

export const impressionSchema = z.object({
  id: z.string(),
  decisionId: z.string(),
  campaignId: z.string(),
  creativeId: z.string(),
  screenId: z.string(),
  playedAt: isoDateTime,
  estimatedViewers: z.number().int().nonnegative(),
});
export type Impression = z.infer<typeof impressionSchema>;

export const redemptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  campaignId: z.string(),
  outletId: z.string().nullable(),
  redeemedAt: isoDateTime,
  basketValue: z.number().nonnegative(),
  dominantSegment: segmentSchema.nullable(),
});
export type Redemption = z.infer<typeof redemptionSchema>;

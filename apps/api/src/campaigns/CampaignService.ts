import { randomInt } from 'node:crypto';
import { z } from 'zod';
import {
  CATEGORIES,
  CREATIVE_TEMPLATES,
  REGIONS,
  SEGMENTS,
  TRIGGER_KINDS,
  campaignSchema,
  creativeSchema,
  type Campaign,
  type Creative,
  type Screen,
} from '@dwellcast/shared';
import type { Database } from '../db/database.ts';
import type { DecisionEngine } from '../decision/DecisionEngine.ts';
import { audienceFilter } from '../decision/eligibility.ts';
import { audienceMatch } from '../decision/scorer.ts';
import { priceSlot, SLOTS_PER_HOUR } from '../media/pricing.ts';
import type { PresenceEngine } from '../presence/PresenceEngine.ts';
import type { SimClock } from '../sim/SimClock.ts';
import type { AirportState } from '../state/AirportState.ts';

export class CampaignError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'CampaignError';
  }
}

const id = z.string().min(1).max(80).regex(/^[A-Za-z0-9._-]+$/);
const iata = z.string().length(3).regex(/^[A-Z]{3}$/);

export const targetingInputSchema = z.object({
  segmentWeights: z.partialRecord(z.enum(SEGMENTS), z.number().min(0).max(1)),
  hardFilters: z.object({
    internationalOnly: z.boolean().default(false),
    domesticOnly: z.boolean().default(false),
    destinationRegions: z.array(z.enum(REGIONS)).max(9).default([]),
    destinations: z.array(iata).max(30).default([]),
    minDwellMinutes: z.number().int().min(0).max(240).default(0),
    minCrowd: z.number().int().min(0).max(5000).default(0),
  }),
  placement: z.object({
    zoneIds: z.array(id).max(40).default([]),
    screenIds: z.array(id).max(200).default([]),
    gates: z.array(id).max(80).default([]),
  }),
  triggers: z
    .array(
      z.object({
        kind: z.enum(TRIGGER_KINDS),
        minDelayMinutes: z.number().int().min(0).max(600).nullable().default(null),
        destinations: z.array(iata).max(30).default([]),
        boost: z.number().min(1).max(3).default(1.3),
        mode: z.enum(['boost', 'required']).default('boost'),
        airlines: z.array(z.string().min(2).max(3)).max(11).default([]),
      }),
    )
    .max(5)
    .default([]),
});

export const scheduleInputSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  dailyHours: z.object({ from: z.number().int().min(0).max(23), to: z.number().int().min(1).max(24) }).default({ from: 0, to: 24 }),
});

export const campaignInputSchema = z.object({
  advertiserId: id,
  outletId: id.nullable().default(null),
  name: z.string().min(3).max(80),
  category: z.enum(CATEGORIES).optional(),
  creativeIds: z.array(id).min(1).max(3),
  targeting: targetingInputSchema,
  schedule: scheduleInputSchema,
  budget: z.object({
    total: z.number().min(50).max(1_000_000),
    dailyCap: z.number().min(10).max(100_000),
    frequencyCapPerScreenHour: z.number().int().min(1).max(120).default(40),
  }),
  offer: z.object({
    headline: z.string().min(3).max(80),
    discountPct: z.number().min(0).max(100),
    promoValidity: z.enum(['linked-flight-boarding', 'fixed-minutes']).default('linked-flight-boarding'),
    fixedMinutes: z.number().int().min(5).max(240).nullable().default(null),
    perOfferCap: z.number().int().min(1).max(100_000).nullable().default(null),
    familyShare: z.boolean().default(true),
  }),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

export const creativeInputSchema = z.object({
  advertiserId: id,
  name: z.string().min(3).max(80),
  template: z.enum(CREATIVE_TEMPLATES),
  headline: z.string().min(2).max(80),
  subline: z.string().max(140).default(''),
  cta: z.string().min(2).max(40),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  imageAssetId: id.nullable().default(null),
  translations: z.partialRecord(z.string().min(2).max(5), z.object({ headline: z.string().max(80), subline: z.string().max(140), cta: z.string().max(40) })).default({}),
});
export type CreativeInput = z.infer<typeof creativeInputSchema>;

export const reviewInputSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  checklist: z.object({
    noCompetitorMarks: z.boolean(),
    claimsSubstantiated: z.boolean(),
    ageAppropriate: z.boolean(),
    translationChecked: z.boolean(),
    legibleAtDistance: z.boolean(),
  }),
  notes: z.string().max(500).default(''),
  reviewer: z.string().min(2).max(60).default('Media Manager'),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export interface AudiencePreview {
  matchPct: number;
  eligibleShare: number;
  screens: number;
  window: { from: string; to: string };
  expectedPlays: number;
  expectedImpressions: number;
  expectedRedemptions: number;
  estimatedSpend: number;
  pricePerPlay: number;
  topReasons: { reason: string; share: number }[];
  summary: string;
}

const IMAGE_SIGNATURES: readonly { mime: 'image/png' | 'image/jpeg' | 'image/webp'; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
const suffix = () => randomInt(36 ** 4).toString(36).padStart(4, '0');

// Campaign and creative lifecycle: create, edit, duplicate, review, and the builder's live audience preview
export class CampaignService {
  constructor(
    private readonly db: Database,
    private readonly engine: DecisionEngine,
    private readonly presence: PresenceEngine,
    private readonly state: AirportState,
    private readonly clock: SimClock,
  ) {}

  private placementScreens(placement: CampaignInput['targeting']['placement']): Screen[] {
    const all = [...this.state.screens.values()];
    if (!placement.zoneIds.length && !placement.screenIds.length && !placement.gates.length) return all;
    return all.filter((s) => placement.zoneIds.includes(s.zoneId) || placement.screenIds.includes(s.id) || s.nearestGates.some((g) => placement.gates.includes(g.gate)));
  }

  private persist(c: Campaign): void {
    this.db
      .prepare(
        'INSERT INTO campaigns (id, advertiser_id, outlet_id, name, category, status, creative_ids, targeting, schedule, budget, offer, brand_safety, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET outlet_id = excluded.outlet_id, name = excluded.name, category = excluded.category, status = excluded.status, creative_ids = excluded.creative_ids, targeting = excluded.targeting, schedule = excluded.schedule, budget = excluded.budget, offer = excluded.offer, brand_safety = excluded.brand_safety',
      )
      .run(c.id, c.advertiserId, c.outletId, c.name, c.category, c.status, JSON.stringify(c.creativeIds), JSON.stringify(c.targeting), JSON.stringify(c.schedule), JSON.stringify(c.budget), JSON.stringify(c.offer), JSON.stringify(c.brandSafety), c.createdAt);
    this.engine.upsertCampaign(c);
  }

  private validateOwnership(input: CampaignInput): void {
    const advertiser = this.engine.advertiserById(input.advertiserId);
    if (!advertiser) throw new CampaignError('Unknown advertiser', 404);
    for (const creativeId of input.creativeIds) {
      if (this.engine.creativeById(creativeId)?.advertiserId !== input.advertiserId) throw new CampaignError(`Creative ${creativeId} does not belong to this advertiser`, 400);
    }
    if (input.outletId && this.engine.outletById(input.outletId)?.advertiserId !== input.advertiserId) throw new CampaignError('Outlet does not belong to this advertiser', 400);
    if (Date.parse(input.schedule.end) <= Date.parse(input.schedule.start)) throw new CampaignError('Schedule end must be after its start', 400);
    if (input.schedule.dailyHours.to <= input.schedule.dailyHours.from) throw new CampaignError('Daily hours must end after they start', 400);
    if (input.targeting.hardFilters.internationalOnly && input.targeting.hardFilters.domesticOnly) throw new CampaignError('Choose international or domestic, not both', 400);
  }

  private pricePerPlay(placement: CampaignInput['targeting']['placement']): number {
    const screens = this.placementScreens(placement).slice(0, 12);
    const hour = Math.floor(this.clock.nowMs() / 3_600_000) * 3_600_000;
    const prices = screens.map((s) => priceSlot(this.presence, s, hour).pricePerPlay);
    return prices.length ? Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 10_000) / 10_000 : 0.04;
  }

  create(input: CampaignInput): Campaign {
    this.validateOwnership(input);
    const advertiser = this.engine.advertiserById(input.advertiserId);
    const campaign = campaignSchema.parse({
      id: `cmp-${slug(input.name)}-${suffix()}`,
      advertiserId: input.advertiserId,
      outletId: input.outletId,
      name: input.name,
      category: input.category ?? advertiser?.category ?? 'duty-free',
      status: 'pending-approval',
      creativeIds: input.creativeIds,
      targeting: input.targeting,
      schedule: input.schedule,
      budget: { ...input.budget, spent: 0, pricePerPlay: this.pricePerPlay(input.targeting.placement) },
      offer: input.offer,
      brandSafety: { checked: false, notes: '' },
      createdAt: this.clock.nowIso(),
    });
    this.persist(campaign);
    return campaign;
  }

  // Any change to what or where a campaign plays sends it back for brand-safety review
  update(campaignId: string, input: CampaignInput): Campaign {
    const existing = this.engine.campaignById(campaignId);
    if (!existing) throw new CampaignError('Campaign not found', 404);
    if (existing.advertiserId !== input.advertiserId) throw new CampaignError('Campaign belongs to another advertiser', 403);
    this.validateOwnership(input);
    const campaign = campaignSchema.parse({
      ...existing,
      outletId: input.outletId,
      name: input.name,
      category: input.category ?? existing.category,
      status: 'pending-approval',
      creativeIds: input.creativeIds,
      targeting: input.targeting,
      schedule: input.schedule,
      budget: { ...existing.budget, ...input.budget },
      offer: input.offer,
      brandSafety: { checked: false, notes: '' },
    });
    this.persist(campaign);
    return campaign;
  }

  // Run again: same creative and targeting, a fresh schedule of the same length starting now
  duplicate(campaignId: string): Campaign {
    const source = this.engine.campaignById(campaignId);
    if (!source) throw new CampaignError('Campaign not found', 404);
    const length = Date.parse(source.schedule.end) - Date.parse(source.schedule.start);
    const start = this.clock.nowMs();
    const copy = campaignSchema.parse({
      ...structuredClone(source),
      id: `cmp-${slug(source.name)}-${suffix()}`,
      name: `${source.name} (run again)`.slice(0, 80),
      status: 'pending-approval',
      schedule: { ...source.schedule, start: new Date(start).toISOString(), end: new Date(start + length).toISOString() },
      budget: { ...source.budget, spent: 0 },
      brandSafety: { checked: false, notes: '' },
      createdAt: this.clock.nowIso(),
    });
    this.persist(copy);
    return copy;
  }

  setStatus(campaignId: string, status: 'active' | 'paused'): Campaign {
    const c = this.engine.campaignById(campaignId);
    if (!c) throw new CampaignError('Campaign not found', 404);
    if (status === 'active' && !c.brandSafety.checked) throw new CampaignError('Campaign must be approved before it can run', 409);
    const next = { ...c, status };
    this.persist(next);
    return next;
  }

  review(campaignId: string, input: ReviewInput): Campaign {
    const c = this.engine.campaignById(campaignId);
    if (!c) throw new CampaignError('Campaign not found', 404);
    const allChecked = Object.values(input.checklist).every(Boolean);
    if (input.decision === 'approved' && !allChecked) throw new CampaignError('Every brand-safety check must pass before approval', 400);
    const approved = input.decision === 'approved';
    const started = Date.parse(c.schedule.start) <= this.clock.nowMs();
    const next = campaignSchema.parse({
      ...c,
      status: approved ? (started ? 'active' : 'approved') : 'rejected',
      brandSafety: { checked: approved, notes: input.notes },
    });
    for (const creativeId of c.creativeIds) {
      const creative = this.engine.creativeById(creativeId);
      if (!creative) continue;
      const updated = { ...creative, approval: approved ? ('approved' as const) : ('rejected' as const) };
      this.db.prepare('UPDATE creatives SET approval = ? WHERE id = ?').run(updated.approval, updated.id);
      this.engine.upsertCreative(updated);
    }
    this.db.prepare('INSERT INTO campaign_reviews (id, campaign_id, decision, checklist, notes, reviewer, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`rev-${suffix()}${suffix()}`, c.id, input.decision, JSON.stringify(input.checklist), input.notes, input.reviewer, this.clock.nowIso());
    this.persist(next);
    return next;
  }

  createCreative(input: CreativeInput): Creative {
    if (!this.engine.advertiserById(input.advertiserId)) throw new CampaignError('Unknown advertiser', 404);
    if (input.imageAssetId) {
      const owner = this.db.prepare('SELECT advertiser_id FROM assets WHERE id = ?').get(input.imageAssetId);
      if (!owner || String(owner.advertiser_id) !== input.advertiserId) throw new CampaignError('Image does not belong to this advertiser', 400);
    }
    const creative = creativeSchema.parse({
      id: `crv-${slug(input.name)}-${suffix()}`,
      advertiserId: input.advertiserId,
      name: input.name,
      template: input.template,
      content: { headline: input.headline, subline: input.subline, cta: input.cta, accentColor: input.accentColor, imageAssetId: input.imageAssetId },
      translations: input.translations,
      approval: 'pending',
      createdAt: this.clock.nowIso(),
    });
    this.db.prepare('INSERT INTO creatives (id, advertiser_id, name, template, content, translations, approval, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(creative.id, creative.advertiserId, creative.name, creative.template, JSON.stringify(creative.content), JSON.stringify(creative.translations), creative.approval, creative.createdAt);
    this.engine.upsertCreative(creative);
    return creative;
  }

  // Images arrive as base64 and are accepted only if their bytes really are PNG, JPEG or WebP
  uploadAsset(advertiserId: string, base64: string): { id: string; mime: string; size: number } {
    if (!this.engine.advertiserById(advertiserId)) throw new CampaignError('Unknown advertiser', 404);
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 0 || bytes.length > 700_000) throw new CampaignError('Image must be under 700 KB', 413);
    const kind = IMAGE_SIGNATURES.find((s) => s.test(bytes));
    if (!kind) throw new CampaignError('Only PNG, JPEG or WebP images are accepted', 415);
    const assetId = `ast-${suffix()}${suffix()}`;
    this.db.prepare('INSERT INTO assets (id, advertiser_id, mime, bytes, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(assetId, advertiserId, kind.mime, bytes, bytes.length, this.clock.nowIso());
    return { id: assetId, mime: kind.mime, size: bytes.length };
  }

  asset(assetId: string): { mime: string; bytes: Buffer } | null {
    const row = this.db.prepare('SELECT mime, bytes FROM assets WHERE id = ?').get(assetId);
    if (!row) return null;
    return { mime: String(row.mime), bytes: Buffer.from(row.bytes as Uint8Array) };
  }

  // Forecast for the builder: audience match and expected delivery over the chosen screens and hours
  preview(input: { targeting: CampaignInput['targeting']; hours: number; fromIso?: string | undefined }): AudiencePreview {
    const screens = this.placementScreens(input.targeting.placement);
    const sample = screens.filter((_, i) => i % Math.max(1, Math.ceil(screens.length / 24)) === 0);
    const from = input.fromIso ? Date.parse(input.fromIso) : this.clock.nowMs();
    const hours = Math.min(12, Math.max(1, input.hours));
    const times = Array.from({ length: hours * 2 }, (_, i) => from + i * 30 * 60_000);
    let matched = 0;
    let crowdTotal = 0;
    let eligible = 0;
    let checked = 0;
    let impressionsPerSlot = 0;
    const reasons = new Map<string, number>();
    for (const screen of sample) {
      for (const t of times) {
        const crowd = this.presence.screen(screen, t);
        checked++;
        const reason = audienceFilter(input.targeting.hardFilters, crowd);
        if (reason) {
          reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
          continue;
        }
        eligible++;
        const { match } = audienceMatch(input.targeting.segmentWeights, crowd.segments);
        matched += match * crowd.pax;
        crowdTotal += crowd.pax;
        impressionsPerSlot += crowd.pax * 0.35;
      }
    }
    const matchPct = crowdTotal > 0 ? matched / crowdTotal : 0;
    const eligibleShare = checked > 0 ? eligible / checked : 0;
    // Expected share of voice grows with match, bounded by rotation with other campaigns
    const shareOfVoice = Math.min(0.5, Math.max(0.05, matchPct * 0.6));
    const avgImpressionsPerPlay = eligible > 0 ? impressionsPerSlot / eligible : 0;
    const expectedPlays = Math.round(screens.length * hours * SLOTS_PER_HOUR * eligibleShare * shareOfVoice);
    const expectedImpressions = Math.round(expectedPlays * avgImpressionsPerPlay);
    const expectedRedemptions = Math.round(expectedImpressions * 0.0006);
    const pricePerPlay = this.pricePerPlay(input.targeting.placement);
    const zones = [...new Set(screens.map((s) => this.state.zones.get(s.zoneId)?.name ?? s.zoneId))];
    const where = zones.length === 0 ? 'no screens' : zones.length <= 2 ? zones.join(' and ') : `${zones.length} zones`;
    const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
    const to = from + hours * 3_600_000;
    return {
      matchPct: Math.round(matchPct * 1000) / 1000,
      eligibleShare: Math.round(eligibleShare * 1000) / 1000,
      screens: screens.length,
      window: { from: new Date(from).toISOString(), to: new Date(to).toISOString() },
      expectedPlays,
      expectedImpressions,
      expectedRedemptions,
      estimatedSpend: Math.round(expectedPlays * pricePerPlay * 100) / 100,
      pricePerPlay,
      topReasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([reason, n]) => ({ reason, share: Math.round((n / Math.max(1, checked)) * 100) / 100 })),
      summary: `Matches ${Math.round(matchPct * 100)}% of the crowd at ${where} from ${hhmm(from)} to ${hhmm(to)}; expected ${expectedImpressions.toLocaleString('en-US')} impressions and ${expectedRedemptions.toLocaleString('en-US')} redemptions`,
    };
  }
}

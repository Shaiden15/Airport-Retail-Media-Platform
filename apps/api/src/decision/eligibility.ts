import type { Campaign, Creative, Outlet, Screen, Trigger } from '@dwellcast/shared';
import type { Crowd } from '../presence/PresenceEngine.ts';
import { CITY_BY_CODE } from '../generator/reference.ts';

export const FILTER_REASONS = [
  'status',
  'approval',
  'brand-safety',
  'schedule',
  'placement',
  'domestic-international',
  'destination',
  'dwell',
  'min-crowd',
  'budget',
  'stock',
  'trigger-not-active',
] as const;
export type FilterReason = (typeof FILTER_REASONS)[number];

export interface FiredTrigger {
  kind: Trigger['kind'];
  mode: Trigger['mode'];
  boost: number;
  flightId: string | null;
  detail: string;
}

export interface EligibilityContext {
  screen: Screen;
  crowd: Crowd;
  simMs: number;
  festival: boolean;
  creatives: ReadonlyMap<string, Creative>;
  outlets: ReadonlyMap<string, Outlet>;
  spentToday: number;
  gateChangedAt: ReadonlyMap<string, number>;
}

const MINUTE = 60_000;

// Airline campaigns only react to their own airline's flights
export function evaluateTriggers(campaign: Campaign, ctx: EligibilityContext, airlineCode: string | null = null): FiredTrigger[] {
  const fired: FiredTrigger[] = [];
  for (const trigger of campaign.targeting.triggers) {
    const wanted = (dest: string) => !trigger.destinations.length || trigger.destinations.includes(dest);
    const flights = ctx.crowd.flights.filter((f) => f.share >= 0.05 && wanted(f.destination) && (!airlineCode || f.label.startsWith(airlineCode)));
    let hit: FiredTrigger | null = null;
    if (trigger.kind === 'delay') {
      const f = flights.filter((x) => x.delayMinutes >= (trigger.minDelayMinutes ?? 0)).sort((a, b) => b.pax - a.pax).at(0);
      if (f) hit = { kind: 'delay', mode: trigger.mode, boost: trigger.boost, flightId: f.flightId, detail: `${f.label} delayed ${f.delayMinutes} min` };
    } else if (trigger.kind === 'boarding') {
      const f = flights.find((x) => x.minutesToBoarding <= 5 && x.minutesToBoarding >= -25);
      if (f) hit = { kind: 'boarding', mode: trigger.mode, boost: trigger.boost, flightId: f.flightId, detail: `${f.label} boarding at gate ${f.gate ?? '?'}` };
    } else if (trigger.kind === 'gate-change') {
      const f = flights.find((x) => {
        const changed = ctx.gateChangedAt.get(x.flightId);
        return changed !== undefined && ctx.simMs - changed <= 30 * MINUTE;
      });
      if (f) hit = { kind: 'gate-change', mode: trigger.mode, boost: trigger.boost, flightId: f.flightId, detail: `${f.label} moved to gate ${f.gate ?? '?'}` };
    } else if (trigger.kind === 'festival' && ctx.festival) {
      hit = { kind: 'festival', mode: trigger.mode, boost: trigger.boost, flightId: null, detail: 'Festival period' };
    }
    if (hit) fired.push(hit);
  }
  return fired;
}

function placementMatches(campaign: Campaign, screen: Screen): boolean {
  const p = campaign.targeting.placement;
  if (!p.zoneIds.length && !p.screenIds.length && !p.gates.length) return true;
  return p.zoneIds.includes(screen.zoneId) || p.screenIds.includes(screen.id) || screen.nearestGates.some((g) => p.gates.includes(g.gate));
}

function regionShare(crowd: Crowd, regions: readonly string[], destinations: readonly string[]): number {
  let total = 0;
  let matching = 0;
  for (const f of crowd.flights) {
    total += f.pax;
    const region = CITY_BY_CODE.get(f.destination)?.region ?? 'other';
    if ((regions.length && regions.includes(region)) || (destinations.length && destinations.includes(f.destination))) matching += f.pax;
  }
  return total > 0 ? matching / total : 0;
}

// Hard rules: the first one that fails removes the campaign and is recorded as the reason
export function hardFilter(campaign: Campaign, fired: readonly FiredTrigger[], ctx: EligibilityContext): FilterReason | null {
  const f = campaign.targeting.hardFilters;
  if (campaign.status !== 'active' && campaign.status !== 'approved') return 'status';
  const creative = campaign.creativeIds.map((id) => ctx.creatives.get(id)).find((c) => c?.approval === 'approved');
  if (!creative) return 'approval';
  if (!campaign.brandSafety.checked) return 'brand-safety';
  const start = Date.parse(campaign.schedule.start);
  const end = Date.parse(campaign.schedule.end);
  const hour = new Date(ctx.simMs).getUTCHours();
  const { from, to } = campaign.schedule.dailyHours;
  if (ctx.simMs < start || ctx.simMs >= end || hour < from || hour >= to) return 'schedule';
  if (!placementMatches(campaign, ctx.screen)) return 'placement';
  if (f.internationalOnly && ctx.crowd.internationalShare < 0.5) return 'domestic-international';
  if (f.domesticOnly && ctx.crowd.internationalShare > 0.5) return 'domestic-international';
  if ((f.destinationRegions.length || f.destinations.length) && regionShare(ctx.crowd, f.destinationRegions, f.destinations) < 0.25) return 'destination';
  if (f.minDwellMinutes > 0 && ctx.crowd.medianDwellMinutes < f.minDwellMinutes) return 'dwell';
  if (f.minCrowd > 0 && ctx.crowd.pax < f.minCrowd) return 'min-crowd';
  const remaining = Math.min(campaign.budget.total - campaign.budget.spent, campaign.budget.dailyCap - ctx.spentToday);
  if (remaining <= 0) return 'budget';
  if (campaign.outletId && ctx.outlets.get(campaign.outletId)?.inStock === false) return 'stock';
  const required = campaign.targeting.triggers.filter((t) => t.mode === 'required');
  if (required.length && !required.every((t) => fired.some((x) => x.kind === t.kind && x.mode === 'required'))) return 'trigger-not-active';
  return null;
}

export function triggerBoost(fired: readonly FiredTrigger[]): number {
  return Math.min(3, fired.reduce((product, t) => product * t.boost, 1));
}

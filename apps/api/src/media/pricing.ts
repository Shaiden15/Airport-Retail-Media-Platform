import type { Screen } from '@dwellcast/shared';
import type { PresenceEngine } from '../presence/PresenceEngine.ts';

export const SLOTS_PER_HOUR = 240;
export const BASE_CPM = 6;
const PREMIUM_MULTIPLIER = 1.25;
const ATTENTION = 0.35;

export interface SlotPrice {
  screenId: string;
  hour: string;
  predictedPax: number;
  impressionsPerPlay: number;
  pricePerPlay: number;
  pricePerScreenHour: number;
  premium: boolean;
}

// Price follows predicted audience: CPM times expected impressions per 15-second play, uplifted on premium screens
export function priceSlot(presence: PresenceEngine, screen: Screen, hourStartMs: number): SlotPrice {
  const samples = [0, 15, 30, 45].map((m) => presence.screen(screen, hourStartMs + m * 60_000).pax);
  const predictedPax = Math.round(samples.reduce((s, v) => s + v, 0) / samples.length);
  const impressionsPerPlay = predictedPax * ATTENTION;
  const multiplier = screen.premium ? PREMIUM_MULTIPLIER : 1;
  const pricePerPlay = Math.max(0.005, Math.round((BASE_CPM * impressionsPerPlay * multiplier) / 1000 * 10_000) / 10_000);
  return {
    screenId: screen.id,
    hour: new Date(hourStartMs).toISOString().slice(0, 13),
    predictedPax,
    impressionsPerPlay: Math.round(impressionsPerPlay),
    pricePerPlay,
    pricePerScreenHour: Math.round(pricePerPlay * SLOTS_PER_HOUR * 100) / 100,
    premium: screen.premium,
  };
}

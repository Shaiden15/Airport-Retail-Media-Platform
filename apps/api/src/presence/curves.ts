import type { Flight } from '@dwellcast/shared';

// Share of a flight's passengers present in each kind of zone at a given time, from its scheduled and estimated times

const MINUTE = 60_000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const triangle = (m: number, start: number, peak: number, end: number) => (m <= start || m >= end ? 0 : m <= peak ? (m - start) / (peak - start) : (end - m) / (end - peak));

function minutesTo(iso: string, atMs: number): number {
  return (Date.parse(iso) - atMs) / MINUTE;
}

export function isGone(f: Flight): boolean {
  return f.status === 'cancelled' || f.status === 'departed' || f.status === 'gate-closed';
}

export function minutesToBoarding(f: Flight, atMs: number): number {
  return minutesTo(f.estimatedTime ?? f.scheduledTime, atMs) - 40;
}

// Dwell runs until boarding completes at gate close, 15 minutes before the estimated departure
export function minutesToGateClose(f: Flight, atMs: number): number {
  return minutesTo(f.estimatedTime ?? f.scheduledTime, atMs) - 15;
}

// Passengers reach the gate by the schedule (90 to 40 min before) but leave by the estimate, so delays hold them at the gate
export function gatePresence(f: Flight, atMs: number): number {
  if (f.direction !== 'departure' || isGone(f)) return 0;
  const toStd = minutesTo(f.scheduledTime, atMs);
  const toEtd = minutesTo(f.estimatedTime ?? f.scheduledTime, atMs);
  const arrived = clamp01((90 - toStd) / 50);
  const remaining = toEtd >= 40 ? 1 : toEtd <= 15 ? 0 : (toEtd - 15) / 25;
  return 0.92 * Math.min(arrived, remaining);
}

// Between security and the gate passengers browse the plazas; delayed passengers drift back to the shops
export function retailPresence(f: Flight, atMs: number): number {
  if (f.direction !== 'departure' || isGone(f)) return 0;
  const toStd = minutesTo(f.scheduledTime, atMs);
  const toEtd = minutesTo(f.estimatedTime ?? f.scheduledTime, atMs);
  const browsing = 0.55 * triangle(toStd, 40, 95, 145);
  const spill = f.delayMinutes >= 20 && toStd < 45 && toEtd > 40 ? 0.3 : 0;
  return browsing + spill;
}

export function landsidePresence(f: Flight, atMs: number): number {
  if (f.status === 'cancelled') return 0;
  if (f.direction === 'departure') return 0.5 * triangle(minutesTo(f.scheduledTime, atMs), 110, 150, 190);
  const inBlock = f.cdm.aibt ?? f.actualTime ?? f.estimatedTime ?? f.scheduledTime;
  const since = -minutesTo(inBlock, atMs);
  return since < 10 || since > 45 ? 0 : 0.6;
}

export function securityPresence(f: Flight, atMs: number): number {
  if (f.direction !== 'departure' || isGone(f)) return 0;
  return 0.25 * triangle(minutesTo(f.scheduledTime, atMs), 95, 125, 160);
}

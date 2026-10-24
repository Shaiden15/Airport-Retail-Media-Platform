// Airport time is UTC in this simulation, so formatting always uses the UTC fields

export function hhmm(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  return new Date(iso).toISOString().slice(11, 16);
}

export function hhmmss(iso: string | null | undefined): string {
  if (!iso) return '--:--:--';
  return new Date(iso).toISOString().slice(11, 19);
}

export function money(value: number, currency = 'USD', compact = false): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: compact || value >= 1000 ? 0 : 2, notation: compact ? 'compact' : 'standard' }).format(value);
}

export function count(value: number, compact = false): string {
  return new Intl.NumberFormat('en-US', { notation: compact ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

export function pct(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

// Countdown in simulated time, so it runs faster when the simulation does
export function countdown(untilIso: string, nowIso: string | null | undefined): string {
  if (!nowIso) return '--:--';
  const ms = Date.parse(untilIso) - Date.parse(nowIso);
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

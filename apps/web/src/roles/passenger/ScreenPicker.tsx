import { useTranslation } from 'react-i18next';
import type { ScreenWithPlaying } from '../../api/types.ts';
import { useApi } from '../../app/useApi.ts';

// Pick a physical screen by zone; the option label shows its nearest gate and what it is playing
export function ScreenPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const { data } = useApi<ScreenWithPlaying[]>('/api/screens');
  const zones = new Map<string, ScreenWithPlaying[]>();
  for (const s of data ?? []) zones.set(s.zoneId, [...(zones.get(s.zoneId) ?? []), s]);

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted">{t('passenger.picker.screen')}</span>
      <select className="max-w-md rounded-md border border-muted/30 bg-surface px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} aria-label={t('passenger.picker.title')} data-testid="screen-picker">
        {[...zones.entries()].map(([zoneId, screens]) => (
          <optgroup key={zoneId} label={screens.at(0)?.name.replace(/ #\d+$/, '') ?? zoneId}>
            {screens.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id} · {s.orientation} · gate {s.nearestGates.at(0)?.gate ?? '-'} · {s.nowPlaying?.name ?? 'airport info'}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { Badge, Button } from '../../components/ui.tsx';

export interface MapData {
  plan: { width: number; height: number };
  terminals: { id: string; name: string; bounds: { x: number; y: number; w: number; h: number } }[];
  zones: { id: string; name: string; kind: string; centroidX: number; centroidY: number; radius: number; pax: number }[];
  gates: { id: string; x: number; y: number }[];
  screens: { id: string; name: string; x: number; y: number; status: 'online' | 'degraded' | 'offline'; latencyMs: number; playing: string | null }[];
}

const STATUS_COLOR: Readonly<Record<string, string>> = { online: '#22c55e', degraded: '#f59e0b', offline: '#ef4444' };

// Stylised T1/T2 floor plan: zone heat from passenger presence, one dot per screen coloured by status
export function NetworkMap({ data, onChanged }: { data: MapData; onChanged: () => void }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [heat, setHeat] = useState(true);
  const maxPax = Math.max(1, ...data.zones.map((z) => z.pax));
  const screen = data.screens.find((s) => s.id === selected);
  const statusColor = (s: string) => new Map(Object.entries(STATUS_COLOR)).get(s) ?? '#94a3b8';

  const setStatus = async (status: 'offline' | 'online') => {
    if (!screen) return;
    await api.post('/api/sim/inject', { type: status === 'offline' ? 'screen-offline' : 'screen-online', screenId: screen.id });
    onChanged();
  };

  return (
    <div className="relative" data-testid="network-map">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted">
        {(['online', 'degraded', 'offline'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(s) }} />
            {t(`admin.map.${s}`)}: {data.screens.filter((x) => x.status === s).length}
          </span>
        ))}
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} />
          {t('admin.map.heat')}
        </label>
      </div>
      <svg viewBox={`0 0 ${data.plan.width} ${data.plan.height}`} className="h-auto w-full rounded-lg bg-[#0a1222]" role="img" aria-label={t('admin.map.title')}>
        <defs>
          <radialGradient id="heat">
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>
        {data.terminals.map((term) => (
          <g key={term.id}>
            <rect x={term.bounds.x} y={term.bounds.y} width={term.bounds.w} height={term.bounds.h} rx={24} fill="#111c33" stroke="#24324f" strokeWidth={2} />
            <text x={term.bounds.x + 18} y={term.bounds.y + 34} fill="#7c8db5" fontSize={22} fontWeight={700}>
              {term.name}
            </text>
          </g>
        ))}
        {heat &&
          data.zones.map((z) => (
            <circle key={`h-${z.id}`} cx={z.centroidX} cy={z.centroidY} r={z.radius * (0.8 + (z.pax / maxPax) * 1.4)} fill="url(#heat)" opacity={0.15 + (z.pax / maxPax) * 0.85}>
              <title>{`${z.name}: ${z.pax} pax`}</title>
            </circle>
          ))}
        {data.gates.map((g) => (
          <g key={g.id}>
            <rect x={g.x - 9} y={g.y - 7} width={18} height={14} rx={3} fill="#1e2b47" />
            <text x={g.x} y={g.y + 4} textAnchor="middle" fill="#8aa0c8" fontSize={9}>
              {g.id}
            </text>
          </g>
        ))}
        {data.screens.map((s) => (
          <circle
            key={s.id}
            cx={s.x}
            cy={s.y}
            r={selected === s.id ? 9 : 6}
            fill={statusColor(s.status)}
            stroke={selected === s.id ? '#fff' : '#0a1222'}
            strokeWidth={2}
            className="cursor-pointer"
            onClick={() => setSelected(s.id)}
            data-testid={`map-screen-${s.id}`}
          >
            <title>{`${s.id} ${s.name} (${s.status})`}</title>
          </circle>
        ))}
      </svg>
      {screen && (
        <aside className="absolute right-3 top-12 w-72 rounded-xl border border-muted/30 bg-surface p-4 shadow-2xl" data-testid="screen-panel">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold">{screen.id}</div>
              <div className="text-xs text-muted">{screen.name}</div>
            </div>
            <button type="button" className="text-sm text-muted" onClick={() => setSelected(null)} aria-label={t('admin.map.close')}>
              x
            </button>
          </div>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t('admin.map.status')}</dt>
              <dd>
                <Badge tone={screen.status === 'online' ? 'good' : screen.status === 'degraded' ? 'warn' : 'bad'}>{t(`admin.map.${screen.status}`)}</Badge>
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">{t('admin.map.latency')}</dt>
              <dd className="tabular-nums">{screen.status === 'offline' ? '-' : `${screen.latencyMs} ms`}</dd>
            </div>
            <div>
              <dt className="text-muted">{t('admin.map.playing')}</dt>
              <dd className="font-medium">{screen.playing ?? t('admin.map.house')}</dd>
            </div>
          </dl>
          <div className="mt-3 flex gap-2">
            {screen.status === 'offline' ? <Button onClick={() => void setStatus('online')}>{t('admin.map.bringOnline')}</Button> : <Button variant="danger" onClick={() => void setStatus('offline')}>{t('admin.map.takeOffline')}</Button>}
            <a href={`/screen/${screen.id}`} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10">
              {t('admin.map.view')}
            </a>
          </div>
        </aside>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.ts';
import type { FlightSummary, InjectionResult, ScreenWithPlaying } from '../api/types.ts';
import { hhmm, hhmmss } from '../lib/format.ts';
import { useLive } from '../live/LiveProvider.tsx';
import { useApi } from './useApi.ts';

type InjectType = 'delay' | 'gate-change' | 'screen-offline' | 'screen-online' | 'hallucination';
const SPEEDS = [1, 10, 60] as const;

function Button({ active, onClick, children, label }: { active?: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-primary text-bg' : 'bg-bg/60 text-fg hover:bg-primary/20'}`}
    >
      {children}
    </button>
  );
}

function InjectPanel({ onDone, defaultScreen }: { onDone: (msg: string) => void; defaultScreen?: string }) {
  const { t } = useTranslation();
  const { clock } = useLive();
  const [type, setType] = useState<InjectType>('delay');
  const flights = useApi<FlightSummary[]>('/api/flights?direction=departure');
  const screens = useApi<ScreenWithPlaying[]>('/api/screens');
  const gates = useApi<{ id: string; terminalId: string }[]>('/api/gates');
  const now = clock ? Date.parse(clock.simTime) : 0;
  const upcoming = (flights.data ?? []).filter((f) => f.status !== 'departed' && f.status !== 'cancelled' && Date.parse(f.estimatedTime ?? f.scheduledTime) > now);
  const [flightId, setFlightId] = useState('');
  const [minutes, setMinutes] = useState(75);
  const [gate, setGate] = useState('');
  const [screenId, setScreenId] = useState(defaultScreen ?? '');
  const [error, setError] = useState<string | null>(null);
  const chosenFlight = flightId || upcoming.find((f) => f.flight === 'XH501')?.id || upcoming.at(0)?.id || '';
  const chosenScreen = screenId || defaultScreen || screens.data?.at(0)?.id || '';

  const send = async () => {
    setError(null);
    const body =
      type === 'delay' ? { type, flightId: chosenFlight, minutes } : type === 'gate-change' ? { type, flightId: chosenFlight, gate } : { type, screenId: chosenScreen };
    try {
      const r = await api.post<InjectionResult>('/api/sim/inject', body);
      onDone(t('sim.inject.result', { type: r.type, ms: r.latencyMs, count: r.affectedScreens.length }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const field = 'w-full rounded-md border border-muted/30 bg-surface px-2 py-1.5 text-sm';
  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-96 rounded-xl border border-muted/20 bg-surface p-4 shadow-2xl" role="dialog" aria-label={t('sim.control.inject')}>
      <div className="mb-3 grid grid-cols-1 gap-1">
        {(['delay', 'gate-change', 'screen-offline', 'screen-online', 'hallucination'] as const).map((k) => (
          <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm ${type === k ? 'bg-primary/15 font-medium' : ''}`}>
            <input type="radio" name="inject-type" checked={type === k} onChange={() => setType(k)} />
            {t(k === 'delay' ? 'sim.inject.delay' : k === 'gate-change' ? 'sim.inject.gateChange' : k === 'screen-offline' ? 'sim.inject.screenOffline' : k === 'screen-online' ? 'sim.inject.screenOnline' : 'sim.inject.hallucination')}
          </label>
        ))}
      </div>
      <div className="space-y-2">
        {(type === 'delay' || type === 'gate-change') && (
          <label className="block text-xs text-muted">
            {t('sim.inject.flight')}
            <select className={field} value={chosenFlight} onChange={(e) => setFlightId(e.target.value)} aria-label={t('sim.inject.flight')}>
              {upcoming.slice(0, 150).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.flight} {hhmm(f.estimatedTime ?? f.scheduledTime)} {f.destination} gate {f.gate ?? '-'}
                </option>
              ))}
            </select>
          </label>
        )}
        {type === 'delay' && (
          <label className="block text-xs text-muted">
            {t('sim.inject.minutes')}
            <input className={field} type="number" min={0} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label={t('sim.inject.minutes')} />
          </label>
        )}
        {type === 'gate-change' && (
          <label className="block text-xs text-muted">
            {t('sim.inject.gate')}
            <select className={field} value={gate} onChange={(e) => setGate(e.target.value)} aria-label={t('sim.inject.gate')}>
              <option value="">-</option>
              {(gates.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.terminalId} {g.id}
                </option>
              ))}
            </select>
          </label>
        )}
        {(type === 'screen-offline' || type === 'screen-online' || type === 'hallucination') && (
          <label className="block text-xs text-muted">
            {t('sim.inject.screen')}
            <select className={field} value={chosenScreen} onChange={(e) => setScreenId(e.target.value)} aria-label={t('sim.inject.screen')}>
              {(screens.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="button" onClick={() => void send()} className="w-full rounded-md bg-accent px-3 py-2 text-sm font-semibold text-black">
          {t('sim.inject.apply')}
        </button>
      </div>
    </div>
  );
}

// Visible to every role: one shared simulation clock with demo controls
export function SimControlBar({ defaultScreen }: { defaultScreen?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clock } = useLive();
  const [jump, setJump] = useState('14:10');
  const [panel, setPanel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const control = (body: unknown) => void api.post('/api/sim/control', body);
  const showToast = (msg: string) => {
    setToast(msg);
    setPanel(false);
    window.setTimeout(() => setToast(null), 6000);
  };
  const workedExample = async () => {
    const r = await api.post<{ screenId: string }>('/api/sim/scenario/worked-example');
    navigate(`/demo?screen=${encodeURIComponent(r.screenId)}&right=retailer&company=adv-aurelle`);
  };

  return (
    <div className="relative flex flex-wrap items-center gap-3 border-b border-muted/20 bg-surface/80 px-6 py-2 backdrop-blur" data-testid="sim-bar">
      <div className="flex items-center gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums" data-testid="sim-clock">
          {hhmmss(clock?.simTime)}
        </span>
        <span className="text-xs text-muted">UTC</span>
        {clock?.festival && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">{t('sim.control.festival')}</span>}
      </div>
      <Button onClick={() => control({ action: clock?.running ? 'pause' : 'play' })} label={clock?.running ? t('sim.control.pause') : t('sim.control.play')}>
        {clock?.running ? t('sim.control.pause') : t('sim.control.play')}
      </Button>
      <div className="flex items-center gap-1" role="group" aria-label={t('sim.control.speed')}>
        {SPEEDS.map((s) => (
          <Button key={s} active={clock?.speed === s} onClick={() => control({ action: 'speed', speed: s })}>
            {s}x
          </Button>
        ))}
      </div>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          control({ action: 'jump', time: jump });
        }}
      >
        <label className="text-xs text-muted" htmlFor="jump-time">
          {t('sim.control.jumpTo')}
        </label>
        <input id="jump-time" type="time" value={jump} onChange={(e) => setJump(e.target.value)} className="rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm" />
        <Button onClick={() => control({ action: 'jump', time: jump })}>{t('sim.control.go')}</Button>
      </form>
      <div className="ml-auto flex items-center gap-2">
        <Button onClick={() => void api.post('/api/sim/reset')}>{t('sim.control.reset')}</Button>
        <Button onClick={() => void workedExample()}>{t('sim.control.workedExample')}</Button>
        <div className="relative">
          <button type="button" onClick={() => setPanel((p) => !p)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-black" aria-expanded={panel}>
            {t('sim.control.inject')}
          </button>
          {panel && <InjectPanel onDone={showToast} defaultScreen={defaultScreen} />}
        </div>
      </div>
      {toast && (
        <div role="status" className="absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-bg shadow-lg" data-testid="inject-toast">
          {toast}
        </div>
      )}
    </div>
  );
}

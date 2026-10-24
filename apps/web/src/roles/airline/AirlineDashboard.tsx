import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../app/useApi.ts';
import type { FlightSummary } from '../../api/types.ts';
import { ShareBars } from '../../components/charts.tsx';
import { Badge, Card, Kpi, table } from '../../components/ui.tsx';
import { count, hhmm, pct } from '../../lib/format.ts';
import { useLive, useLiveEvent } from '../../live/LiveProvider.tsx';

interface Overview {
  flights: FlightSummary[];
  profile: { pax: number; flights: number; internationalShare: number; segments: Record<string, number>; topDestinations: { code: string; share: number }[]; topNationalities: { code: string; share: number }[] };
}

const STATUS_TONE: Readonly<Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'>> = { boarding: 'good', 'final-call': 'warn', delayed: 'bad', cancelled: 'bad', departed: 'neutral', 'gate-closed': 'neutral', 'on-block': 'info', landed: 'info' };

// One row per departure across the day; the bar runs from boarding to departure and shows any delay
function Timeline({ flights, now }: { flights: FlightSummary[]; now: number }) {
  const { t } = useTranslation();
  const day = flights.at(0) ? Date.parse(`${flights[0]?.scheduledTime.slice(0, 10) ?? ''}T00:00:00Z`) : 0;
  const x = (ms: number) => ((ms - day) / 86_400_000) * 1000;
  const rows = flights.filter((f) => f.direction === 'departure');
  const height = rows.length * 18 + 24;
  return (
    <svg viewBox={`0 0 1060 ${height}`} className="h-auto w-full" role="img" aria-label={t('airline.view.timeline')}>
      {Array.from({ length: 13 }, (_, i) => (
        <g key={i}>
          <line x1={60 + i * (1000 / 12)} x2={60 + i * (1000 / 12)} y1={0} y2={height - 16} className="stroke-[var(--dc-muted)]" strokeOpacity={0.2} />
          <text x={60 + i * (1000 / 12)} y={height - 4} textAnchor="middle" className="fill-[var(--dc-muted)] text-[10px]">
            {String(i * 2).padStart(2, '0')}:00
          </text>
        </g>
      ))}
      <line x1={60 + x(now)} x2={60 + x(now)} y1={0} y2={height - 16} stroke="#ef4444" strokeWidth={2} />
      {rows.map((f, i) => {
        const std = Date.parse(f.scheduledTime);
        const etd = Date.parse(f.estimatedTime ?? f.scheduledTime);
        const y = i * 18 + 4;
        return (
          <g key={f.id}>
            <text x={0} y={y + 10} className="fill-[var(--dc-fg)] text-[10px] font-semibold">
              {f.flight}
            </text>
            <rect x={60 + x(std - 40 * 60_000)} y={y} width={Math.max(2, x(std) - x(std - 40 * 60_000))} height={12} rx={3} className="fill-[var(--dc-primary)]" opacity={0.75}>
              <title>{`${f.flight} ${f.destination} gate ${f.gate ?? '-'} ${hhmm(f.scheduledTime)}`}</title>
            </rect>
            {etd > std && <rect x={60 + x(std)} y={y} width={x(etd) - x(std)} height={12} rx={3} fill="#ef4444" opacity={0.8} />}
          </g>
        );
      })}
    </svg>
  );
}

export function AirlineDashboard({ airlineCode }: { airlineCode: string }) {
  const { t } = useTranslation();
  const { clock } = useLive();
  const { data, reload } = useApi<Overview>(`/api/airline/${encodeURIComponent(airlineCode)}/overview`);
  const [view, setView] = useState<'departures' | 'arrivals'>('departures');
  useLiveEvent('flight', (batch) => {
    if (batch.some((f) => f.airlineCode === airlineCode)) reload();
  });
  useEffect(() => {
    const timer = window.setInterval(reload, 15_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const flights = data?.flights ?? [];
  const departures = flights.filter((f) => f.direction === 'departure');
  const delayed = departures.filter((f) => f.delayMinutes >= 15 && f.status !== 'departed');
  const lf = departures.length ? departures.reduce((s, f) => s + f.loadFactor, 0) / departures.length : 0;
  const now = clock ? Date.parse(clock.simTime) : 0;
  const p = data?.profile;
  const segLabel = (k: string) => t(`segment.label.${k}`, { defaultValue: k });
  const list = flights.filter((f) => (view === 'departures' ? f.direction === 'departure' : f.direction === 'arrival'));

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('airline.kpi.departures')} value={departures.length} />
        <Kpi label={t('airline.kpi.delayed')} value={delayed.length} tone={delayed.length ? 'warn' : 'good'} testId="airline-delayed" />
        <Kpi label={t('airline.kpi.loadFactor')} value={pct(lf)} />
        <Kpi label={t('airline.kpi.pax')} value={count(p?.pax ?? 0)} sub={t('airline.kpi.intl', { pct: pct(p?.internationalShare ?? 0) })} />
      </div>
      <Card title={t('airline.view.timeline')}>
        <Timeline flights={flights} now={now} />
      </Card>
      <div className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
        <Card
          title={t('airline.view.flights')}
          actions={
            <div className="flex gap-1">
              {(['departures', 'arrivals'] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={`rounded-md px-2 py-1 text-xs font-medium ${view === v ? 'bg-primary text-bg' : 'bg-muted/10'}`}>
                  {t(`airline.view.${v}`)}
                </button>
              ))}
            </div>
          }
          testId="airline-flights"
        >
          <div className={`${table.wrap} max-h-[28rem] overflow-y-auto`}>
            <table className={table.table}>
              <thead className="sticky top-0 bg-surface">
                <tr>
                  <th className={table.th}>{t('passenger.screen.flight')}</th>
                  <th className={table.th}>{view === 'departures' ? t('passenger.screen.to') : t('airline.view.from')}</th>
                  <th className={table.th}>{t('passenger.screen.time')}</th>
                  <th className={table.th}>{t('passenger.screen.gate')}</th>
                  <th className={table.th}>{t('passenger.screen.status')}</th>
                  <th className={table.thRight}>{t('airline.view.load')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id}>
                    <td className={`${table.td} font-mono font-semibold`}>{f.flight}</td>
                    <td className={table.td}>{view === 'departures' ? f.destination : f.origin}</td>
                    <td className={`${table.td} tabular-nums`}>
                      {hhmm(f.scheduledTime)}
                      {f.delayMinutes > 0 && <span className="ml-1 text-red-500">+{f.delayMinutes}</span>}
                    </td>
                    <td className={table.td}>{f.gate ?? '-'}</td>
                    <td className={table.td}>
                      <Badge tone={new Map(Object.entries(STATUS_TONE)).get(f.status) ?? 'neutral'}>{t(`flight.status.${f.status}`)}</Badge>
                    </td>
                    <td className={table.tdRight}>{pct(f.loadFactor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={t('airline.view.profile')} testId="airline-profile">
          {p && (
            <div className="space-y-4">
              <ShareBars labels={segLabel} shares={['business', 'holiday', 'vfr', 'student', 'religious'].map((k) => ({ key: k, value: new Map(Object.entries(p.segments)).get(k) ?? 0 }))} />
              <ShareBars labels={segLabel} shares={['solo', 'couple', 'family', 'group'].map((k) => ({ key: k, value: new Map(Object.entries(p.segments)).get(k) ?? 0 }))} />
              <div className="flex flex-wrap gap-1">
                {p.topDestinations.map((d) => (
                  <Badge key={d.code} tone="info">
                    {d.code} {pct(d.share)}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted">{t('passenger.why.notice')}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

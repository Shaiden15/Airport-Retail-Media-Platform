import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../app/useApi.ts';
import { BarChart } from '../../components/charts.tsx';
import { Badge, Card, Kpi, table } from '../../components/ui.tsx';
import { money } from '../../lib/format.ts';

interface AdvertiserRow {
  id: string;
  name: string;
  kind: string;
  spendToday: number;
  spend30d: number;
  redemptionsToday: number;
  running: number;
  total: number;
  underDelivering: { campaignId: string; name: string; spendToday: number; expectedByNow: number; pace: number }[];
}

// Advertiser overview: who spends most, what is running, and which campaigns are behind their delivery pace
export function MediaDashboard() {
  const { t } = useTranslation();
  const advertisers = useApi<AdvertiserRow[]>('/api/media/advertisers');
  const approvals = useApi<{ pending: unknown[] }>('/api/media/approvals');
  const yieldData = useApi<{ totalForecast: number; days: { occupancyPct: number }[] }>('/api/media/yield');
  const reload = advertisers.reload;

  useEffect(() => {
    const timer = window.setInterval(reload, 5000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const rows = advertisers.data ?? [];
  const under = rows.flatMap((a) => a.underDelivering.map((u) => ({ ...u, advertiser: a.name })));
  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('media.kpi.pending')} value={approvals.data?.pending.length ?? 0} tone={(approvals.data?.pending.length ?? 0) > 0 ? 'warn' : 'good'} />
        <Kpi label={t('media.kpi.running')} value={rows.reduce((s, a) => s + a.running, 0)} />
        <Kpi label={t('media.kpi.under')} value={under.length} tone={under.length ? 'bad' : 'good'} testId="under-count" />
        <Kpi label={t('media.kpi.forecast')} value={money(yieldData.data?.totalForecast ?? 0, 'USD', true)} sub={t('media.kpi.occupancy', { pct: yieldData.data?.days.at(0)?.occupancyPct ?? 0 })} />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
        <Card title={t('media.advertisers.title')} testId="advertiser-overview">
          <BarChart label={t('media.advertisers.title')} data={rows.slice(0, 12).map((a) => ({ label: a.name.split(' ')[0] ?? a.name, value: Math.round(a.spend30d) }))} format={(v) => money(v)} />
          <div className={`${table.wrap} mt-4`}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>{t('media.advertisers.name')}</th>
                  <th className={table.thRight}>{t('media.advertisers.spend30')}</th>
                  <th className={table.thRight}>{t('media.advertisers.spendToday')}</th>
                  <th className={table.thRight}>{t('media.advertisers.running')}</th>
                  <th className={table.th}>{t('media.advertisers.delivery')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className={table.td}>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted">{a.kind}</div>
                    </td>
                    <td className={table.tdRight}>{money(a.spend30d)}</td>
                    <td className={table.tdRight}>{money(a.spendToday)}</td>
                    <td className={table.tdRight}>
                      {a.running} / {a.total}
                    </td>
                    <td className={table.td}>{a.underDelivering.length ? <Badge tone="bad">{t('media.advertisers.behind', { count: a.underDelivering.length })}</Badge> : a.running ? <Badge tone="good">{t('media.advertisers.onPace')}</Badge> : <Badge>{t('media.advertisers.idle')}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title={t('media.under.title')} testId="under-delivering">
          {under.length === 0 ? (
            <p className="text-sm text-muted">{t('media.under.none')}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {under.map((u) => (
                <li key={u.campaignId} className="rounded-lg bg-red-500/5 p-2">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted">
                    {u.advertiser} · {t('media.under.pace', { spent: money(u.spendToday), expected: money(u.expectedByNow), pct: Math.round(u.pace * 100) })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

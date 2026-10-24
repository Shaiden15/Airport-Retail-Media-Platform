import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { BarChart } from '../../components/charts.tsx';
import { Badge, Card, Kpi, table } from '../../components/ui.tsx';
import { count, hhmmss, money } from '../../lib/format.ts';
import { useLive, useLiveEvent } from '../../live/LiveProvider.tsx';
import { theme } from '../../theme/applyTheme.ts';
import { NetworkMap, type MapData } from './NetworkMap.tsx';

interface Feeds {
  adapters: { flight: string; zones: string; ai: string };
  feeds: { name: string; adapter: string; received: number; delivered: number; lastMessageAt: string | null; status: string }[];
  ratePerMinute: { aidx: number; acris: number };
}

interface Performance {
  apiP50Ms: number;
  apiP95Ms: number;
  playlistBuildAvgMs: number;
  playlistBuildP95Ms: number;
  uptime7d: { date: string; uptimePct: number }[];
}

export function AdminDashboard() {
  const { t } = useTranslation();
  const { kpis, feed } = useLive();
  const [map, setMap] = useState<MapData | null>(null);
  const perf = useApi<Performance>('/api/admin/performance');
  const incidents = useApi<{ counts: Record<string, number> }>('/api/admin/incidents?status=active&limit=1');

  const reloadPerf = perf.reload;
  const reloadIncidents = incidents.reload;

  const loadMap = useCallback(() => {
    void api.get<MapData>('/api/admin/map').then(setMap).catch(() => undefined);
  }, []);

  useEffect(() => {
    const first = window.setTimeout(loadMap, 0);
    const timer = window.setInterval(() => {
      loadMap();
      reloadPerf();
    }, 3000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [loadMap, reloadPerf]);

  useLiveEvent('screen', loadMap);
  useLiveEvent('incident', reloadIncidents);

  const feeds = feed as Feeds | null;
  const counts = incidents.data?.counts ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const currency = kpis?.currency ?? theme.currency;

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="admin-kpis">
        <Kpi label={t('admin.kpi.online')} value={`${kpis?.screensOnlinePct ?? 0}%`} sub={`${kpis?.screensOnline ?? 0} / ${kpis?.screensTotal ?? 0}`} tone={(kpis?.screensOnlinePct ?? 100) < 95 ? 'warn' : 'good'} testId="kpi-online" />
        <Kpi label={t('admin.kpi.plays')} value={count(kpis?.playsToday ?? 0, true)} testId="kpi-plays" />
        <Kpi label={t('admin.kpi.impressions')} value={count(kpis?.impressionsToday ?? 0, true)} />
        <Kpi label={t('admin.kpi.revenue')} value={money(kpis?.revenueToday ?? 0, currency)} testId="kpi-revenue" />
        <Kpi label={t('admin.kpi.campaigns')} value={kpis?.activeCampaigns ?? 0} />
        <Kpi label={t('admin.kpi.latency')} value={`${kpis?.avgScreenLatencyMs ?? 0} ms`} sub={t('admin.kpi.decision', { ms: kpis?.avgDecisionMs ?? 0 })} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[3fr_1fr]">
        <Card title={t('admin.map.title')}>{map ? <NetworkMap data={map} onChanged={loadMap} /> : <div className="h-96" />}</Card>
        <div className="space-y-6">
          <Card title={t('admin.incidents.open')}>
            <div className="grid grid-cols-2 gap-2 text-center">
              {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
                <div key={s} className="rounded-lg bg-muted/10 p-2">
                  <div className={`text-2xl font-bold tabular-nums ${s === 'critical' || s === 'high' ? 'text-red-500' : ''}`}>{new Map(Object.entries(counts)).get(s) ?? 0}</div>
                  <div className="text-xs capitalize text-muted">{t(`admin.severity.${s}`)}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title={t('admin.feeds.title')} testId="feed-health">
            <table className={table.table}>
              <tbody>
                {(feeds?.feeds ?? []).map((f) => (
                  <tr key={f.name}>
                    <td className={table.td}>
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-muted">{f.adapter}</div>
                    </td>
                    <td className={table.tdRight}>
                      <Badge tone={f.status === 'ok' ? 'good' : f.status === 'lagging' ? 'warn' : 'bad'}>{f.status}</Badge>
                      <div className="mt-1 text-xs text-muted">{hhmmss(f.lastMessageAt)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">{t('admin.feeds.rate', { aidx: feeds?.ratePerMinute.aidx ?? 0, acris: feeds?.ratePerMinute.acris ?? 0 })}</p>
          </Card>
          <Card title={t('admin.perf.title')}>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs text-muted">{t('admin.perf.p95')}</div>
                <div className="font-semibold tabular-nums">{perf.data?.apiP95Ms ?? 0} ms</div>
              </div>
              <div>
                <div className="text-xs text-muted">{t('admin.perf.playlist')}</div>
                <div className="font-semibold tabular-nums">{perf.data?.playlistBuildAvgMs ?? 0} ms</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-muted">{t('admin.perf.uptime')}</div>
            <BarChart label={t('admin.perf.uptime')} height={70} data={(perf.data?.uptime7d ?? []).map((d, i, all) => ({ label: d.date.slice(5), value: d.uptimePct - 98, highlight: i === all.length - 1 }))} format={(v) => `${(v + 98).toFixed(2)}%`} />
          </Card>
        </div>
      </div>
    </div>
  );
}

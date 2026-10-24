import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { AreaChart } from '../../components/charts.tsx';
import { Badge, Card, Check } from '../../components/ui.tsx';
import { count, hhmm, pct } from '../../lib/format.ts';
import { RetailerLiveDashboard } from './RetailerPage.tsx';

interface Flow {
  uniquePax: number;
  internationalShare: number;
  topDestinations: { code: string; share: number }[];
  topNationalities: { code: string; share: number }[];
  series: { at: string; pax: number }[];
}

interface OutletFlow {
  outletId: string;
  outletName: string;
  zoneId: string;
  next60: Flow | null;
  next120: Flow | null;
}

function FlowCard({ flow, inStock, onStock }: { flow: OutletFlow; inStock: boolean; onStock: (v: boolean) => void }) {
  const { t } = useTranslation();
  const n = flow.next60;
  return (
    <Card title={flow.outletName} actions={<Check checked={inStock} onChange={onStock} label={t('retailer.flow.inStock')} />} testId="flow-card">
      {n && (
        <p className="mb-3 text-sm" data-testid="flow-summary">
          {t('retailer.flow.summary', { pax: count(n.uniquePax), intl: pct(n.internationalShare), top: n.topDestinations.map((d) => d.code).join(', ') || '-' })}
        </p>
      )}
      {flow.next120 && <AreaChart label={t('retailer.flow.chart')} points={flow.next120.series.map((p) => ({ label: hhmm(p.at), value: p.pax }))} format={(v) => `${v} pax`} />}
      <div className="mt-2 flex flex-wrap gap-1">
        {(n?.topNationalities ?? []).map((x) => (
          <Badge key={x.code} tone="info">
            {x.code} {pct(x.share)}
          </Badge>
        ))}
        {!inStock && <Badge tone="warn">{t('retailer.flow.paused')}</Badge>}
      </div>
    </Card>
  );
}

export function RetailerDashboard({ advertiserId }: { advertiserId: string }) {
  const { t } = useTranslation();
  const flows = useApi<OutletFlow[]>(`/api/retailer/${encodeURIComponent(advertiserId)}/flow`);
  const outlets = useApi<{ id: string; advertiserId: string; inStock: boolean }[]>('/api/outlets');
  const reloadFlows = flows.reload;

  useEffect(() => {
    const timer = window.setInterval(reloadFlows, 10_000);
    return () => window.clearInterval(timer);
  }, [reloadFlows]);

  const stock = new Map((outlets.data ?? []).map((o) => [o.id, o.inStock]));
  const setStock = async (outletId: string, inStock: boolean) => {
    await api.post(`/api/outlets/${outletId}/stock`, { inStock });
    outlets.reload();
  };

  return (
    <div className="space-y-6 p-6">
      <RetailerLiveDashboard advertiserId={advertiserId} />
      <div>
        <h2 className="mb-3 text-lg font-semibold">{t('retailer.flow.title')}</h2>
        <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
          {(flows.data ?? []).map((f) => (
            <FlowCard key={f.outletId} flow={f} inStock={stock.get(f.outletId) ?? true} onStock={(v) => void setStock(f.outletId, v)} />
          ))}
        </div>
      </div>
    </div>
  );
}

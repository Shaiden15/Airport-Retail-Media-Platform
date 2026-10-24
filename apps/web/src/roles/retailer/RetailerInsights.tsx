import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Kpi, Select, table } from '../../components/ui.tsx';
import { count, hhmm, money } from '../../lib/format.ts';

interface HistoryRow {
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  plays: number;
  impressions: number;
  redemptions: number;
  spend: number;
  revenue: number;
  roi: number | null;
}

interface Codes {
  summary: { issued: number; active: number; family: number };
  codes: { code: string; campaignName: string; issuedAt: string; expiresAt: string; expired: boolean; familyOf: string | null; basketValue: number; linkedFlightId: string | null }[];
}

interface Segments {
  campaignName: string;
  headline: string;
  segments: { segment: string; weight: number; redemptions: number; index: number; suggestedWeight: number }[];
}

// Campaign history with ROI and run again, today's promo codes, and performance by segment
export function RetailerInsights({ advertiserId }: { advertiserId: string }) {
  const { t } = useTranslation();
  const history = useApi<HistoryRow[]>(`/api/retailer/${encodeURIComponent(advertiserId)}/history`);
  const codes = useApi<Codes>(`/api/retailer/${encodeURIComponent(advertiserId)}/codes`);
  const rows = history.data ?? [];
  const [selected, setSelected] = useState('');
  const campaignId = selected || rows.at(0)?.id || '';
  const segments = useApi<Segments>(campaignId ? `/api/campaigns/${encodeURIComponent(campaignId)}/segments` : null);
  const [notice, setNotice] = useState<string | null>(null);
  const segLabel = (k: string) => t(`segment.label.${k}`, { defaultValue: k });
  const totals = rows.reduce((s, r) => ({ spend: s.spend + r.spend, revenue: s.revenue + r.revenue, redemptions: s.redemptions + r.redemptions }), { spend: 0, revenue: 0, redemptions: 0 });

  const runAgain = async (id: string) => {
    const copy = await api.post<{ name: string }>(`/api/campaigns/${id}/duplicate`);
    setNotice(t('retailer.campaigns.submitted', { name: copy.name }));
    history.reload();
  };

  return (
    <div className="space-y-6 p-6">
      {notice && (
        <div className="rounded-lg bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700" role="status">
          {notice}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('retailer.insights.spend')} value={money(totals.spend, 'USD', true)} />
        <Kpi label={t('retailer.insights.revenue')} value={money(totals.revenue, 'USD', true)} />
        <Kpi label={t('retailer.insights.roi')} value={totals.spend > 0 ? `${((totals.revenue - totals.spend) / totals.spend).toFixed(1)}x` : '-'} tone="good" />
        <Kpi label={t('retailer.insights.redemptions')} value={count(totals.redemptions)} />
      </div>

      <Card title={t('retailer.insights.history')} testId="campaign-history">
        <div className={table.wrap}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>{t('retailer.campaigns.campaign')}</th>
                <th className={table.thRight}>{t('retailer.insights.spend')}</th>
                <th className={table.thRight}>{t('retailer.live.impressions')}</th>
                <th className={table.thRight}>{t('retailer.insights.redemptions')}</th>
                <th className={table.thRight}>{t('retailer.insights.revenue')}</th>
                <th className={table.thRight}>{t('retailer.insights.roi')}</th>
                <th className={table.th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={table.td}>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted">
                      {r.start.slice(0, 10)} to {r.end.slice(0, 10)} · <Badge tone={r.status === 'completed' ? 'info' : r.status === 'active' ? 'good' : 'neutral'}>{t(`campaign.status.${r.status}`)}</Badge>
                    </div>
                  </td>
                  <td className={table.tdRight}>{money(r.spend)}</td>
                  <td className={table.tdRight}>{count(r.impressions, true)}</td>
                  <td className={table.tdRight}>{count(r.redemptions)}</td>
                  <td className={table.tdRight}>{money(r.revenue)}</td>
                  <td className={table.tdRight}>{r.roi === null ? '-' : `${r.roi.toFixed(1)}x`}</td>
                  <td className={table.td}>
                    <Button variant="ghost" onClick={() => void runAgain(r.id)}>
                      {t('retailer.campaigns.runAgain')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Card title={t('retailer.insights.segments')} actions={<div className="w-64"><Select value={campaignId} onChange={setSelected} label={t('retailer.campaigns.campaign')} options={rows.map((r) => ({ value: r.id, label: r.name }))} /></div>} testId="segment-performance">
          {segments.data && (
            <>
              <p className="mb-3 text-sm font-medium">{segments.data.headline}</p>
              <table className={table.table}>
                <thead>
                  <tr>
                    <th className={table.th}>{t('retailer.insights.segment')}</th>
                    <th className={table.th}>{t('retailer.insights.index')}</th>
                    <th className={table.thRight}>{t('retailer.insights.weight')}</th>
                    <th className={table.thRight}>{t('retailer.insights.suggested')}</th>
                  </tr>
                </thead>
                <tbody>
                  {segments.data.segments.map((s) => (
                    <tr key={s.segment}>
                      <td className={table.td}>{segLabel(s.segment)}</td>
                      <td className={table.td}>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 rounded-full bg-muted/15">
                            <div className={`h-2 rounded-full ${s.index >= 1 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, Math.round((s.index / 2) * 100))}%` }} />
                          </div>
                          <span className="tabular-nums">{s.index.toFixed(2)}x</span>
                        </div>
                      </td>
                      <td className={table.tdRight}>{s.weight.toFixed(1)}</td>
                      <td className={table.tdRight}>{s.suggestedWeight !== s.weight ? <Badge tone={s.suggestedWeight > s.weight ? 'good' : 'warn'}>{s.suggestedWeight.toFixed(1)}</Badge> : s.weight.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>

        <Card title={t('retailer.insights.codes')} testId="promo-codes">
          <div className="mb-3 flex gap-4 text-sm">
            <span>
              {t('retailer.insights.issued')}: <strong>{codes.data?.summary.issued ?? 0}</strong>
            </span>
            <span>
              {t('retailer.insights.activeCodes')}: <strong>{codes.data?.summary.active ?? 0}</strong>
            </span>
            <span>
              {t('retailer.insights.familyCodes')}: <strong>{codes.data?.summary.family ?? 0}</strong>
            </span>
          </div>
          <div className={`${table.wrap} max-h-80 overflow-y-auto`}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>{t('retailer.insights.code')}</th>
                  <th className={table.th}>{t('retailer.campaigns.campaign')}</th>
                  <th className={table.th}>{t('retailer.insights.expires')}</th>
                  <th className={table.thRight}>{t('retailer.insights.basket')}</th>
                </tr>
              </thead>
              <tbody>
                {(codes.data?.codes ?? []).map((c) => (
                  <tr key={c.code}>
                    <td className={`${table.td} font-mono`}>
                      {c.code} {c.familyOf && <Badge tone="info">{t('retailer.live.family')}</Badge>}
                    </td>
                    <td className={table.td}>{c.campaignName}</td>
                    <td className={table.td}>{c.expired ? <Badge tone="neutral">{t('retailer.insights.expired')}</Badge> : hhmm(c.expiresAt)}</td>
                    <td className={table.tdRight}>{money(c.basketValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

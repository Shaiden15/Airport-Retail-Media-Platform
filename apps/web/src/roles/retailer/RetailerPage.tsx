import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import type { RetailerLive } from '../../api/types.ts';
import { useCompany } from '../../app/Shell.tsx';
import { count, hhmmss, money, pct } from '../../lib/format.ts';
import { useLiveEvent } from '../../live/LiveProvider.tsx';

function Tile({ label, value, testId, highlight }: { label: string; value: string; testId: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 transition ${highlight ? 'border-emerald-400 bg-emerald-50' : 'border-muted/20 bg-surface'}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

const SOURCE_BADGE: Readonly<Record<string, string>> = {
  'qr-phone': 'bg-emerald-100 text-emerald-800',
  'family-share': 'bg-sky-100 text-sky-800',
  simulated: 'bg-slate-100 text-slate-600',
};

// Live dashboard for the selected outlet's advertiser; ticks with plays and jumps on every redemption
export function RetailerLiveDashboard({ advertiserId }: { advertiserId: string }) {
  const { t } = useTranslation();
  const [live, setLive] = useState<RetailerLive | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(() => {
    void api.get<RetailerLive>(`/api/retailer/${encodeURIComponent(advertiserId)}/live`).then(setLive).catch(() => undefined);
  }, [advertiserId]);

  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 1500);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  useLiveEvent('redemption', (batch) => {
    const mine = batch.find((r) => r.advertiserId === advertiserId && r.source !== 'simulated');
    if (!batch.some((r) => r.advertiserId === advertiserId)) return;
    load();
    if (mine) {
      setFlash(mine.code);
      window.setTimeout(() => setFlash(null), 4000);
    }
  });

  if (!live) return null;
  const d = live.today;
  const label = (source: string) => (source === 'qr-phone' ? t('retailer.live.phone') : source === 'family-share' ? t('retailer.live.family') : t('retailer.live.simulated'));

  return (
    <div className="space-y-6" data-testid="retailer-live">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Tile label={t('retailer.live.impressions')} value={count(d.impressions)} testId="kpi-impressions" />
        <Tile label={t('retailer.live.scans')} value={count(d.scans)} testId="kpi-scans" />
        <Tile label={t('retailer.live.redemptions')} value={count(d.redemptions)} testId="kpi-redemptions" highlight={flash !== null} />
        <Tile label={t('retailer.live.conversion')} value={pct(d.conversionRate, 3)} testId="kpi-conversion" />
        <Tile label={t('retailer.live.revenue')} value={money(d.revenueAttributed)} testId="kpi-revenue" highlight={flash !== null} />
        <Tile label={t('retailer.live.spend')} value={money(d.spend)} testId="kpi-spend" />
        <Tile label={t('retailer.live.roi')} value={d.roi === null ? '-' : `${d.roi.toFixed(1)}x`} testId="kpi-roi" />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[2fr_1fr]">
        <section className="rounded-xl border border-muted/20 bg-surface p-4">
          <h2 className="mb-3 font-semibold">{t('retailer.live.campaigns')}</h2>
          <table className="w-full text-sm">
            <thead className="whitespace-nowrap text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-3">{t('retailer.live.campaign')}</th>
                <th className="px-3 py-1 text-right">{t('retailer.live.plays')}</th>
                <th className="px-3 py-1 text-right">{t('retailer.live.impressions')}</th>
                <th className="px-3 py-1 text-right">{t('retailer.live.redemptions')}</th>
                <th className="py-1 pl-3 text-right">{t('retailer.live.revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {live.campaigns.map((c) => (
                <tr key={c.id} className="border-t border-muted/10">
                  <td className="py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs capitalize text-muted">{t(`campaign.status.${c.status}`)}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{count(c.plays)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{count(c.impressions)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{count(c.redemptions)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{money(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border border-muted/20 bg-surface p-4">
          <h2 className="mb-3 font-semibold">{t('retailer.live.recent')}</h2>
          {live.recentRedemptions.length === 0 && <p className="text-sm text-muted">{t('retailer.live.none')}</p>}
          <ul className="space-y-2" data-testid="recent-redemptions">
            {live.recentRedemptions.map((r) => (
              <li key={r.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${flash === r.code ? 'animate-pulse bg-emerald-50' : ''}`}>
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.campaignName}</div>
                  <div className="text-xs text-muted">
                    {hhmmss(r.simTime)} · <span className="font-mono">{r.code}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${new Map(Object.entries(SOURCE_BADGE)).get(r.source) ?? ''}`}>{label(r.source)}</span>
                  <span className="font-semibold tabular-nums">{money(r.basketValue)}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export function RetailerPage() {
  const { t } = useTranslation();
  const advertiserId = useCompany('retailer');
  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold">{t('roles.name.retailer')}</h1>
      <p className="mb-6 text-muted">{t('retailer.live.title')}</p>
      {advertiserId && <RetailerLiveDashboard advertiserId={advertiserId} />}
    </div>
  );
}

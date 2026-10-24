import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../app/useApi.ts';
import { Badge, Card, Empty, table } from '../../components/ui.tsx';
import { pct } from '../../lib/format.ts';

interface Partner {
  campaignId: string;
  name: string;
  advertiser: string;
  category: string;
  fit: number;
  discountPct: number;
}

interface Play {
  screenId: string;
  screenName: string;
  gate: string | null;
  flight: string | null;
  playing: string | null;
  advertiser: string | null;
  source: string | null;
  rule: string | null;
}

// Partner offers ranked by fit for this airline's passengers, and what played at its gates and why
export function AirlinePartners({ airlineCode }: { airlineCode: string }) {
  const { t } = useTranslation();
  const partners = useApi<Partner[]>(`/api/airline/${encodeURIComponent(airlineCode)}/partners`);
  const plays = useApi<Play[]>(`/api/airline/${encodeURIComponent(airlineCode)}/plays`);
  const reloadPlays = plays.reload;
  useEffect(() => {
    const timer = window.setInterval(reloadPlays, 5000);
    return () => window.clearInterval(timer);
  }, [reloadPlays]);

  return (
    <div className="grid gap-6 p-6 2xl:grid-cols-2">
      <Card title={t('airline.partners.title')} testId="partner-offers">
        <p className="mb-3 text-sm text-muted">{t('airline.partners.hint')}</p>
        <table className={table.table}>
          <thead>
            <tr>
              <th className={table.th}>{t('airline.partners.offer')}</th>
              <th className={table.th}>{t('airline.partners.fit')}</th>
              <th className={table.thRight}>{t('retailer.builder.discount')}</th>
            </tr>
          </thead>
          <tbody>
            {(partners.data ?? []).map((p) => (
              <tr key={p.campaignId}>
                <td className={table.td}>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted">
                    {p.advertiser} · {p.category}
                  </div>
                </td>
                <td className={table.td}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-muted/15">
                      <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(p.fit * 100)}%` }} />
                    </div>
                    <span className="tabular-nums">{pct(p.fit)}</span>
                  </div>
                </td>
                <td className={table.tdRight}>{p.discountPct > 0 ? `${p.discountPct}%` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={t('airline.plays.title')} testId="gate-plays">
        <p className="mb-3 text-sm text-muted">{t('airline.plays.hint')}</p>
        {(plays.data ?? []).length === 0 ? (
          <Empty>{t('airline.plays.none')}</Empty>
        ) : (
          <div className={`${table.wrap} max-h-[36rem] overflow-y-auto`}>
            <table className={table.table}>
              <tbody>
                {(plays.data ?? []).map((p) => (
                  <tr key={p.screenId}>
                    <td className={table.td}>
                      <div className="font-mono text-xs">{p.screenId}</div>
                      <div className="text-xs text-muted">
                        {t('airline.plays.gate', { gate: p.gate ?? '-', flight: p.flight ?? '' })}
                      </div>
                    </td>
                    <td className={table.td}>
                      <div className="font-medium">{p.playing ?? t('admin.map.house')}</div>
                      <div className="text-xs text-muted">{p.rule}</div>
                    </td>
                    <td className={table.td}>{p.source && <Badge tone={p.source === 'airline-priority' ? 'accent' : p.source === 'delay-goodwill' ? 'warn' : 'neutral'}>{p.source}</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

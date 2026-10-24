import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Check, Empty, Field, NumberInput, Select, TextInput, table } from '../../components/ui.tsx';
import { hhmm } from '../../lib/format.ts';
import { useLiveEvent } from '../../live/LiveProvider.tsx';

interface Goodwill {
  rules: { id: string; partner: string; thresholdMinutes: number; airlineSharePct: number; enabled: boolean; campaignStatus: string }[];
  activity: { screenId: string; simTime: string; campaign: string; rule: string }[];
}

// Delay goodwill automation: past the threshold, a co-funded F&B voucher is pushed to the delayed flight's gate screens
export function AirlineGoodwill({ airlineCode }: { airlineCode: string }) {
  const { t } = useTranslation();
  const { data, reload } = useApi<Goodwill>(`/api/airline/${encodeURIComponent(airlineCode)}/goodwill`);
  const advertisers = useApi<{ id: string; name: string; kind: string }[]>('/api/advertisers');
  const partners = (advertisers.data ?? []).filter((a) => a.kind === 'fnb' || a.kind === 'retailer');
  const [draft, setDraft] = useState({ partnerAdvertiserId: '', thresholdMinutes: 60, airlineSharePct: 50, headline: 'Delayed? Your next treat is on us', enabled: true });
  const [error, setError] = useState<string | null>(null);
  useLiveEvent('decision', (batch) => {
    if (batch.some((d) => d.source === 'delay-goodwill')) reload();
  });

  const create = async () => {
    setError(null);
    try {
      await api.post(`/api/airline/${airlineCode}/goodwill`, { ...draft, partnerAdvertiserId: draft.partnerAdvertiserId || partners.find((p) => p.kind === 'fnb')?.id });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    await api.post(`/api/airline/${airlineCode}/goodwill/${id}`, { enabled });
    reload();
  };

  return (
    <div className="grid gap-6 p-6 2xl:grid-cols-2">
      <div className="space-y-6">
        <Card title={t('airline.goodwill.new')} testId="goodwill-form">
          <p className="mb-3 text-sm text-muted">{t('airline.goodwill.hint')}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('airline.goodwill.partner')}>
              <Select value={draft.partnerAdvertiserId} onChange={(v) => setDraft({ ...draft, partnerAdvertiserId: v })} label={t('airline.goodwill.partner')} options={[{ value: '', label: t('airline.goodwill.anyPartner') }, ...partners.map((p) => ({ value: p.id, label: p.name }))]} />
            </Field>
            <Field label={t('airline.goodwill.threshold')}>
              <NumberInput value={draft.thresholdMinutes} min={15} max={600} onChange={(v) => setDraft({ ...draft, thresholdMinutes: v })} label={t('airline.goodwill.threshold')} testId="goodwill-threshold" />
            </Field>
            <Field label={t('airline.goodwill.share')}>
              <NumberInput value={draft.airlineSharePct} min={0} max={100} onChange={(v) => setDraft({ ...draft, airlineSharePct: v })} label={t('airline.goodwill.share')} />
            </Field>
            <Field label={t('retailer.creatives.headline')}>
              <TextInput value={draft.headline} onChange={(v) => setDraft({ ...draft, headline: v })} label={t('retailer.creatives.headline')} maxLength={80} />
            </Field>
          </div>
          <div className="mt-3">
            <Check checked={draft.enabled} onChange={(v) => setDraft({ ...draft, enabled: v })} label={t('airline.goodwill.enabled')} />
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <div className="mt-4">
            <Button variant="primary" onClick={() => void create()} testId="goodwill-save">
              {t('airline.goodwill.create')}
            </Button>
          </div>
        </Card>
        <Card title={t('airline.goodwill.rules')} testId="goodwill-rules">
          {(data?.rules ?? []).length === 0 ? (
            <Empty>{t('airline.goodwill.none')}</Empty>
          ) : (
            <table className={table.table}>
              <tbody>
                {(data?.rules ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className={table.td}>
                      <div className="font-medium">{t('airline.goodwill.ruleText', { minutes: r.thresholdMinutes, partner: r.partner })}</div>
                      <div className="text-xs text-muted">{t('airline.goodwill.funding', { pct: r.airlineSharePct })}</div>
                    </td>
                    <td className={table.td}>
                      <Badge tone={r.enabled ? 'good' : 'neutral'}>{r.campaignStatus}</Badge>
                    </td>
                    <td className={table.td}>
                      <Check checked={r.enabled} onChange={(v) => void toggle(r.id, v)} label={t('airline.goodwill.enabled')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card title={t('airline.goodwill.activity')} testId="goodwill-activity">
        <p className="mb-3 text-sm text-muted">{t('airline.goodwill.activityHint')}</p>
        {(data?.activity ?? []).length === 0 ? (
          <Empty>{t('airline.goodwill.noActivity')}</Empty>
        ) : (
          <table className={table.table}>
            <tbody>
              {(data?.activity ?? []).map((a) => (
                <tr key={`${a.screenId}-${a.simTime}`}>
                  <td className={`${table.td} tabular-nums`}>{hhmm(a.simTime)}</td>
                  <td className={`${table.td} font-mono text-xs`}>{a.screenId}</td>
                  <td className={table.td}>
                    <div className="font-medium">{a.campaign}</div>
                    <div className="text-xs text-muted">{a.rule}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

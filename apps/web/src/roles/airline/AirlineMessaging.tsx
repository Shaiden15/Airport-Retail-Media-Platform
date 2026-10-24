import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Empty, Field, NumberInput, Select, TextInput, table } from '../../components/ui.tsx';

interface Message {
  id: string;
  name: string;
  status: string;
  start: string;
  end: string;
  gates: string[];
  zones: number;
}

// Sponsored gate-area content that plays only during this airline's own boarding windows
export function AirlineMessaging({ airlineCode }: { airlineCode: string }) {
  const { t } = useTranslation();
  const { data, reload } = useApi<Message[]>(`/api/airline/${encodeURIComponent(airlineCode)}/messages`);
  const [draft, setDraft] = useState({ name: '', template: 'upgrade', headline: '', subline: '', cta: 'Ask at the gate', gates: '', discountPct: 0, budget: 2000 });
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const create = async () => {
    setError(null);
    try {
      const gates = draft.gates.split(',').map((g) => g.trim()).filter(Boolean);
      const c = await api.post<{ name: string }>(`/api/airline/${airlineCode}/messages`, { ...draft, gates });
      setNotice(t('airline.messaging.created', { name: c.name }));
      set({ name: '', headline: '', subline: '' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="grid gap-6 p-6 2xl:grid-cols-2">
      <Card title={t('airline.messaging.new')} testId="gate-message-form">
        <p className="mb-3 text-sm text-muted">{t('airline.messaging.hint')}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('airline.messaging.name')}>
            <TextInput value={draft.name} onChange={(v) => set({ name: v })} label={t('airline.messaging.name')} maxLength={80} testId="message-name" />
          </Field>
          <Field label={t('retailer.creatives.template')}>
            <Select value={draft.template} onChange={(v) => set({ template: v })} label={t('retailer.creatives.template')} options={[{ value: 'upgrade', label: t('airline.messaging.upgrade') }, { value: 'destination', label: t('airline.messaging.destination') }, { value: 'hero-offer', label: t('airline.messaging.offer') }]} />
          </Field>
          <Field label={t('retailer.creatives.headline')}>
            <TextInput value={draft.headline} onChange={(v) => set({ headline: v })} label={t('retailer.creatives.headline')} maxLength={80} testId="message-headline" />
          </Field>
          <Field label={t('retailer.creatives.cta')}>
            <TextInput value={draft.cta} onChange={(v) => set({ cta: v })} label={t('retailer.creatives.cta')} maxLength={40} />
          </Field>
          <div className="md:col-span-2">
            <Field label={t('retailer.creatives.subline')}>
              <TextInput value={draft.subline} onChange={(v) => set({ subline: v })} label={t('retailer.creatives.subline')} maxLength={140} />
            </Field>
          </div>
          <Field label={t('airline.messaging.gates')} hint={t('airline.messaging.gatesHint')}>
            <TextInput value={draft.gates} onChange={(v) => set({ gates: v })} label={t('airline.messaging.gates')} placeholder="42, 43" />
          </Field>
          <Field label={t('retailer.builder.total')}>
            <NumberInput value={draft.budget} min={50} onChange={(v) => set({ budget: v })} label={t('retailer.builder.total')} />
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        {notice && <p className="mt-3 text-sm text-emerald-600" role="status">{notice}</p>}
        <div className="mt-4">
          <Button variant="primary" onClick={() => void create()} disabled={draft.name.length < 3 || draft.headline.length < 3} testId="message-save">
            {t('airline.messaging.schedule')}
          </Button>
        </div>
      </Card>
      <Card title={t('airline.messaging.list')} testId="gate-messages">
        {(data ?? []).length === 0 ? (
          <Empty>{t('airline.messaging.none')}</Empty>
        ) : (
          <table className={table.table}>
            <tbody>
              {(data ?? []).map((m) => (
                <tr key={m.id}>
                  <td className={table.td}>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-muted">{m.gates.length ? t('airline.messaging.atGates', { gates: m.gates.join(', ') }) : t('airline.messaging.atZones', { count: m.zones })}</div>
                  </td>
                  <td className={table.tdRight}>
                    <Badge tone={m.status === 'active' ? 'good' : m.status === 'pending-approval' ? 'warn' : 'neutral'}>{t(`campaign.status.${m.status}`)}</Badge>
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

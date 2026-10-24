import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import type { Candidate } from '../../api/types.ts';
import { HeatGrid } from '../../components/charts.tsx';
import { Badge, Button, Card, Field, NumberInput, Select, TextInput, table } from '../../components/ui.tsx';
import { hhmm } from '../../lib/format.ts';
import { ScreenPicker } from '../passenger/ScreenPicker.tsx';

interface Heatmap {
  zoneName: string;
  segments: string[];
  rows: { segment: string; values: number[] }[];
  pax: number[];
}

interface Conflict {
  decision: { winningRule: string; source: string; simTime: string };
  first: Candidate | null;
  second: Candidate | null;
  lines: string[];
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

// Audience heatmap for pricing, the "why A beat B" conflict view, and manual pins with a reason
export function MediaAudience() {
  const { t } = useTranslation();
  const zones = useApi<{ id: string; name: string }[]>('/api/zones');
  const [zoneId, setZoneId] = useState('Z-T2-DUTYFREE');
  const heat = useApi<Heatmap>(`/api/media/heatmap?zoneId=${encodeURIComponent(zoneId)}`);
  const [screenId, setScreenId] = useState('SCR-052');
  const [b, setB] = useState('');
  const conflict = useApi<Conflict>(`/api/media/conflict?screenId=${encodeURIComponent(screenId)}${b ? `&b=${encodeURIComponent(b)}` : ''}`);
  const pins = useApi<{ screenId: string; campaignId: string; reason: string; until: number }[]>('/api/media/pins');
  const campaigns = useApi<{ id: string; name: string; status: string }[]>('/api/campaigns');
  const [pin, setPin] = useState({ campaignId: '', reason: '', minutes: 60 });
  const [error, setError] = useState<string | null>(null);
  const max = Math.max(1, ...(heat.data?.rows ?? []).flatMap((r) => r.values));
  const segLabel = (k: string) => t(`segment.label.${k}`, { defaultValue: k });

  const savePin = async () => {
    setError(null);
    try {
      await api.post('/api/media/pins', { screenId, campaignId: pin.campaignId, reason: pin.reason, minutes: pin.minutes });
      pins.reload();
      conflict.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const unpin = async (id: string) => {
    await api.delete(`/api/media/pins/${id}`);
    pins.reload();
    conflict.reload();
  };

  return (
    <div className="space-y-6 p-6">
      <Card
        title={t('media.audience.heatmap', { zone: heat.data?.zoneName ?? '' })}
        actions={<div className="w-72"><Select value={zoneId} onChange={setZoneId} label={t('media.inventory.zone')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} /></div>}
        testId="segment-heatmap"
      >
        <HeatGrid
          label={t('media.audience.heatmap', { zone: heat.data?.zoneName ?? '' })}
          rows={(heat.data?.rows ?? []).map((r) => ({ key: r.segment, label: segLabel(r.segment) }))}
          columns={HOURS}
          cell={(r, c) => {
            const v = heat.data?.rows.at(r)?.values.at(c) ?? 0;
            return { value: v / max, text: v > 0 ? String(v) : '', title: `${segLabel(heat.data?.rows.at(r)?.segment ?? '')} ${HOURS.at(c)}:00 · ${v} pax` };
          }}
        />
      </Card>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Card title={t('media.audience.conflict')} actions={<ScreenPicker value={screenId} onChange={setScreenId} />} testId="conflict-view">
          {conflict.data && (
            <>
              <p className="mb-2 text-sm font-medium">{conflict.data.decision.winningRule}</p>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-primary/10 p-3">
                  <div className="text-xs text-muted">{t('media.audience.winner')}</div>
                  <div className="font-semibold">{conflict.data.first?.name ?? '-'}</div>
                  <div className="font-mono text-lg">{conflict.data.first?.breakdown?.score.toFixed(2) ?? '-'}</div>
                </div>
                <div className="rounded-lg bg-muted/10 p-3">
                  <div className="text-xs text-muted">{t('media.audience.challenger')}</div>
                  <select className="w-full rounded-md border border-muted/30 bg-surface px-1 py-0.5 text-sm" value={b || conflict.data.second?.campaignId || ''} onChange={(e) => setB(e.target.value)} aria-label={t('media.audience.challenger')}>
                    {(campaigns.data ?? []).filter((c) => c.id !== conflict.data?.first?.campaignId).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="font-mono text-lg">{conflict.data.second?.breakdown?.score.toFixed(2) ?? conflict.data.second?.reason ?? '-'}</div>
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm" data-testid="conflict-lines">
                {conflict.data.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card title={t('media.audience.pins')} testId="pins">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t('media.audience.pinCampaign')}>
              <Select value={pin.campaignId} onChange={(v) => setPin({ ...pin, campaignId: v })} label={t('media.audience.pinCampaign')} options={[{ value: '', label: '-' }, ...(campaigns.data ?? []).filter((c) => c.status === 'active').map((c) => ({ value: c.id, label: c.name }))]} />
            </Field>
            <Field label={t('media.audience.pinReason')}>
              <TextInput value={pin.reason} onChange={(v) => setPin({ ...pin, reason: v })} label={t('media.audience.pinReason')} maxLength={200} />
            </Field>
            <Field label={t('media.audience.pinMinutes')}>
              <NumberInput value={pin.minutes} min={5} max={1440} onChange={(v) => setPin({ ...pin, minutes: v })} label={t('media.audience.pinMinutes')} />
            </Field>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Button variant="primary" disabled={!pin.campaignId || pin.reason.length < 5} onClick={() => void savePin()}>
              {t('media.audience.pinScreen', { screen: screenId })}
            </Button>
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
          <table className={`${table.table} mt-4`}>
            <tbody>
              {(pins.data ?? []).map((p) => (
                <tr key={p.screenId}>
                  <td className={table.td}>
                    <div className="font-mono text-xs">{p.screenId}</div>
                    <div className="font-medium">{p.campaignId}</div>
                    <div className="text-xs text-muted">{p.reason}</div>
                  </td>
                  <td className={table.td}>
                    <Badge tone="accent">{t('media.audience.until', { time: hhmm(new Date(p.until).toISOString()) })}</Badge>
                  </td>
                  <td className={table.td}>
                    <Button variant="ghost" onClick={() => void unpin(p.screenId)}>
                      {t('media.audience.unpin')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

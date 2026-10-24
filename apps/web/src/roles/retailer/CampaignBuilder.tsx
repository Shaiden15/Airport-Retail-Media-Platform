import type { Campaign, Creative } from '@dwellcast/shared';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Button, Card, Check, Field, NumberInput, Select, TextInput } from '../../components/ui.tsx';
import { count, money, pct } from '../../lib/format.ts';
import { useLive } from '../../live/LiveProvider.tsx';
import { CreativeView } from '../passenger/Creative.tsx';

interface Preview {
  matchPct: number;
  eligibleShare: number;
  screens: number;
  expectedImpressions: number;
  expectedRedemptions: number;
  expectedPlays: number;
  estimatedSpend: number;
  pricePerPlay: number;
  topReasons: { reason: string; share: number }[];
  summary: string;
}

const WEIGHTED = ['business', 'holiday', 'vfr', 'student', 'family', 'couple', 'solo', 'group', '18-24', '25-34', '35-44', '45-54', '55+', 'business-cabin', 'frequent-flyer', 'female', 'male'] as const;
const REGIONS = ['gulf', 'europe', 'asia', 'americas', 'indian-ocean', 'domestic'] as const;

interface Draft {
  name: string;
  outletId: string;
  creativeId: string;
  weights: Record<string, number>;
  scope: 'any' | 'international' | 'domestic';
  regions: string[];
  minDwell: number;
  minCrowd: number;
  delayTrigger: boolean;
  delayMinutes: number;
  delayBoost: number;
  delayRequired: boolean;
  zoneIds: string[];
  startDate: string;
  days: number;
  fromHour: number;
  toHour: number;
  total: number;
  dailyCap: number;
  frequencyCap: number;
  headline: string;
  discountPct: number;
  validity: 'linked-flight-boarding' | 'fixed-minutes';
  fixedMinutes: number;
  perOfferCap: number;
  familyShare: boolean;
}

function fromCampaign(c: Campaign): Draft {
  const delay = c.targeting.triggers.find((tr) => tr.kind === 'delay');
  const weights = Object.fromEntries(Object.entries(c.targeting.segmentWeights).map(([k, v]) => [k, v ?? 0]));
  return {
    name: c.name,
    outletId: c.outletId ?? '',
    creativeId: c.creativeIds[0] ?? '',
    weights,
    scope: c.targeting.hardFilters.internationalOnly ? 'international' : c.targeting.hardFilters.domesticOnly ? 'domestic' : 'any',
    regions: c.targeting.hardFilters.destinationRegions,
    minDwell: c.targeting.hardFilters.minDwellMinutes,
    minCrowd: c.targeting.hardFilters.minCrowd,
    delayTrigger: Boolean(delay),
    delayMinutes: delay?.minDelayMinutes ?? 30,
    delayBoost: delay?.boost ?? 1.5,
    delayRequired: delay?.mode === 'required',
    zoneIds: c.targeting.placement.zoneIds,
    startDate: c.schedule.start.slice(0, 16),
    days: Math.max(1, Math.round((Date.parse(c.schedule.end) - Date.parse(c.schedule.start)) / 86_400_000)),
    fromHour: c.schedule.dailyHours.from,
    toHour: c.schedule.dailyHours.to,
    total: c.budget.total,
    dailyCap: c.budget.dailyCap,
    frequencyCap: c.budget.frequencyCapPerScreenHour,
    headline: c.offer.headline,
    discountPct: c.offer.discountPct,
    validity: c.offer.promoValidity,
    fixedMinutes: c.offer.fixedMinutes ?? 45,
    perOfferCap: c.offer.perOfferCap ?? 0,
    familyShare: c.offer.familyShare,
  };
}

function toTargeting(d: Draft) {
  const segmentWeights = Object.fromEntries(Object.entries(d.weights).filter(([, v]) => v > 0));
  return {
    segmentWeights,
    hardFilters: { internationalOnly: d.scope === 'international', domesticOnly: d.scope === 'domestic', destinationRegions: d.regions, destinations: [], minDwellMinutes: d.minDwell, minCrowd: d.minCrowd },
    placement: { zoneIds: d.zoneIds, screenIds: [], gates: [] },
    triggers: d.delayTrigger ? [{ kind: 'delay', minDelayMinutes: d.delayMinutes, destinations: [], boost: d.delayBoost, mode: d.delayRequired ? 'required' : 'boost', airlines: [] }] : [],
  };
}

// Campaign builder with a live audience-match forecast and a mock screen preview
export function CampaignBuilder({ advertiserId, campaign, onSaved, onCancel }: { advertiserId: string; campaign: Campaign | null; onSaved: (c: Campaign) => void; onCancel: () => void }) {
  const { t, i18n } = useTranslation();
  const { clock } = useLive();
  const creatives = useApi<Creative[]>(`/api/creatives?advertiserId=${encodeURIComponent(advertiserId)}`);
  const outlets = useApi<{ id: string; name: string; advertiserId: string }[]>('/api/outlets');
  const zones = useApi<{ id: string; name: string; terminalId: string; kind: string }[]>('/api/zones');
  const advertiser = useApi<{ id: string; name: string }[]>('/api/advertisers');
  const simDate = (clock?.simTime ?? new Date().toISOString()).slice(0, 16);
  const [draft, setDraft] = useState<Draft>(() =>
    campaign
      ? fromCampaign(campaign)
      : { name: '', outletId: '', creativeId: '', weights: { holiday: 0.8, international: 0 }, scope: 'any', regions: [], minDwell: 0, minCrowd: 0, delayTrigger: false, delayMinutes: 30, delayBoost: 1.5, delayRequired: false, zoneIds: [], startDate: simDate, days: 14, fromHour: 0, toHour: 24, total: 5000, dailyCap: 600, frequencyCap: 40, headline: '', discountPct: 10, validity: 'linked-flight-boarding', fixedMinutes: 45, perOfferCap: 0, familyShare: true },
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const targeting = useMemo(() => toTargeting(draft), [draft]);
  const targetingKey = JSON.stringify(targeting);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void api.post<Preview>('/api/campaigns/preview', { targeting: JSON.parse(targetingKey) as unknown, hours: 2 }).then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [targetingKey]);

  const myOutlets = (outlets.data ?? []).filter((o) => o.advertiserId === advertiserId);
  const myCreatives = creatives.data ?? [];
  const creative = myCreatives.find((c) => c.id === draft.creativeId) ?? myCreatives.at(0) ?? null;
  const advertiserName = (advertiser.data ?? []).find((a) => a.id === advertiserId)?.name ?? '';

  const save = async () => {
    setError(null);
    setSaving(true);
    const start = new Date(`${draft.startDate}:00Z`);
    const body = {
      advertiserId,
      outletId: draft.outletId || myOutlets.at(0)?.id || null,
      name: draft.name,
      creativeIds: [creative?.id ?? ''],
      targeting,
      schedule: { start: start.toISOString(), end: new Date(start.getTime() + draft.days * 86_400_000).toISOString(), dailyHours: { from: draft.fromHour, to: draft.toHour } },
      budget: { total: draft.total, dailyCap: draft.dailyCap, frequencyCapPerScreenHour: draft.frequencyCap },
      offer: { headline: draft.headline || draft.name, discountPct: draft.discountPct, promoValidity: draft.validity, fixedMinutes: draft.validity === 'fixed-minutes' ? draft.fixedMinutes : null, perOfferCap: draft.perOfferCap > 0 ? draft.perOfferCap : null, familyShare: draft.familyShare },
    };
    try {
      const saved = campaign ? await api.put<Campaign>(`/api/campaigns/${campaign.id}`, body) : await api.post<Campaign>('/api/campaigns', body);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const zoneGroups = new Map<string, { id: string; name: string }[]>();
  for (const z of zones.data ?? []) zoneGroups.set(z.terminalId, [...(zoneGroups.get(z.terminalId) ?? []), z]);
  const segLabel = (k: string) => t(`segment.label.${k}`, { defaultValue: k });

  return (
    <div className="grid gap-6 2xl:grid-cols-[3fr_2fr]" data-testid="campaign-builder">
      <div className="space-y-4">
        <Card title={t('retailer.builder.basics')}>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={t('retailer.builder.name')}>
              <TextInput value={draft.name} onChange={(v) => set({ name: v })} label={t('retailer.builder.name')} maxLength={80} testId="builder-name" />
            </Field>
            <Field label={t('retailer.builder.outlet')}>
              <Select value={draft.outletId} onChange={(v) => set({ outletId: v })} label={t('retailer.builder.outlet')} options={[{ value: '', label: t('retailer.builder.anyOutlet') }, ...myOutlets.map((o) => ({ value: o.id, label: o.name }))]} />
            </Field>
            <Field label={t('retailer.builder.creative')}>
              <Select value={creative?.id ?? ''} onChange={(v) => set({ creativeId: v })} label={t('retailer.builder.creative')} options={myCreatives.map((c) => ({ value: c.id, label: `${c.name} (${c.approval})` }))} />
            </Field>
            <Field label={t('retailer.builder.headline')}>
              <TextInput value={draft.headline} onChange={(v) => set({ headline: v })} label={t('retailer.builder.headline')} maxLength={80} />
            </Field>
          </div>
        </Card>

        <Card title={t('retailer.builder.audience')}>
          <p className="mb-3 text-xs text-muted">{t('retailer.builder.weightsHint')}</p>
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {WEIGHTED.map((k) => {
              const weight = new Map(Object.entries(draft.weights)).get(k) ?? 0;
              return (
              <label key={k} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate">{segLabel(k)}</span>
                <input type="range" min={0} max={100} step={10} value={Math.round(weight * 100)} onChange={(e) => set({ weights: { ...draft.weights, [k]: Number(e.target.value) / 100 } })} aria-label={segLabel(k)} />
                <span className="text-right tabular-nums text-muted">{weight.toFixed(1)}</span>
              </label>
              );
            })}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Field label={t('retailer.builder.scope')}>
              <Select value={draft.scope} onChange={(v) => set({ scope: v as Draft['scope'] })} label={t('retailer.builder.scope')} options={[{ value: 'any', label: t('retailer.builder.scopeAny') }, { value: 'international', label: t('retailer.builder.scopeIntl') }, { value: 'domestic', label: t('retailer.builder.scopeDom') }]} />
            </Field>
            <Field label={t('retailer.builder.minDwell')}>
              <NumberInput value={draft.minDwell} min={0} max={240} onChange={(v) => set({ minDwell: v })} label={t('retailer.builder.minDwell')} />
            </Field>
            <Field label={t('retailer.builder.minCrowd')}>
              <NumberInput value={draft.minCrowd} min={0} max={5000} onChange={(v) => set({ minCrowd: v })} label={t('retailer.builder.minCrowd')} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {REGIONS.map((r) => (
              <Check key={r} checked={draft.regions.includes(r)} onChange={(v) => set({ regions: v ? [...draft.regions, r] : draft.regions.filter((x) => x !== r) })} label={t(`retailer.builder.region.${r}`)} />
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-muted/10 p-3">
            <Check checked={draft.delayTrigger} onChange={(v) => set({ delayTrigger: v })} label={t('retailer.builder.delayTrigger')} testId="builder-delay" />
            {draft.delayTrigger && (
              <div className="mt-2 grid gap-3 md:grid-cols-3">
                <Field label={t('retailer.builder.delayMinutes')}>
                  <NumberInput value={draft.delayMinutes} min={0} max={600} onChange={(v) => set({ delayMinutes: v })} label={t('retailer.builder.delayMinutes')} />
                </Field>
                <Field label={t('retailer.builder.delayBoost')}>
                  <NumberInput value={draft.delayBoost} min={1} max={3} step={0.1} onChange={(v) => set({ delayBoost: v })} label={t('retailer.builder.delayBoost')} />
                </Field>
                <div className="pt-6">
                  <Check checked={draft.delayRequired} onChange={(v) => set({ delayRequired: v })} label={t('retailer.builder.delayOnly')} />
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card title={t('retailer.builder.placement')}>
          <p className="mb-2 text-xs text-muted">{t('retailer.builder.placementHint')}</p>
          {[...zoneGroups.entries()].map(([terminal, list]) => (
            <div key={terminal} className="mb-2">
              <div className="mb-1 text-xs font-semibold text-muted">{terminal}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {list.map((z) => (
                  <Check key={z.id} checked={draft.zoneIds.includes(z.id)} onChange={(v) => set({ zoneIds: v ? [...draft.zoneIds, z.id] : draft.zoneIds.filter((x) => x !== z.id) })} label={z.name} />
                ))}
              </div>
            </div>
          ))}
        </Card>

        <Card title={t('retailer.builder.scheduleBudget')}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t('retailer.builder.start')}>
              <input type="datetime-local" className="w-full rounded-md border border-muted/30 bg-surface px-2 py-1.5 text-sm" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} aria-label={t('retailer.builder.start')} />
            </Field>
            <Field label={t('retailer.builder.days')}>
              <NumberInput value={draft.days} min={1} max={120} onChange={(v) => set({ days: v })} label={t('retailer.builder.days')} />
            </Field>
            <Field label={t('retailer.builder.hours')}>
              <div className="flex gap-2">
                <NumberInput value={draft.fromHour} min={0} max={23} onChange={(v) => set({ fromHour: v })} label={t('retailer.builder.fromHour')} />
                <NumberInput value={draft.toHour} min={1} max={24} onChange={(v) => set({ toHour: v })} label={t('retailer.builder.toHour')} />
              </div>
            </Field>
            <Field label={t('retailer.builder.total')}>
              <NumberInput value={draft.total} min={50} onChange={(v) => set({ total: v })} label={t('retailer.builder.total')} />
            </Field>
            <Field label={t('retailer.builder.dailyCap')}>
              <NumberInput value={draft.dailyCap} min={10} onChange={(v) => set({ dailyCap: v })} label={t('retailer.builder.dailyCap')} />
            </Field>
            <Field label={t('retailer.builder.frequency')}>
              <NumberInput value={draft.frequencyCap} min={1} max={120} onChange={(v) => set({ frequencyCap: v })} label={t('retailer.builder.frequency')} />
            </Field>
          </div>
        </Card>

        <Card title={t('retailer.builder.offer')}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t('retailer.builder.discount')}>
              <NumberInput value={draft.discountPct} min={0} max={100} onChange={(v) => set({ discountPct: v })} label={t('retailer.builder.discount')} />
            </Field>
            <Field label={t('retailer.builder.validity')}>
              <Select value={draft.validity} onChange={(v) => set({ validity: v as Draft['validity'] })} label={t('retailer.builder.validity')} options={[{ value: 'linked-flight-boarding', label: t('retailer.builder.validityFlight') }, { value: 'fixed-minutes', label: t('retailer.builder.validityFixed') }]} />
            </Field>
            <Field label={t('retailer.builder.cap')} hint={t('retailer.builder.capHint')}>
              <NumberInput value={draft.perOfferCap} min={0} onChange={(v) => set({ perOfferCap: v })} label={t('retailer.builder.cap')} />
            </Field>
          </div>
          <div className="mt-3">
            <Check checked={draft.familyShare} onChange={(v) => set({ familyShare: v })} label={t('retailer.builder.family')} />
          </div>
        </Card>
      </div>

      <div className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
        <Card title={t('retailer.builder.preview')} testId="builder-preview">
          {preview ? (
            <>
              <p className="mb-3 text-sm font-medium" data-testid="preview-summary">
                {preview.summary}
              </p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted">{t('retailer.builder.match')}</div>
                  <div className="text-xl font-bold tabular-nums">{pct(preview.matchPct)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t('retailer.builder.eligible')}</div>
                  <div className="text-xl font-bold tabular-nums">{pct(preview.eligibleShare)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t('retailer.builder.impressions')}</div>
                  <div className="font-semibold tabular-nums">{count(preview.expectedImpressions)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t('retailer.builder.redemptions')}</div>
                  <div className="font-semibold tabular-nums">{count(preview.expectedRedemptions)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t('retailer.builder.spend')}</div>
                  <div className="font-semibold tabular-nums">{money(preview.estimatedSpend)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted">{t('retailer.builder.price')}</div>
                  <div className="font-semibold tabular-nums">{money(preview.pricePerPlay)}</div>
                </div>
              </div>
              {preview.topReasons.length > 0 && <p className="mt-3 text-xs text-muted">{t('retailer.builder.reasons', { reasons: preview.topReasons.map((r) => `${r.reason} ${pct(r.share)}`).join(', ') })}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">{t('retailer.builder.previewLoading')}</p>
          )}
        </Card>
        {creative && (
          <Card title={t('retailer.builder.mockScreen')}>
            <div className="mx-auto aspect-[9/16] w-56 overflow-hidden rounded-xl border-4 border-black">
              <CreativeView creative={creative} locale={i18n.language} advertiser={advertiserName} discountPct={draft.discountPct} portrait />
            </div>
          </Card>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => void save()} disabled={saving || draft.name.length < 3 || !creative} testId="builder-save">
            {campaign ? t('retailer.builder.update') : t('retailer.builder.submit')}
          </Button>
          <Button onClick={onCancel}>{t('shell.common.cancel')}</Button>
        </div>
        <p className="text-xs text-muted">{t('retailer.builder.approvalNote')}</p>
      </div>
    </div>
  );
}

import type { Creative } from '@dwellcast/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Field, Modal, Select, TextInput } from '../../components/ui.tsx';
import { CreativeView } from '../passenger/Creative.tsx';

const TEMPLATES = ['hero-offer', 'countdown-deal', 'destination', 'upgrade', 'goodwill'] as const;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

// Reusable ad pages: preview every creative, create from a template, add an image and the second-language copy
export function CreativeLibrary({ advertiserId }: { advertiserId: string }) {
  const { t, i18n } = useTranslation();
  const { data, reload } = useApi<Creative[]>(`/api/creatives?advertiserId=${encodeURIComponent(advertiserId)}`);
  const advertisers = useApi<{ id: string; name: string; brandColor: string }[]>('/api/advertisers');
  const me = (advertisers.data ?? []).find((a) => a.id === advertiserId);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ name: '', template: 'hero-offer', headline: '', subline: '', cta: 'Scan to claim', accentColor: '#0f766e', imageAssetId: '' as string, hiHeadline: '', hiSubline: '', hiCta: '' });
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const base64 = await readAsBase64(file);
      const asset = await api.post<{ id: string }>('/api/assets', { advertiserId, data: base64 });
      set({ imageAssetId: asset.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/creatives', {
        advertiserId,
        name: draft.name,
        template: draft.template,
        headline: draft.headline,
        subline: draft.subline,
        cta: draft.cta,
        accentColor: draft.accentColor,
        imageAssetId: draft.imageAssetId || null,
        translations: draft.hiHeadline ? { hi: { headline: draft.hiHeadline, subline: draft.hiSubline, cta: draft.hiCta || draft.cta } } : {},
      });
      setOpen(false);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const previewCreative: Creative = {
    id: 'preview',
    advertiserId,
    name: draft.name,
    template: draft.template as Creative['template'],
    content: { headline: draft.headline || t('retailer.creatives.sampleHeadline'), subline: draft.subline, cta: draft.cta, accentColor: draft.accentColor, imageAssetId: draft.imageAssetId || null },
    translations: draft.hiHeadline ? { hi: { headline: draft.hiHeadline, subline: draft.hiSubline, cta: draft.hiCta || draft.cta } } : {},
    approval: 'pending',
    createdAt: '',
  };

  return (
    <div className="p-6">
      <Card
        title={t('retailer.creatives.title')}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              set({ accentColor: me?.brandColor ?? '#0f766e' });
              setOpen(true);
            }}
            testId="new-creative"
          >
            {t('retailer.creatives.new')}
          </Button>
        }
        testId="creative-library"
      >
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 2xl:grid-cols-6">
          {(data ?? []).map((c) => (
            <figure key={c.id} className="space-y-2">
              <div className="aspect-[9/16] overflow-hidden rounded-xl border-4 border-black">
                <div className="h-[200%] w-[200%] origin-top-left scale-50">
                  <CreativeView creative={c} locale={i18n.language} advertiser={me?.name ?? ''} discountPct={0} portrait />
                </div>
              </div>
              <figcaption className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{c.name}</span>
                <Badge tone={c.approval === 'approved' ? 'good' : c.approval === 'rejected' ? 'bad' : 'warn'}>{c.approval}</Badge>
              </figcaption>
            </figure>
          ))}
        </div>
      </Card>
      {open && (
        <Modal title={t('retailer.creatives.new')} onClose={() => setOpen(false)} wide>
          <div className="grid gap-6 md:grid-cols-[1fr_14rem]">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('retailer.creatives.name')}>
                <TextInput value={draft.name} onChange={(v) => set({ name: v })} label={t('retailer.creatives.name')} maxLength={80} testId="creative-name" />
              </Field>
              <Field label={t('retailer.creatives.template')}>
                <Select value={draft.template} onChange={(v) => set({ template: v })} label={t('retailer.creatives.template')} options={TEMPLATES.map((x) => ({ value: x, label: x }))} />
              </Field>
              <Field label={t('retailer.creatives.headline')}>
                <TextInput value={draft.headline} onChange={(v) => set({ headline: v })} label={t('retailer.creatives.headline')} maxLength={80} testId="creative-headline" />
              </Field>
              <Field label={t('retailer.creatives.cta')}>
                <TextInput value={draft.cta} onChange={(v) => set({ cta: v })} label={t('retailer.creatives.cta')} maxLength={40} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t('retailer.creatives.subline')}>
                  <TextInput value={draft.subline} onChange={(v) => set({ subline: v })} label={t('retailer.creatives.subline')} maxLength={140} />
                </Field>
              </div>
              <Field label={t('retailer.creatives.accent')}>
                <input type="color" value={draft.accentColor} onChange={(e) => set({ accentColor: e.target.value })} aria-label={t('retailer.creatives.accent')} className="h-9 w-full rounded-md border border-muted/30" />
              </Field>
              <Field label={t('retailer.creatives.image')} hint={t('retailer.creatives.imageHint')}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void upload(e.target.files?.[0])} aria-label={t('retailer.creatives.image')} className="text-sm" />
              </Field>
              <div className="sm:col-span-2 rounded-lg bg-muted/10 p-3">
                <div className="mb-2 text-xs font-semibold text-muted">{t('retailer.creatives.secondLanguage')}</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <TextInput value={draft.hiHeadline} onChange={(v) => set({ hiHeadline: v })} label={t('retailer.creatives.headline')} placeholder={t('retailer.creatives.headline')} maxLength={80} />
                  <TextInput value={draft.hiSubline} onChange={(v) => set({ hiSubline: v })} label={t('retailer.creatives.subline')} placeholder={t('retailer.creatives.subline')} maxLength={140} />
                  <TextInput value={draft.hiCta} onChange={(v) => set({ hiCta: v })} label={t('retailer.creatives.cta')} placeholder={t('retailer.creatives.cta')} maxLength={40} />
                </div>
              </div>
            </div>
            <div className="aspect-[9/16] w-56 overflow-hidden rounded-xl border-4 border-black">
              <CreativeView creative={previewCreative} locale={i18n.language} advertiser={me?.name ?? ''} discountPct={0} portrait />
            </div>
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => void create()} disabled={busy || draft.name.length < 3 || draft.headline.length < 2} testId="creative-save">
              {t('shell.common.save')}
            </Button>
            <Button onClick={() => setOpen(false)}>{t('shell.common.cancel')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

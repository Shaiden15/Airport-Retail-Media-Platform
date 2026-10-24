import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Check, Field, NumberInput, Select, table } from '../../components/ui.tsx';
import { hhmmss } from '../../lib/format.ts';

interface Settings {
  explorationPct: number;
  globalFrequencyCapPerScreenHour: number;
  competitorSeparation: boolean;
  airlinePriority: boolean;
  learnLiftRange: number;
  attentionFactor: number;
  freshnessMinutes: { aodb: number; aidx: number; acris: number };
}

interface LogRow {
  id: string;
  screenId: string;
  simTime: string;
  name: string | null;
  source: string;
  rule: string;
  score: number;
  candidates: { campaignId: string; name: string; status: string; reason: string | null; score: number | null }[];
}

const SOURCES = ['', 'agent-verified', 'rule-based', 'delay-goodwill', 'airline-priority', 'manual-pin', 'house-default'];

// Rule engine settings, model versions and the searchable decision log
export function AdminRules() {
  const { t } = useTranslation();
  const settings = useApi<Settings>('/api/engine/settings');
  const model = useApi<Record<string, string>>('/api/admin/model');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const [screenId, setScreenId] = useState('');
  const params = new URLSearchParams({ limit: '60', ...(q ? { q } : {}), ...(source ? { source } : {}), ...(screenId ? { screenId } : {}) });
  const log = useApi<LogRow[]>(`/api/decisions?${params.toString()}`);
  const current = draft ?? settings.data;

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const save = async () => {
    if (!current) return;
    const next = await api.put<Settings>('/api/engine/settings', current);
    setDraft(next);
    setSaved(true);
  };

  const set = (patch: Partial<Settings>) => current && setDraft({ ...current, ...patch });

  return (
    <div className="grid gap-6 p-6 2xl:grid-cols-[1fr_2fr]">
      <div className="space-y-6">
        <Card title={t('admin.rules.title')} testId="rule-settings">
          {current && (
            <div className="space-y-3">
              <Field label={t('admin.rules.exploration')} hint={t('admin.rules.explorationHint')}>
                <NumberInput value={Math.round(current.explorationPct * 100)} min={0} max={30} onChange={(v) => set({ explorationPct: v / 100 })} label={t('admin.rules.exploration')} />
              </Field>
              <Field label={t('admin.rules.frequency')}>
                <NumberInput value={current.globalFrequencyCapPerScreenHour} min={1} max={240} onChange={(v) => set({ globalFrequencyCapPerScreenHour: v })} label={t('admin.rules.frequency')} />
              </Field>
              <Field label={t('admin.rules.learnRange')}>
                <NumberInput value={Math.round(current.learnLiftRange * 100)} min={0} max={50} onChange={(v) => set({ learnLiftRange: v / 100 })} label={t('admin.rules.learnRange')} />
              </Field>
              <Field label={t('admin.rules.attention')}>
                <NumberInput value={Math.round(current.attentionFactor * 100)} min={5} max={100} onChange={(v) => set({ attentionFactor: v / 100 })} label={t('admin.rules.attention')} />
              </Field>
              <Check checked={current.competitorSeparation} onChange={(v) => set({ competitorSeparation: v })} label={t('admin.rules.separation')} />
              <Check checked={current.airlinePriority} onChange={(v) => set({ airlinePriority: v })} label={t('admin.rules.airlinePriority')} />
              <div className="grid grid-cols-3 gap-2">
                {(['aodb', 'aidx', 'acris'] as const).map((k) => (
                  <Field key={k} label={t('admin.rules.freshness', { feed: k.toUpperCase() })}>
                    <NumberInput value={new Map(Object.entries(current.freshnessMinutes)).get(k) ?? 1} min={1} onChange={(v) => set({ freshnessMinutes: { ...current.freshnessMinutes, [k]: v } })} label={k} />
                  </Field>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="primary" onClick={() => void save()} testId="rules-save">
                  {t('shell.common.save')}
                </Button>
                {saved && <span className="text-sm text-emerald-500">{t('shell.common.saved')}</span>}
              </div>
            </div>
          )}
        </Card>
        <Card title={t('admin.rules.model')}>
          <dl className="space-y-1 text-sm">
            {Object.entries(model.data ?? {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
      <Card
        title={t('admin.rules.log')}
        actions={
          <>
            <input className="rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm" placeholder={t('shell.common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('shell.common.search')} data-testid="log-search" />
            <input className="w-28 rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm" placeholder="SCR-052" value={screenId} onChange={(e) => setScreenId(e.target.value.toUpperCase())} aria-label={t('admin.rules.screen')} />
            <div className="w-44">
              <Select value={source} onChange={setSource} label={t('admin.rules.source')} options={SOURCES.map((s) => ({ value: s, label: s || t('admin.rules.anySource') }))} />
            </div>
          </>
        }
        testId="decision-log"
      >
        <div className={`${table.wrap} max-h-[70vh] overflow-y-auto`}>
          <table className={table.table}>
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={table.th}>{t('admin.rules.time')}</th>
                <th className={table.th}>{t('admin.rules.screen')}</th>
                <th className={table.th}>{t('admin.rules.winner')}</th>
                <th className={table.th}>{t('admin.rules.why')}</th>
              </tr>
            </thead>
            <tbody>
              {(log.data ?? []).map((d) => (
                <tr key={d.id}>
                  <td className={`${table.td} tabular-nums`}>{hhmmss(d.simTime)}</td>
                  <td className={`${table.td} font-mono text-xs`}>{d.screenId}</td>
                  <td className={table.td}>
                    <div className="font-medium">{d.name ?? t('admin.map.house')}</div>
                    <Badge tone={d.source === 'rule-based' && d.rule.includes('rejected') ? 'bad' : 'accent'}>{d.source}</Badge>
                  </td>
                  <td className={`${table.td} text-xs text-muted`}>{d.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

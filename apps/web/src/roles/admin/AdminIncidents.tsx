import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Empty, Field, Modal, Select, TextInput, table } from '../../components/ui.tsx';
import { hhmm } from '../../lib/format.ts';
import { useLiveEvent } from '../../live/LiveProvider.tsx';

interface Incident {
  id: string;
  kind: string;
  subjectId: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  owner: string | null;
  status: 'open' | 'acknowledged' | 'resolved';
  openedAt: string;
  resolvedAt: string | null;
  notes: string;
}

const SEVERITY_TONE = new Map<string, 'bad' | 'warn' | 'info' | 'good'>([['critical', 'bad'], ['high', 'bad'], ['medium', 'warn'], ['low', 'info']]);
const STATUS_TONE = new Map<string, 'bad' | 'warn' | 'info' | 'good'>([['open', 'bad'], ['acknowledged', 'warn'], ['resolved', 'good']]);

// Auto-raised alerts plus manual tickets, with owner and status editable inline
export function AdminIncidents() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const { data, reload } = useApi<{ incidents: Incident[] }>(`/api/admin/incidents${filter === 'active' ? '?status=active' : ''}`);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ subjectId: '', title: '', severity: 'medium', owner: '' });
  const [error, setError] = useState<string | null>(null);
  useLiveEvent('incident', reload);

  const update = async (id: string, patch: Partial<Pick<Incident, 'owner' | 'status'>>) => {
    await api.put(`/api/admin/incidents/${id}`, patch);
    reload();
  };

  const create = async () => {
    try {
      await api.post('/api/admin/incidents', { ...draft, owner: draft.owner || null });
      setCreating(false);
      setDraft({ subjectId: '', title: '', severity: 'medium', owner: '' });
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const incidents = data?.incidents ?? [];
  return (
    <div className="p-6">
      <Card
        title={t('admin.incidents.title')}
        actions={
          <>
            <Select value={filter} onChange={(v) => setFilter(v as 'active' | 'all')} label={t('admin.incidents.filter')} options={[{ value: 'active', label: t('admin.incidents.active') }, { value: 'all', label: t('admin.incidents.all') }]} />
            <Button variant="primary" onClick={() => setCreating(true)}>
              {t('admin.incidents.new')}
            </Button>
          </>
        }
        testId="incident-table"
      >
        {incidents.length === 0 ? (
          <Empty>{t('admin.incidents.none')}</Empty>
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>{t('admin.incidents.severity')}</th>
                  <th className={table.th}>{t('admin.incidents.issue')}</th>
                  <th className={table.th}>{t('admin.incidents.opened')}</th>
                  <th className={table.th}>{t('admin.incidents.owner')}</th>
                  <th className={table.th}>{t('admin.incidents.status')}</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((i) => (
                  <tr key={i.id}>
                    <td className={table.td}>
                      <Badge tone={SEVERITY_TONE.get(i.severity)}>{t(`admin.severity.${i.severity}`)}</Badge>
                    </td>
                    <td className={table.td}>
                      <div className="font-medium">{i.title}</div>
                      <div className="text-xs text-muted">
                        {i.kind} · {i.subjectId}
                      </div>
                      {i.notes && <div className="mt-1 whitespace-pre-line text-xs text-muted">{i.notes}</div>}
                    </td>
                    <td className={`${table.td} tabular-nums`}>{hhmm(i.openedAt)}</td>
                    <td className={table.td}>
                      <input
                        className="w-40 rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm"
                        defaultValue={i.owner ?? ''}
                        aria-label={t('admin.incidents.owner')}
                        onBlur={(e) => {
                          if (e.target.value !== (i.owner ?? '') && e.target.value.length >= 2) void update(i.id, { owner: e.target.value });
                        }}
                      />
                    </td>
                    <td className={table.td}>
                      <div className="flex items-center gap-2">
                        <Badge tone={STATUS_TONE.get(i.status)}>{t(`admin.incidents.${i.status}`)}</Badge>
                        {i.status !== 'resolved' && (
                          <select className="rounded-md border border-muted/30 bg-surface px-1 py-0.5 text-xs" value="" aria-label={t('admin.incidents.change')} onChange={(e) => void update(i.id, { status: e.target.value as Incident['status'] })}>
                            <option value="">{t('admin.incidents.change')}</option>
                            <option value="acknowledged">{t('admin.incidents.acknowledged')}</option>
                            <option value="resolved">{t('admin.incidents.resolved')}</option>
                          </select>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && (
        <Modal title={t('admin.incidents.new')} onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <Field label={t('admin.incidents.subject')}>
              <TextInput value={draft.subjectId} onChange={(v) => setDraft({ ...draft, subjectId: v })} label={t('admin.incidents.subject')} placeholder="SCR-052" />
            </Field>
            <Field label={t('admin.incidents.issue')}>
              <TextInput value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} label={t('admin.incidents.issue')} />
            </Field>
            <Field label={t('admin.incidents.severity')}>
              <Select value={draft.severity} onChange={(v) => setDraft({ ...draft, severity: v })} label={t('admin.incidents.severity')} options={(['critical', 'high', 'medium', 'low'] as const).map((s) => ({ value: s, label: t(`admin.severity.${s}`) }))} />
            </Field>
            <Field label={t('admin.incidents.owner')}>
              <TextInput value={draft.owner} onChange={(v) => setDraft({ ...draft, owner: v })} label={t('admin.incidents.owner')} />
            </Field>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button variant="primary" onClick={() => void create()}>
              {t('shell.common.save')}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

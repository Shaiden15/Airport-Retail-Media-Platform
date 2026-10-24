import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Button, Card, Check, Field, Modal, NumberInput, Select, TextInput, table } from '../../components/ui.tsx';

type Kind = 'vendors' | 'advertisers' | 'outlets' | 'airlines' | 'terminals' | 'zones' | 'gates' | 'screens';
type FieldType = 'text' | 'number' | 'bool' | { options: string[] } | { ref: Kind };
interface FieldSpec {
  key: string;
  type: FieldType;
}

const KINDS: Kind[] = ['vendors', 'advertisers', 'outlets', 'airlines', 'terminals', 'zones', 'gates', 'screens'];
const ID_KEYS: Readonly<Record<Kind, string>> = { vendors: 'id', advertisers: 'id', outlets: 'id', airlines: 'code', terminals: 'id', zones: 'id', gates: 'id', screens: 'id' };

const CATEGORIES = ['duty-free', 'perfume', 'fashion', 'electronics', 'toys', 'books', 'pharmacy', 'chocolate', 'sweets', 'coffee', 'restaurant', 'bar', 'lounge', 'airline', 'travel-services'];
const REGIONS = ['domestic', 'gulf', 'europe', 'asia', 'africa', 'americas', 'oceania', 'indian-ocean', 'other'];

// Form fields per master data type; references load their options from the API
const FIELD_SPECS: Readonly<Record<Kind, FieldSpec[]>> = {
  vendors: [{ key: 'name', type: 'text' }, { key: 'kind', type: { options: ['screen-hardware', 'network', 'content-agency'] } }, { key: 'contactEmail', type: 'text' }],
  advertisers: [{ key: 'name', type: 'text' }, { key: 'kind', type: { options: ['retailer', 'fnb', 'airline', 'brand', 'lounge'] } }, { key: 'category', type: { options: CATEGORIES } }, { key: 'brandColor', type: 'text' }],
  outlets: [{ key: 'name', type: 'text' }, { key: 'advertiserId', type: { ref: 'advertisers' } }, { key: 'category', type: { options: CATEGORIES } }, { key: 'zoneId', type: { ref: 'zones' } }, { key: 'avgBasket', type: 'number' }, { key: 'inStock', type: 'bool' }],
  airlines: [{ key: 'code', type: 'text' }, { key: 'icaoCode', type: 'text' }, { key: 'name', type: 'text' }, { key: 'model', type: { options: ['full-service', 'low-cost'] } }, { key: 'hubRegion', type: { options: REGIONS } }, { key: 'brandColor', type: 'text' }],
  terminals: [{ key: 'code', type: 'text' }, { key: 'name', type: 'text' }],
  zones: [{ key: 'name', type: 'text' }, { key: 'terminalId', type: { ref: 'terminals' } }, { key: 'kind', type: { options: ['gate-area', 'retail', 'security', 'landside'] } }, { key: 'airside', type: 'bool' }, { key: 'centroidX', type: 'number' }, { key: 'centroidY', type: 'number' }, { key: 'radius', type: 'number' }],
  gates: [{ key: 'id', type: 'text' }, { key: 'terminalId', type: { ref: 'terminals' } }, { key: 'zoneId', type: { ref: 'zones' } }, { key: 'x', type: 'number' }, { key: 'y', type: 'number' }, { key: 'bus', type: 'bool' }],
  screens: [{ key: 'name', type: 'text' }, { key: 'zoneId', type: { ref: 'zones' } }, { key: 'sizeInches', type: 'number' }, { key: 'orientation', type: { options: ['portrait', 'landscape'] } }, { key: 'resolution', type: 'text' }, { key: 'x', type: 'number' }, { key: 'y', type: 'number' }, { key: 'vendorId', type: { ref: 'vendors' } }, { key: 'status', type: { options: ['online', 'degraded', 'offline'] } }, { key: 'premium', type: 'bool' }],
};

const DEFAULT_VALUES: Readonly<Record<Kind, Record<string, unknown>>> = {
  vendors: { kind: 'screen-hardware', contactEmail: '' },
  advertisers: { kind: 'retailer', category: 'duty-free', brandColor: '#0f766e', airlineCode: null },
  outlets: { category: 'coffee', avgBasket: 12, inStock: true },
  airlines: { model: 'low-cost', hubRegion: 'domestic', brandColor: '#0284c7' },
  terminals: {},
  zones: { kind: 'retail', airside: true, centroidX: 800, centroidY: 450, radius: 60, concourseId: null },
  gates: { bus: false, x: 800, y: 450 },
  screens: { sizeInches: 55, orientation: 'portrait', resolution: '1080x1920', status: 'online', premium: false, x: 800, y: 450 },
};

type Row = Record<string, unknown>;
const ID_MAP = new Map(Object.entries(ID_KEYS));
const FIELD_MAP = new Map(Object.entries(FIELD_SPECS));
const DEFAULT_MAP = new Map(Object.entries(DEFAULT_VALUES));
const idKeyOf = (kind: Kind) => ID_MAP.get(kind) ?? 'id';
const get = (row: Row, key: string): unknown => new Map(Object.entries(row)).get(key);

// Screens arrive with nested position; the edit form uses flat x and y
function toForm(kind: Kind, row: Row): Row {
  if (kind !== 'screens') return row;
  const position = get(row, 'position') as { x: number; y: number } | undefined;
  return { ...row, x: position?.x ?? 0, y: position?.y ?? 0 };
}

function RefSelect({ kind, value, onChange, label }: { kind: Kind; value: string; onChange: (v: string) => void; label: string }) {
  const { data } = useApi<Row[]>(`/api/admin/master/${kind}`);
  const options = (data ?? []).map((r) => ({ value: String(get(r, idKeyOf(kind))), label: `${String(get(r, idKeyOf(kind)))} · ${String(get(r, 'name') ?? '')}` }));
  return <Select value={value} onChange={onChange} label={label} options={[{ value: '', label: '-' }, ...options]} />;
}

export function AdminMasterData() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>('screens');
  const [query, setQuery] = useState('');
  const { data, reload } = useApi<Row[]>(`/api/admin/master/${kind}`);
  const [editing, setEditing] = useState<{ id: string | null; values: Row } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = (FIELD_MAP.get(kind) ?? []);
  const rows = (data ?? []).filter((r) => !query || JSON.stringify(r).toLowerCase().includes(query.toLowerCase()));
  const label = (key: string) => t(`admin.master.field.${key}`, { defaultValue: key });

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      const idKey = idKeyOf(kind);
      if (editing.id) await api.put(`/api/admin/master/${kind}/${encodeURIComponent(editing.id)}`, { ...editing.values, [idKey]: editing.id });
      else await api.post(`/api/admin/master/${kind}`, editing.values);
      setEditing(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const setValue = (key: string, value: unknown) => editing && setEditing({ ...editing, values: { ...editing.values, [key]: value } });

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap gap-1" role="tablist" aria-label={t('admin.master.title')}>
        {KINDS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1.5 text-sm font-medium ${kind === k ? 'bg-primary text-bg' : 'bg-surface hover:bg-primary/10'}`}>
            {t(`admin.master.kind.${k}`)}
          </button>
        ))}
      </div>
      <Card
        title={`${t(`admin.master.kind.${kind}`)} (${rows.length})`}
        actions={
          <>
            <input className="rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm" placeholder={t('shell.common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('shell.common.search')} />
            <Button variant="primary" onClick={() => setEditing({ id: null, values: { ...DEFAULT_MAP.get(kind) } })} testId="master-new">
              {t('shell.common.new')}
            </Button>
          </>
        }
        testId="master-table"
      >
        <div className={`${table.wrap} max-h-[60vh] overflow-y-auto`}>
          <table className={table.table}>
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className={table.th}>{idKeyOf(kind)}</th>
                {fields.filter((f) => f.key !== idKeyOf(kind)).slice(0, 6).map((f) => (
                  <th key={f.key} className={table.th}>
                    {label(f.key)}
                  </th>
                ))}
                <th className={table.th} />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 300).map((r) => {
                const rowId = String(get(r, idKeyOf(kind)));
                const form = toForm(kind, r);
                return (
                  <tr key={rowId}>
                    <td className={`${table.td} font-mono text-xs`}>{rowId}</td>
                    {fields.filter((f) => f.key !== idKeyOf(kind)).slice(0, 6).map((f) => (
                      <td key={f.key} className={table.td}>
                        {String(get(form, f.key) ?? '')}
                      </td>
                    ))}
                    <td className={table.td}>
                      <Button variant="ghost" onClick={() => setEditing({ id: rowId, values: form })}>
                        {t('shell.common.edit')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && (
        <Modal title={`${editing.id ? t('shell.common.edit') : t('shell.common.new')}: ${t(`admin.master.kind.${kind}`)}`} onClose={() => setEditing(null)}>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const value = get(editing.values, f.key);
              const disabled = Boolean(editing.id) && f.key === idKeyOf(kind);
              if (f.type === 'bool') return <Check key={f.key} checked={Boolean(value)} onChange={(v) => setValue(f.key, v)} label={label(f.key)} />;
              return (
                <Field key={f.key} label={label(f.key)}>
                  {f.type === 'number' ? (
                    <NumberInput value={Number(value ?? 0)} onChange={(v) => setValue(f.key, v)} label={label(f.key)} />
                  ) : typeof f.type === 'object' && 'options' in f.type ? (
                    <Select value={String(value ?? '')} onChange={(v) => setValue(f.key, v)} label={label(f.key)} options={f.type.options.map((o) => ({ value: o, label: o }))} />
                  ) : typeof f.type === 'object' && 'ref' in f.type ? (
                    <RefSelect kind={f.type.ref} value={String(value ?? '')} onChange={(v) => setValue(f.key, v)} label={label(f.key)} />
                  ) : disabled ? (
                    <div className="rounded-md bg-muted/10 px-2 py-1.5 font-mono text-sm">{String(value ?? '')}</div>
                  ) : (
                    <TextInput value={String(value ?? '')} onChange={(v) => setValue(f.key, v)} label={label(f.key)} />
                  )}
                </Field>
              );
            })}
          </div>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={() => void save()} testId="master-save">
              {t('shell.common.save')}
            </Button>
            <Button onClick={() => setEditing(null)}>{t('shell.common.cancel')}</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

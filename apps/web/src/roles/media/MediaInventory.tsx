import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../app/useApi.ts';
import { BarChart, HeatGrid } from '../../components/charts.tsx';
import { Card, Select, table } from '../../components/ui.tsx';
import { count, money } from '../../lib/format.ts';

interface Inventory {
  zoneName: string;
  screens: { id: string; name: string; orientation: string; status: string; premium: boolean }[];
  cells: { screenId: string; hour: number; bookedShare: number; predictedPax: number; pricePerScreenHour: number; pricePerPlay: number; premium: boolean; state: 'booked' | 'available' }[];
}

interface Yield {
  days: { date: string; occupancyPct: number; revenueForecast: number; demandFactor: number }[];
  premiumSlots: { screenId: string; hour: number; zoneName: string; predictedPax: number; pricePerScreenHour: number; pricePerPlay: number }[];
  totalForecast: number;
}

const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

// Screen by hour calendar (booked, available, premium) and the price and revenue outlook
export function MediaInventory() {
  const { t } = useTranslation();
  const zones = useApi<{ id: string; name: string }[]>('/api/zones');
  const [zoneId, setZoneId] = useState('Z-T2-N-41');
  const inv = useApi<Inventory>(`/api/media/inventory?zoneId=${encodeURIComponent(zoneId)}`);
  const y = useApi<Yield>('/api/media/yield');
  const cells = new Map((inv.data?.cells ?? []).map((c) => [`${c.screenId}|${c.hour}`, c]));

  const tone = (state: string, premium: boolean) => (state === 'booked' ? (premium ? 'bg-fuchsia-600 text-white' : 'bg-primary text-bg') : premium ? 'bg-amber-400/80 text-black' : 'bg-muted/15');

  return (
    <div className="space-y-6 p-6">
      <Card
        title={t('media.inventory.title', { zone: inv.data?.zoneName ?? '' })}
        actions={<div className="w-72"><Select value={zoneId} onChange={setZoneId} label={t('media.inventory.zone')} options={(zones.data ?? []).map((z) => ({ value: z.id, label: z.name }))} testId="inventory-zone" /></div>}
        testId="inventory-calendar"
      >
        <div className="mb-3 flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-primary" />{t('media.inventory.booked')}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-muted/15" />{t('media.inventory.available')}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-400/80" />{t('media.inventory.premiumAvailable')}</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-fuchsia-600" />{t('media.inventory.premiumBooked')}</span>
        </div>
        <HeatGrid
          label={t('media.inventory.title', { zone: inv.data?.zoneName ?? '' })}
          rows={(inv.data?.screens ?? []).map((s) => ({ key: s.id, label: `${s.id} · ${s.orientation}` }))}
          columns={HOURS}
          cell={(r, c) => {
            const screen = inv.data?.screens.at(r);
            const cell = screen ? cells.get(`${screen.id}|${c}`) : undefined;
            return {
              value: cell?.bookedShare ?? 0,
              tone: tone(cell?.state ?? 'available', cell?.premium ?? false),
              text: cell ? String(Math.round(cell.bookedShare * 100)) : '',
              title: cell ? [screen?.id ?? '', `${String(HOURS.at(c))}:00`, '·', t('media.inventory.cellTitle', { booked: Math.round(cell.bookedShare * 100), pax: cell.predictedPax, price: money(cell.pricePerScreenHour), play: money(cell.pricePerPlay) })].join(' ') : '',
            };
          }}
        />
        <p className="mt-2 text-xs text-muted">{t('media.inventory.unit')}</p>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Card title={t('media.yield.title', { total: money(y.data?.totalForecast ?? 0, 'USD', true) })} testId="yield-outlook">
          <BarChart label={t('media.yield.revenue')} data={(y.data?.days ?? []).map((d, i) => ({ label: d.date.slice(5), value: d.revenueForecast, highlight: i === 0 }))} format={(v) => money(v)} />
          <table className={`${table.table} mt-3`}>
            <thead>
              <tr>
                <th className={table.th}>{t('media.yield.date')}</th>
                <th className={table.thRight}>{t('media.yield.occupancy')}</th>
                <th className={table.thRight}>{t('media.yield.demand')}</th>
                <th className={table.thRight}>{t('media.yield.revenue')}</th>
              </tr>
            </thead>
            <tbody>
              {(y.data?.days ?? []).map((d) => (
                <tr key={d.date}>
                  <td className={table.td}>{d.date}</td>
                  <td className={table.tdRight}>{d.occupancyPct.toFixed(1)}%</td>
                  <td className={table.tdRight}>x{d.demandFactor}</td>
                  <td className={table.tdRight}>{money(d.revenueForecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={t('media.yield.premium')}>
          <table className={table.table}>
            <thead>
              <tr>
                <th className={table.th}>{t('media.yield.slot')}</th>
                <th className={table.thRight}>{t('media.yield.pax')}</th>
                <th className={table.thRight}>{t('media.yield.perHour')}</th>
                <th className={table.thRight}>{t('media.yield.perPlay')}</th>
              </tr>
            </thead>
            <tbody>
              {(y.data?.premiumSlots ?? []).map((p) => (
                <tr key={`${p.screenId}-${p.hour}`}>
                  <td className={table.td}>
                    <div className="font-medium">{p.zoneName}</div>
                    <div className="text-xs text-muted">
                      {p.screenId} · {String(p.hour).padStart(2, '0')}:00
                    </div>
                  </td>
                  <td className={table.tdRight}>{count(p.predictedPax)}</td>
                  <td className={table.tdRight}>{money(p.pricePerScreenHour)}</td>
                  <td className={table.tdRight}>{money(p.pricePerPlay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

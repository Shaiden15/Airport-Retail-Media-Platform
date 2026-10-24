import type { Campaign } from '@dwellcast/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Empty, table } from '../../components/ui.tsx';
import { money } from '../../lib/format.ts';
import { CampaignBuilder } from './CampaignBuilder.tsx';

const STATUS_TONE: Readonly<Record<string, 'good' | 'warn' | 'bad' | 'info' | 'neutral'>> = {
  active: 'good',
  approved: 'good',
  'pending-approval': 'warn',
  paused: 'neutral',
  rejected: 'bad',
  completed: 'info',
  draft: 'neutral',
};

// Campaign list with status and budget pacing; opens the builder to create, edit or run again
export function RetailerCampaigns({ advertiserId }: { advertiserId: string }) {
  const { t } = useTranslation();
  const { data, reload } = useApi<Campaign[]>(`/api/campaigns?advertiserId=${encodeURIComponent(advertiserId)}`);
  const live = useApi<{ campaigns: { id: string; spend: number }[] }>(`/api/retailer/${encodeURIComponent(advertiserId)}/live`);
  const [editing, setEditing] = useState<Campaign | null | 'new'>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const spentToday = new Map((live.data?.campaigns ?? []).map((c) => [c.id, c.spend]));

  const act = async (work: () => Promise<Campaign>, message: string) => {
    const c = await work();
    setNotice(`${message}: ${c.name}`);
    reload();
  };

  if (editing) {
    return (
      <div className="p-6">
        <CampaignBuilder
          advertiserId={advertiserId}
          campaign={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(c) => {
            setEditing(null);
            setNotice(t('retailer.campaigns.submitted', { name: c.name }));
            reload();
          }}
        />
      </div>
    );
  }

  const campaigns = [...(data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <div className="p-6">
      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700" role="status" data-testid="campaign-notice">
          {notice}
        </div>
      )}
      <Card
        title={t('retailer.campaigns.title')}
        actions={
          <Button variant="primary" onClick={() => setEditing('new')} testId="new-campaign">
            {t('retailer.campaigns.new')}
          </Button>
        }
        testId="campaign-list"
      >
        {campaigns.length === 0 ? (
          <Empty>{t('retailer.campaigns.none')}</Empty>
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead>
                <tr>
                  <th className={table.th}>{t('retailer.campaigns.campaign')}</th>
                  <th className={table.th}>{t('retailer.campaigns.status')}</th>
                  <th className={table.th}>{t('retailer.campaigns.pacing')}</th>
                  <th className={table.thRight}>{t('retailer.campaigns.budget')}</th>
                  <th className={table.th} />
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const today = spentToday.get(c.id) ?? 0;
                  const pace = c.budget.dailyCap > 0 ? Math.min(1, today / c.budget.dailyCap) : 0;
                  return (
                    <tr key={c.id}>
                      <td className={table.td}>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted">
                          {c.schedule.start.slice(0, 10)} to {c.schedule.end.slice(0, 10)} · {c.schedule.dailyHours.from}:00-{c.schedule.dailyHours.to}:00
                        </div>
                      </td>
                      <td className={table.td}>
                        <Badge tone={new Map(Object.entries(STATUS_TONE)).get(c.status) ?? 'neutral'}>{t(`campaign.status.${c.status}`)}</Badge>
                      </td>
                      <td className={table.td}>
                        <div className="h-2 w-32 rounded-full bg-muted/15">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(pace * 100)}%` }} />
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {money(today)} / {money(c.budget.dailyCap)}
                        </div>
                      </td>
                      <td className={table.tdRight}>
                        {money(c.budget.spent, 'USD', true)} / {money(c.budget.total, 'USD', true)}
                      </td>
                      <td className={table.td}>
                        <div className="flex flex-wrap justify-end gap-1">
                          {c.status !== 'completed' && <Button variant="ghost" onClick={() => setEditing(c)}>{t('shell.common.edit')}</Button>}
                          {c.status === 'active' && <Button variant="ghost" onClick={() => void act(() => api.post<Campaign>(`/api/campaigns/${c.id}/status`, { status: 'paused' }), t('retailer.campaigns.paused'))}>{t('retailer.campaigns.pause')}</Button>}
                          {c.status === 'paused' && c.brandSafety.checked && <Button variant="ghost" onClick={() => void act(() => api.post<Campaign>(`/api/campaigns/${c.id}/status`, { status: 'active' }), t('retailer.campaigns.resumed'))}>{t('retailer.campaigns.resume')}</Button>}
                          <Button variant="ghost" onClick={() => void act(() => api.post<Campaign>(`/api/campaigns/${c.id}/duplicate`), t('retailer.campaigns.copied'))} testId={`run-again-${c.id}`}>
                            {t('retailer.campaigns.runAgain')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

import type { Campaign, Creative } from '@dwellcast/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import { useApi } from '../../app/useApi.ts';
import { Badge, Button, Card, Check, Empty, table } from '../../components/ui.tsx';
import { hhmm, money } from '../../lib/format.ts';
import { CreativeView } from '../passenger/Creative.tsx';

interface Approvals {
  pending: { campaign: Campaign; advertiser: string; creatives: Creative[] }[];
  recent: { campaignId: string; campaignName: string; decision: string; notes: string; reviewer: string; reviewedAt: string }[];
}

const CHECKS = ['noCompetitorMarks', 'claimsSubstantiated', 'ageAppropriate', 'translationChecked', 'legibleAtDistance'] as const;
type Checklist = Record<(typeof CHECKS)[number], boolean>;
const EMPTY: Checklist = { noCompetitorMarks: false, claimsSubstantiated: false, ageAppropriate: false, translationChecked: false, legibleAtDistance: false };

function ReviewCard({ item, onDone }: { item: Approvals['pending'][number]; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const [checks, setChecks] = useState<Checklist>(EMPTY);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const c = item.campaign;
  const checkMap = new Map(Object.entries(checks));
  const allPass = CHECKS.every((k) => checkMap.get(k) === true);

  const review = async (decision: 'approved' | 'rejected') => {
    setError(null);
    try {
      await api.post(`/api/media/approvals/${c.id}`, { decision, checklist: checks, notes });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Card title={c.name} actions={<Badge tone="warn">{t('media.approvals.pending')}</Badge>} testId={`review-${c.id}`}>
      <div className="grid gap-4 md:grid-cols-[10rem_1fr]">
        <div className="aspect-[9/16] w-40 overflow-hidden rounded-lg border-4 border-black">
          {item.creatives.at(0) && (
            <div className="h-[200%] w-[200%] origin-top-left scale-50">
              <CreativeView creative={item.creatives[0] as Creative} locale={i18n.language} advertiser={item.advertiser} discountPct={c.offer.discountPct} portrait />
            </div>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-muted">
            {item.advertiser} · {c.category} · {money(c.budget.total)} · {c.schedule.start.slice(0, 10)} to {c.schedule.end.slice(0, 10)}
          </div>
          <div className="text-xs text-muted">{t('media.approvals.targeting', { weights: Object.entries(c.targeting.segmentWeights).map(([k, v]) => `${k} ${v}`).join(', ') || '-', zones: c.targeting.placement.zoneIds.length || t('media.approvals.anywhere') })}</div>
          <fieldset className="space-y-1 rounded-lg bg-muted/10 p-3">
            <legend className="px-1 text-xs font-semibold text-muted">{t('media.approvals.checklist')}</legend>
            {CHECKS.map((k) => (
              <Check key={k} checked={checkMap.get(k) === true} onChange={(v) => setChecks({ ...checks, [k]: v })} label={t(`media.approvals.check.${k}`)} testId={`check-${k}`} />
            ))}
          </fieldset>
          <textarea className="w-full rounded-md border border-muted/30 bg-surface px-2 py-1.5 text-sm" rows={2} placeholder={t('media.approvals.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('media.approvals.notes')} maxLength={500} />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2">
            <Button variant="primary" disabled={!allPass} onClick={() => void review('approved')} testId={`approve-${c.id}`}>
              {t('media.approvals.approve')}
            </Button>
            <Button variant="danger" onClick={() => void review('rejected')}>
              {t('media.approvals.reject')}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

// Approval queue: every new or edited campaign passes a brand-safety checklist before it can play
export function MediaApprovals() {
  const { t } = useTranslation();
  const { data, reload } = useApi<Approvals>('/api/media/approvals');
  return (
    <div className="grid gap-6 p-6 2xl:grid-cols-[2fr_1fr]">
      <div className="space-y-4" data-testid="approval-queue">
        {(data?.pending ?? []).length === 0 && <Empty>{t('media.approvals.none')}</Empty>}
        {(data?.pending ?? []).map((item) => (
          <ReviewCard key={item.campaign.id} item={item} onDone={reload} />
        ))}
      </div>
      <Card title={t('media.approvals.recent')}>
        <table className={table.table}>
          <tbody>
            {(data?.recent ?? []).map((r) => (
              <tr key={`${r.campaignId}-${r.reviewedAt}`}>
                <td className={table.td}>
                  <div className="font-medium">{r.campaignName}</div>
                  <div className="text-xs text-muted">
                    {r.reviewer} · {hhmm(r.reviewedAt)}
                  </div>
                  {r.notes && <div className="text-xs text-muted">{r.notes}</div>}
                </td>
                <td className={table.tdRight}>
                  <Badge tone={r.decision === 'approved' ? 'good' : 'bad'}>{r.decision}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

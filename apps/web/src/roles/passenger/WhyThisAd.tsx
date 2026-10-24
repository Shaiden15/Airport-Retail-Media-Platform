import { useTranslation } from 'react-i18next';
import type { Decision } from '../../api/types.ts';
import { pct } from '../../lib/format.ts';

function Bars({ title, shares, labels }: { title: string; shares: Record<string, number>; labels?: (k: string) => string }) {
  const entries = Object.entries(shares).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{title}</h4>
      <div className="space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7.5rem_1fr_3rem] items-center gap-2 text-sm">
            <span className="truncate text-white/80">{labels ? labels(k) : k}</span>
            <span className="h-2 rounded-full bg-white/10">
              <span className="block h-2 rounded-full bg-teal-400" style={{ width: `${Math.round(v * 100)}%` }} />
            </span>
            <span className="text-right tabular-nums text-white/80">{pct(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Audience-related filter reasons explain the decision best, so they are listed before housekeeping ones
const REASON_ORDER = ['placement', 'destination', 'domestic-international', 'dwell', 'min-crowd', 'trigger-not-active', 'budget', 'stock', 'schedule', 'approval', 'brand-safety', 'status'];
const reasonRank = (reason: string | null) => {
  const i = REASON_ORDER.indexOf(reason ?? '');
  return i === -1 ? REASON_ORDER.length : i;
};

const SOURCE_STYLE: Readonly<Record<Decision['source'], string>> = {
  'agent-verified': 'bg-emerald-500/20 text-emerald-300',
  'rule-based': 'bg-sky-500/20 text-sky-300',
  'delay-goodwill': 'bg-amber-500/20 text-amber-300',
  'airline-priority': 'bg-indigo-500/20 text-indigo-300',
  'manual-pin': 'bg-fuchsia-500/20 text-fuchsia-300',
  'house-default': 'bg-slate-500/20 text-slate-300',
};

// The audit view every role can open: crowd, top candidates with scores, the winning rule and the checks that allowed it
export function WhyThisAd({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const { t } = useTranslation();
  const crowd = decision.crowd;
  const top = decision.candidates.filter((c) => c.breakdown).slice(0, 3);
  const filtered = decision.candidates
    .filter((c) => c.status === 'filtered')
    .sort((a, b) => reasonRank(a.reason) - reasonRank(b.reason))
    .slice(0, 5);
  const segmentLabel = (k: string) => t(`segment.label.${k}`, { defaultValue: k });
  const sourceStyle = new Map(Object.entries(SOURCE_STYLE)).get(decision.source) ?? '';

  return (
    <div className="absolute inset-0 z-30 overflow-y-auto overflow-x-hidden bg-slate-950/95 p-5 text-white backdrop-blur" role="dialog" aria-label={t('passenger.why.title')} data-testid="why-overlay">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold">{t('passenger.why.title')}</h3>
          <p className="text-xs text-white/50">{t('passenger.why.notice')}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20">
          {t('passenger.why.close')}
        </button>
      </div>

      <section className="mb-5 rounded-xl bg-white/5 p-4">
        <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-white/60">{t('passenger.why.rule')}</h4>
        <p className="text-lg font-semibold" data-testid="winning-rule">
          {decision.winningRule}
        </p>
        <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sourceStyle}`}>{decision.source}</span>
      </section>

      <section className="mb-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-2xl font-bold tabular-nums">{crowd.pax}</div>
          <div className="text-xs text-white/60">{t('passenger.why.pax')}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-2xl font-bold tabular-nums">{pct(crowd.internationalShare)}</div>
          <div className="text-xs text-white/60">{t('passenger.why.international')}</div>
        </div>
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-2xl font-bold tabular-nums">{t('passenger.why.minutes', { n: crowd.medianDwellMinutes })}</div>
          <div className="text-xs text-white/60">{t('passenger.why.dwell')}</div>
        </div>
      </section>

      <section className="mb-5 grid gap-5">
        <Bars title={t('passenger.why.purpose')} shares={crowd.tripPurpose} labels={segmentLabel} />
        <Bars title={t('passenger.why.party')} shares={crowd.party} labels={segmentLabel} />
      </section>

      <section className="mb-5">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t('passenger.why.candidates')}</h4>
        <div className="space-y-2" data-testid="top-candidates">
          {top.map((c, i) => (
            <div key={c.campaignId} className={`rounded-xl p-3 ${c.status === 'winner' ? 'bg-teal-500/20 ring-1 ring-teal-400' : 'bg-white/5'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {i + 1}. {c.name}
                </span>
                <span className="font-mono text-lg tabular-nums">{c.breakdown?.score.toFixed(2)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-white/70">
                <span>
                  {t('passenger.why.match')} {pct(c.breakdown?.match ?? 0)}
                </span>
                <span>
                  {t('passenger.why.boost')} x{c.breakdown?.boost}
                </span>
                {c.triggers.map((tr) => (
                  <span key={tr.kind} className="text-amber-300">
                    {tr.detail}
                  </span>
                ))}
                {c.reason && <span className="text-white/50">{c.reason}</span>}
              </div>
            </div>
          ))}
          {filtered.map((c) => (
            <div key={c.campaignId} className="flex justify-between rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs text-white/50">
              <span>{c.name}</span>
              <span>
                {t('passenger.why.filtered')}: {c.reason}
              </span>
            </div>
          ))}
        </div>
      </section>

      {decision.agent.validation && (
        <section className="mb-5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t('passenger.why.checks')}</h4>
          <ul className="space-y-1 text-sm" data-testid="validation-checks">
            {decision.agent.validation.checks.map((c) => (
              <li key={c.name} className="flex gap-2">
                <span className={c.passed ? 'text-emerald-400' : 'text-red-400'}>{c.passed ? 'PASS' : 'FAIL'}</span>
                <span className="font-medium">{c.name}</span>
                <span className="text-white/60">{c.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/60">{t('passenger.why.flights')}</h4>
        <ul className="space-y-1 text-sm">
          {crowd.flights.slice(0, 5).map((f) => (
            <li key={f.flightId} className="flex justify-between gap-2 text-white/80">
              <span>
                {f.label} {f.destination} gate {f.gate ?? '-'} {f.delayMinutes > 0 ? `+${f.delayMinutes} min` : ''}
              </span>
              <span className="tabular-nums">
                {f.pax} pax ({pct(f.share)})
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-white/40">
          {t('passenger.why.evidence')}: {decision.evidence.length} · {decision.modelVersion} · {decision.scoringVersion}
        </p>
      </section>
    </div>
  );
}

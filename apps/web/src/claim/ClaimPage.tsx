import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client.ts';
import type { OfferView } from '../api/types.ts';
import { countdown } from '../lib/format.ts';
import { applyPalette, theme } from '../theme/applyTheme.ts';

interface CodeStatus {
  code: string;
  expiresAt: string;
  expired: boolean;
  familyCode: string | null;
  simTime: string;
}

// The code lives only in this phone's browser so a refresh never mints a second one (no fingerprinting, no account)
const storageKey = (token: string) => `dwellcast.claim.${token.slice(-24)}`;
const readStored = (token: string): string | null => {
  try {
    return window.localStorage.getItem(storageKey(token));
  } catch {
    return null;
  }
};
const writeStored = (token: string, code: string) => {
  try {
    window.localStorage.setItem(storageKey(token), code);
  } catch {
    // Private browsing can block storage; the claim still works for this visit
  }
};

function CodeBox({ label, code }: { label: string; code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-center">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</div>
      <div className="my-2 font-mono text-4xl font-black tracking-[0.2em]" data-testid="claim-code">
        {code}
      </div>
      <button
        type="button"
        className="text-sm font-medium text-primary"
        onClick={() => {
          void navigator.clipboard?.writeText(code).then(() => setCopied(true));
        }}
      >
        {copied ? t('claim.page.copied') : t('claim.page.copy')}
      </button>
    </div>
  );
}

export function ClaimPage() {
  const { t, i18n } = useTranslation();
  const { token = '' } = useParams();
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [status, setStatus] = useState<CodeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simNow, setSimNow] = useState<string | null>(null);

  useEffect(() => applyPalette('light'), []);

  const refreshStatus = useCallback(async (code: string) => {
    const s = await api.get<CodeStatus>(`/api/codes/${code}`);
    setStatus(s);
    setSimNow(s.simTime);
  }, []);

  useEffect(() => {
    const stored = readStored(token);
    api
      .get<OfferView>(`/api/claim/${token}`)
      .then((o) => {
        setOffer(o);
        setSimNow(o.simTime);
      })
      .catch((e: unknown) => {
        setError(e instanceof ApiError && e.status === 410 ? t('claim.page.expired') : t('claim.page.invalid'));
      });
    const first = stored ? window.setTimeout(() => void refreshStatus(stored).catch(() => undefined), 0) : undefined;
    return () => window.clearTimeout(first);
  }, [token, t, refreshStatus]);

  useEffect(() => {
    if (!status) return;
    const timer = window.setInterval(() => void refreshStatus(status.code).catch(() => undefined), 3000);
    return () => window.clearInterval(timer);
  }, [status, refreshStatus]);

  const claim = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ code: string }>(`/api/claim/${token}`);
      writeStored(token, r.code);
      await refreshStatus(r.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!status) return;
    const r = await api.post<{ code: string }>(`/api/codes/${status.code}/share`);
    await refreshStatus(status.code);
    const text = `${offer?.headline ?? ''}: ${r.code}`;
    if (navigator.share) await navigator.share({ title: theme.productName, text }).catch(() => undefined);
  };

  const creative = offer?.creative;
  const translation = creative ? new Map(Object.entries(creative.translations)).get(i18n.language) : undefined;
  const headline = translation?.headline ?? offer?.headline ?? '';
  const accent = creative?.content.accentColor ?? '#0f766e';

  return (
    <div className="min-h-screen bg-bg px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-bold text-bg">{theme.logoText}</span>
            <span className="font-semibold">{theme.productName}</span>
          </div>
          <select className="rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm" value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} aria-label="Language">
            <option value="en">EN</option>
            <option value="hi">HI</option>
          </select>
        </div>

        {error && !offer && (
          <div className="rounded-2xl bg-surface p-6 text-center shadow" role="alert" data-testid="claim-error">
            <p className="text-lg font-semibold">{error}</p>
          </div>
        )}

        {offer && (
          <div className="overflow-hidden rounded-2xl bg-surface shadow-lg">
            <div className="p-6 text-white" style={{ background: `linear-gradient(135deg, ${accent}, #0b1220)` }}>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/80">{offer.advertiser}</div>
              <h1 className="mt-2 text-3xl font-black leading-tight" data-testid="claim-headline">
                {headline}
              </h1>
              {offer.linkedFlight && <p className="mt-2 text-sm text-white/80">{t('claim.page.flight', { flight: offer.linkedFlight.flight, destination: offer.linkedFlight.destination })}</p>}
            </div>
            <div className="space-y-4 p-6">
              {offer.outlet && <p className="text-sm text-muted">{t('claim.page.outlet', { outlet: offer.outlet.name })}</p>}
              {!status && (
                <button type="button" disabled={busy} onClick={() => void claim()} className="w-full rounded-xl bg-primary py-4 text-lg font-bold text-bg disabled:opacity-60" data-testid="claim-button">
                  {busy ? t('claim.page.claiming') : t('claim.page.claim')}
                </button>
              )}
              {status && (
                <>
                  {status.expired ? (
                    <p className="rounded-xl bg-red-50 p-4 text-center font-semibold text-red-700">{t('claim.page.expired')}</p>
                  ) : (
                    <>
                      <CodeBox label={t('claim.page.yourCode')} code={status.code} />
                      <p className="text-center text-sm text-muted">{t('claim.page.showAtTill')}</p>
                      <p className="text-center text-sm">
                        {t('claim.page.validUntil')} <span className="font-mono font-semibold tabular-nums">{countdown(status.expiresAt, simNow)}</span>
                      </p>
                    </>
                  )}
                  {status.familyCode ? (
                    <CodeBox label={t('claim.page.familyCode')} code={status.familyCode} />
                  ) : (
                    offer.familyShare &&
                    !status.expired && (
                      <button type="button" onClick={() => void share()} className="w-full rounded-xl border-2 border-primary py-3 font-semibold text-primary" data-testid="share-button">
                        {t('claim.page.share')}
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted">{t('claim.page.privacy')}</p>
      </div>
    </div>
  );
}

import type { Creative } from '@dwellcast/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client.ts';
import type { Offer, ScreenDetail } from '../../api/types.ts';
import { QrCode } from '../../components/QrCode.tsx';
import { countdown, hhmm } from '../../lib/format.ts';
import { useLive, useLiveEvent } from '../../live/LiveProvider.tsx';
import { CreativeView, HouseView } from './Creative.tsx';
import { WhyThisAd } from './WhyThisAd.tsx';

const STATUS_STYLE: Readonly<Record<string, string>> = {
  boarding: 'text-emerald-300',
  'final-call': 'text-amber-300',
  delayed: 'text-red-300',
  'gate-closed': 'text-slate-400',
  cancelled: 'text-red-400',
};

function useScreen(screenId: string) {
  const [detail, setDetail] = useState<ScreenDetail | null>(null);
  const [creative, setCreative] = useState<Creative | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);

  const fetchAll = useCallback(async () => {
    const d = await api.get<ScreenDetail>(`/api/screens/${encodeURIComponent(screenId)}`);
    setDetail(d);
    const winner = d.decision?.winner;
    if (!winner) {
      setCreative(null);
      setOffer(null);
      return;
    }
    const [c, o] = await Promise.all([
      api.get<Creative>(`/api/creatives/${encodeURIComponent(winner.creativeId)}`),
      api.get<Offer>(`/api/offers/screen/${encodeURIComponent(screenId)}`).catch(() => null),
    ]);
    setCreative(c);
    setOffer(o);
  }, [screenId]);

  // A failed refresh keeps the last good frame; the next poll or live event retries
  const load = useCallback(() => fetchAll().catch(() => undefined), [fetchAll]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 4000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  useLiveEvent('decision', (batch) => {
    if (batch.some((d) => d.screenId === screenId)) void load();
  });
  useLiveEvent('screen', (e) => {
    if (e.screenId === screenId) void load();
  });

  return { detail, creative, offer };
}

// What a traveller sees on one physical screen: the chosen ad, a scan-to-claim QR and nearby departures
export function ScreenPlayer({ screenId, fill = false }: { screenId: string; fill?: boolean }) {
  const { t, i18n } = useTranslation();
  const { clock } = useLive();
  const { detail, creative, offer } = useScreen(screenId);
  const [why, setWhy] = useState(false);

  if (!detail) return <div className="grid h-full place-items-center text-muted">{t('passenger.screen.loading')}</div>;
  const portrait = detail.screen.orientation === 'portrait';
  const offline = detail.screen.status === 'offline';
  const decision = detail.decision;
  const frame = portrait ? 'aspect-[9/16]' : 'aspect-video';
  const size = fill ? 'h-full max-h-full' : portrait ? 'h-[min(78vh,980px)]' : 'w-full max-w-5xl';

  return (
    <div className={`relative mx-auto ${frame} ${size} overflow-hidden rounded-2xl border-8 border-black bg-black shadow-2xl`} data-testid="screen-frame" data-screen={screenId}>
      {offline ? (
        <div className="grid h-full place-items-center bg-black text-xl text-slate-500">{t('passenger.screen.offline')}</div>
      ) : (
        <div className={`flex h-full ${portrait ? 'flex-col' : 'flex-row'}`}>
          <div className="relative min-h-0 flex-1">
            {creative && decision?.winner ? (
              <CreativeView creative={creative} locale={i18n.language} advertiser={decision.winner.advertiser} discountPct={offer?.discountPct ?? 0} portrait={portrait} />
            ) : (
              <HouseView title={t('passenger.screen.houseTitle')} subtitle={t('passenger.screen.houseSubtitle')} />
            )}
            {offer && !portrait && (
              <div className="absolute bottom-6 right-6 flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-black shadow-2xl" data-testid="qr-card">
                <QrCode value={offer.url} size={150} label={t('passenger.screen.scanToClaim')} />
                <span className="text-sm font-bold">{t('passenger.screen.scanToClaim')}</span>
                <span className="font-mono text-lg font-semibold tabular-nums" data-testid="qr-countdown">
                  {countdown(offer.expiresAt, clock?.simTime)}
                </span>
                {offer.linkedFlight && <span className="max-w-[9rem] text-center text-[11px] leading-tight text-slate-600">{t('passenger.screen.boardingFor', { flight: offer.linkedFlight })}</span>}
              </div>
            )}
            {decision && !portrait && (
              <button type="button" onClick={() => setWhy(true)} className="absolute bottom-6 left-6 rounded-full bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/80" data-testid="why-button">
                {t('passenger.screen.whyThisAd')}
              </button>
            )}
          </div>
          {portrait && (decision || offer) && (
            <div className="flex shrink-0 items-center gap-3 bg-white px-4 py-3 text-black" data-testid="offer-strip">
              {offer && (
                <div data-testid="qr-card">
                  <QrCode value={offer.url} size={96} label={t('passenger.screen.scanToClaim')} />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {offer && (
                  <>
                    <div className="text-sm font-bold">{t('passenger.screen.scanToClaim')}</div>
                    <div className="font-mono text-2xl font-semibold tabular-nums" data-testid="qr-countdown">
                      {countdown(offer.expiresAt, clock?.simTime)}
                    </div>
                    {offer.linkedFlight && <div className="truncate text-xs text-slate-600">{t('passenger.screen.boardingFor', { flight: offer.linkedFlight })}</div>}
                  </>
                )}
              </div>
              {decision && (
                <button type="button" onClick={() => setWhy(true)} className="shrink-0 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700" data-testid="why-button">
                  {t('passenger.screen.whyThisAd')}
                </button>
              )}
            </div>
          )}
          <aside className={`${portrait ? '' : 'w-[30%]'} shrink-0 bg-slate-950 px-4 py-3 text-white`} data-testid="fids">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-amber-300">{t('passenger.screen.departures')}</h3>
              <span className="font-mono text-sm tabular-nums text-white/70">{hhmm(clock?.simTime)}</span>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase text-white/40">
                <tr>
                  <th className="font-medium">{t('passenger.screen.flight')}</th>
                  <th className="font-medium">{t('passenger.screen.to')}</th>
                  <th className="font-medium">{t('passenger.screen.time')}</th>
                  <th className="font-medium">{t('passenger.screen.gate')}</th>
                  <th className="font-medium">{t('passenger.screen.status')}</th>
                </tr>
              </thead>
              <tbody>
                {detail.nearbyFlights.slice(0, portrait ? 5 : 7).map((f) => (
                  <tr key={f.id} className="border-t border-white/5">
                    <td className="py-1 font-mono font-semibold">{f.flight}</td>
                    <td className="py-1">{f.destination}</td>
                    <td className="py-1 font-mono tabular-nums">
                      {f.delayMinutes > 0 ? (
                        <>
                          <s className="text-white/40">{hhmm(f.scheduledTime)}</s> <span className="text-red-300">{hhmm(f.estimatedTime)}</span>
                        </>
                      ) : (
                        hhmm(f.scheduledTime)
                      )}
                    </td>
                    <td className="py-1 font-mono">{f.gate}</td>
                    <td className={`py-1 text-xs capitalize ${new Map(Object.entries(STATUS_STYLE)).get(f.status) ?? 'text-white/70'}`}>{f.status.replace('-', ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>
        </div>
      )}
      {why && decision && <WhyThisAd decision={decision} onClose={() => setWhy(false)} />}
    </div>
  );
}

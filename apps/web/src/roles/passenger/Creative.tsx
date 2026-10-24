import type { Creative } from '@dwellcast/shared';

export interface CreativeProps {
  creative: Creative;
  locale: string;
  advertiser: string;
  discountPct: number;
  portrait: boolean;
}

function localised(creative: Creative, locale: string) {
  const t = new Map(Object.entries(creative.translations)).get(locale);
  return t ?? { headline: creative.content.headline, subline: creative.content.subline, cta: creative.content.cta };
}

function Pattern({ id, color }: { id: string; color: string }) {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-20" aria-hidden="true">
      <defs>
        <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
          <rect width="24" height="48" fill={color} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

function FlightPath() {
  return (
    <svg className="absolute inset-0 h-full w-full opacity-40" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-10 260 C 120 200, 220 80, 410 40" stroke="white" strokeWidth="2" strokeDasharray="6 8" fill="none" />
      <path d="M330 52 l22 -10 l-6 14 z" fill="white" />
    </svg>
  );
}

const TEMPLATE_BG: Readonly<Record<Creative['template'], (accent: string) => string>> = {
  'hero-offer': (a) => `linear-gradient(135deg, ${a} 0%, #0b1220 100%)`,
  'countdown-deal': (a) => `linear-gradient(160deg, #111827 0%, ${a} 140%)`,
  destination: (a) => `linear-gradient(180deg, #0ea5e9 0%, ${a} 100%)`,
  upgrade: () => 'linear-gradient(160deg, #0b1020 0%, #1e1b4b 60%, #3b2f0b 100%)',
  goodwill: () => 'linear-gradient(160deg, #78350f 0%, #b45309 60%, #f59e0b 100%)',
};

// Five ad templates rendered from structured creative data; text comes from the creative in the viewer's language
export function CreativeView({ creative, locale, advertiser, discountPct, portrait }: CreativeProps) {
  const text = localised(creative, locale);
  const accent = creative.content.accentColor;
  const background = new Map(Object.entries(TEMPLATE_BG)).get(creative.template)?.(accent) ?? TEMPLATE_BG['hero-offer'](accent);
  const big = portrait ? 'text-4xl' : 'text-6xl';
  // Leave room for the QR card and the why-this-ad button so they never cover the copy
  const reserve = portrait ? 'pb-8' : 'pr-56 pb-20';

  return (
    <div className={`relative flex h-full w-full flex-col justify-between overflow-hidden p-8 ${reserve} text-white`} style={{ background }} data-testid="creative" data-template={creative.template}>
      {creative.template === 'hero-offer' && <Pattern id={`p-${creative.id}`} color="#ffffff" />}
      {creative.template === 'countdown-deal' && <Pattern id={`c-${creative.id}`} color={accent} />}
      {creative.template === 'destination' && <FlightPath />}
      <div className="relative flex items-center justify-between">
        <span className="rounded-full bg-white/15 px-4 py-1 text-sm font-semibold uppercase tracking-widest">{advertiser}</span>
        {discountPct > 0 && discountPct < 100 && (
          <span className="grid h-24 w-24 place-items-center rounded-full bg-amber-400 text-center text-3xl font-black text-black shadow-xl">-{discountPct}%</span>
        )}
        {creative.template === 'upgrade' && <span className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">Premium</span>}
      </div>
      <div className="relative">
        <h2 className={`${big} font-black leading-tight drop-shadow-lg`}>{text.headline}</h2>
        <p className="mt-4 max-w-xl text-2xl font-medium text-white/85">{text.subline}</p>
        <span className="mt-6 inline-block rounded-full bg-white px-6 py-3 text-lg font-bold text-black">{text.cta}</span>
      </div>
    </div>
  );
}

export function HouseView({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-teal-900 p-8 text-center text-white" data-testid="house-content">
      <h2 className="text-4xl font-bold">{title}</h2>
      <p className="mt-4 max-w-lg text-xl text-white/80">{subtitle}</p>
    </div>
  );
}

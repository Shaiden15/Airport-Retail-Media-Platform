import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ROLES, roleTheme, type Role } from '@dwellcast/shared';
import type { PublicConfig } from '../api/types.ts';
import { availableLocales } from '../i18n/index.ts';
import { useLive } from '../live/LiveProvider.tsx';
import { applyPalette, theme } from '../theme/applyTheme.ts';
import { SimControlBar } from './SimControlBar.tsx';
import { useApi } from './useApi.ts';

interface Company {
  id: string;
  name: string;
}

// Sample companies come from the API; retailers and airlines each get their own switcher list
export function useCompanies(role: Role): Company[] {
  const advertisers = useApi<{ id: string; name: string; kind: string }[]>(role === 'retailer' ? '/api/advertisers' : null);
  const airlines = useApi<{ code: string; name: string }[]>(role === 'airline' ? '/api/airlines' : null);
  const config = useApi<PublicConfig>('/api/config/public');
  if (role === 'retailer') {
    const featured = config.data?.sampleCompanies.retailers ?? [];
    const list = (advertisers.data ?? []).filter((a) => a.kind !== 'airline').map((a) => ({ id: a.id, name: a.name }));
    return [...list.filter((c) => featured.includes(c.id)), ...list.filter((c) => !featured.includes(c.id))];
  }
  if (role === 'airline') {
    const featured = config.data?.sampleCompanies.airlines ?? [];
    const list = (airlines.data ?? []).map((a) => ({ id: a.code, name: a.name }));
    return [...list.filter((c) => featured.includes(c.id)), ...list.filter((c) => !featured.includes(c.id))];
  }
  return [];
}

export function useCompany(role: Role): string | null {
  const [params] = useSearchParams();
  const companies = useCompanies(role);
  return params.get('company') ?? companies.at(0)?.id ?? null;
}

function Header({ role }: { role: Role }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { connected } = useLive();
  const companies = useCompanies(role);
  const company = params.get('company') ?? companies.at(0)?.id ?? '';
  const select = 'rounded-md border border-muted/30 bg-surface px-2 py-1 text-sm';

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-muted/20 bg-surface px-6 py-3">
      <Link to="/admin" className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-bg">{theme.logoText}</span>
        <div>
          <div className="text-lg font-semibold leading-tight">{theme.productName}</div>
          <div className="text-xs text-muted">{theme.airportName}</div>
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-500' : 'text-amber-500'}`} data-testid="live-status">
          <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'}`} />
          {connected ? t('shell.header.live') : t('shell.header.offline')}
        </span>
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('shell.header.role')}</span>
          <select className={select} value={role} onChange={(e) => void navigate(`/${e.target.value}`)} aria-label={t('shell.header.role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.name.${r}`)}
              </option>
            ))}
          </select>
        </label>
        {companies.length > 0 && (
          <label className="flex items-center gap-2">
            <span className="text-muted">{t('shell.header.company')}</span>
            <select
              className={select}
              value={company}
              onChange={(e) => {
                params.set('company', e.target.value);
                setParams(params);
              }}
              aria-label={t('shell.header.company')}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('shell.header.language')}</span>
          <select className={select} value={i18n.language} onChange={(e) => void i18n.changeLanguage(e.target.value)} aria-label={t('shell.header.language')}>
            {availableLocales.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <Link to="/demo" className="rounded-md border border-primary/40 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">
          {t('shell.nav.splitDemo')}
        </Link>
      </div>
    </header>
  );
}

export function Shell({ role, children, defaultScreen }: { role: Role; children: ReactNode; defaultScreen?: string }) {
  useEffect(() => {
    applyPalette(roleTheme(role));
  }, [role]);

  return (
    <div className="flex min-h-full flex-col">
      <Header role={role} />
      <SimControlBar defaultScreen={defaultScreen} />
      <main className="flex-1">{children}</main>
    </div>
  );
}

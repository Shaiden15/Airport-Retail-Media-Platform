import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROLES, isRole, roleTheme, type Role } from '@dwellcast/shared';
import { applyPalette, theme } from './theme/applyTheme.ts';
import { availableLocales } from './i18n/index.ts';

function Header({ role }: { role: Role }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-muted/20 bg-surface px-6 py-3">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-bold text-bg">{theme.logoText}</span>
        <div>
          <div className="text-lg font-semibold">{theme.productName}</div>
          <div className="text-xs text-muted">{theme.airportName}</div>
        </div>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('shell.header.role')}</span>
          <select
            className="rounded-md border border-muted/30 bg-surface px-2 py-1"
            value={role}
            onChange={(event) => void navigate(`/${event.target.value}`)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.name.${r}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('shell.header.language')}</span>
          <select
            className="rounded-md border border-muted/30 bg-surface px-2 py-1"
            value={i18n.language}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            {availableLocales.map((code) => (
              <option key={code} value={code}>
                {code.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

function RoleWorkspace() {
  const { role = '' } = useParams();
  const { t } = useTranslation();
  const valid = isRole(role);

  useEffect(() => {
    if (valid) applyPalette(roleTheme(role));
  }, [role, valid]);

  if (!valid) return <Navigate to="/admin" replace />;

  return (
    <div className="flex min-h-full flex-col">
      <Header role={role} />
      <main className="flex-1 p-8">
        <h1 className="text-2xl font-semibold">{t(`roles.name.${role}`)}</h1>
        <p className="mt-2 text-muted">{t(`roles.intro.${role}`)}</p>
        <p className="mt-8 rounded-lg border border-dashed border-muted/40 p-6 text-muted">{t('shell.workspace.comingSoon')}</p>
      </main>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/:role" element={<RoleWorkspace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

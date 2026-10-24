import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { isRole } from '@dwellcast/shared';
import { Shell } from './app/Shell.tsx';
import { ClaimPage } from './claim/ClaimPage.tsx';
import { LiveProvider } from './live/LiveProvider.tsx';
import { PassengerPage } from './roles/passenger/PassengerPage.tsx';
import { KioskScreen } from './roles/passenger/KioskScreen.tsx';
import { RetailerPage } from './roles/retailer/RetailerPage.tsx';
import { SplitDemo } from './roles/demo/SplitDemo.tsx';

function Placeholder({ role }: { role: 'admin' | 'media' | 'airline' }) {
  const { t } = useTranslation();
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">{t(`roles.name.${role}`)}</h1>
      <p className="mt-2 text-muted">{t(`roles.intro.${role}`)}</p>
      <p className="mt-8 rounded-lg border border-dashed border-muted/40 p-6 text-muted">{t('shell.workspace.comingSoon')}</p>
    </div>
  );
}

function RoleRoute() {
  const { role = '' } = useParams();
  if (!isRole(role)) return <Navigate to="/admin" replace />;
  if (role === 'passenger') return <PassengerPage />;
  return <Shell role={role}>{role === 'retailer' ? <RetailerPage /> : <Placeholder role={role} />}</Shell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/c/:token" element={<ClaimPage />} />
      <Route path="*" element={<LiveRoutes />} />
    </Routes>
  );
}

// Everything except the phone claim page shares one live connection
function LiveRoutes() {
  return (
    <LiveProvider>
      <Routes>
        <Route path="/screen/:screenId" element={<KioskScreen />} />
        <Route path="/demo" element={<SplitDemo />} />
        <Route path="/:role" element={<RoleRoute />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </LiveProvider>
  );
}

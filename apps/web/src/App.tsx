import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { isRole } from '@dwellcast/shared';
import { Shell } from './app/Shell.tsx';
import { ClaimPage } from './claim/ClaimPage.tsx';
import { LiveProvider } from './live/LiveProvider.tsx';
import { AdminArea } from './roles/admin/AdminArea.tsx';
import { AirlineArea } from './roles/airline/AirlineArea.tsx';
import { SplitDemo } from './roles/demo/SplitDemo.tsx';
import { MediaArea } from './roles/media/MediaArea.tsx';
import { KioskScreen } from './roles/passenger/KioskScreen.tsx';
import { PassengerPage } from './roles/passenger/PassengerPage.tsx';
import { RetailerArea } from './roles/retailer/RetailerArea.tsx';

function RoleRoute() {
  const { role = '' } = useParams();
  if (!isRole(role)) return <Navigate to="/admin" replace />;
  if (role === 'passenger') return <PassengerPage />;
  const area = role === 'admin' ? <AdminArea /> : role === 'retailer' ? <RetailerArea /> : role === 'media' ? <MediaArea /> : <AirlineArea />;
  return <Shell role={role}>{area}</Shell>;
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
        <Route path="/:role/*" element={<RoleRoute />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </LiveProvider>
  );
}

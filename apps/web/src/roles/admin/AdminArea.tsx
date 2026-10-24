import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { SubNav } from '../../components/ui.tsx';
import { AdminDashboard } from './AdminDashboard.tsx';
import { AdminIncidents } from './AdminIncidents.tsx';
import { AdminMasterData } from './AdminMasterData.tsx';
import { AdminRules } from './AdminRules.tsx';

export function AdminArea() {
  const { t } = useTranslation();
  return (
    <>
      <SubNav
        items={[
          { to: '/admin', label: t('admin.nav.dashboard'), end: true },
          { to: '/admin/incidents', label: t('admin.nav.incidents') },
          { to: '/admin/master', label: t('admin.nav.master') },
          { to: '/admin/rules', label: t('admin.nav.rules') },
        ]}
      />
      <Routes>
        <Route index element={<AdminDashboard />} />
        <Route path="incidents" element={<AdminIncidents />} />
        <Route path="master" element={<AdminMasterData />} />
        <Route path="rules" element={<AdminRules />} />
      </Routes>
    </>
  );
}

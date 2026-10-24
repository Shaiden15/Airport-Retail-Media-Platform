import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { SubNav } from '../../components/ui.tsx';
import { MediaApprovals } from './MediaApprovals.tsx';
import { MediaAudience } from './MediaAudience.tsx';
import { MediaDashboard } from './MediaDashboard.tsx';
import { MediaInventory } from './MediaInventory.tsx';

export function MediaArea() {
  const { t } = useTranslation();
  return (
    <>
      <SubNav
        items={[
          { to: '/media', label: t('media.nav.dashboard'), end: true },
          { to: '/media/inventory', label: t('media.nav.inventory') },
          { to: '/media/approvals', label: t('media.nav.approvals') },
          { to: '/media/audience', label: t('media.nav.audience') },
        ]}
      />
      <Routes>
        <Route index element={<MediaDashboard />} />
        <Route path="inventory" element={<MediaInventory />} />
        <Route path="approvals" element={<MediaApprovals />} />
        <Route path="audience" element={<MediaAudience />} />
      </Routes>
    </>
  );
}

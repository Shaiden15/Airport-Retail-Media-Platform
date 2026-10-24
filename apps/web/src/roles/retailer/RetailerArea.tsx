import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { useCompany } from '../../app/Shell.tsx';
import { SubNav } from '../../components/ui.tsx';
import { CreativeLibrary } from './CreativeLibrary.tsx';
import { RetailerCampaigns } from './RetailerCampaigns.tsx';
import { RetailerDashboard } from './RetailerDashboard.tsx';
import { RetailerInsights } from './RetailerInsights.tsx';

export function RetailerArea() {
  const { t } = useTranslation();
  const advertiserId = useCompany('retailer');
  return (
    <>
      <SubNav
        items={[
          { to: '/retailer', label: t('retailer.nav.dashboard'), end: true },
          { to: '/retailer/campaigns', label: t('retailer.nav.campaigns') },
          { to: '/retailer/creatives', label: t('retailer.nav.creatives') },
          { to: '/retailer/insights', label: t('retailer.nav.insights') },
        ]}
      />
      {advertiserId && (
        <Routes>
          <Route index element={<RetailerDashboard advertiserId={advertiserId} />} />
          <Route path="campaigns" element={<RetailerCampaigns key={advertiserId} advertiserId={advertiserId} />} />
          <Route path="creatives" element={<CreativeLibrary key={advertiserId} advertiserId={advertiserId} />} />
          <Route path="insights" element={<RetailerInsights key={advertiserId} advertiserId={advertiserId} />} />
        </Routes>
      )}
    </>
  );
}

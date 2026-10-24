import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { useCompany } from '../../app/Shell.tsx';
import { SubNav } from '../../components/ui.tsx';
import { AirlineDashboard } from './AirlineDashboard.tsx';
import { AirlineGoodwill } from './AirlineGoodwill.tsx';
import { AirlineMessaging } from './AirlineMessaging.tsx';
import { AirlinePartners } from './AirlinePartners.tsx';

export function AirlineArea() {
  const { t } = useTranslation();
  const airlineCode = useCompany('airline');
  return (
    <>
      <SubNav
        items={[
          { to: '/airline', label: t('airline.nav.flights'), end: true },
          { to: '/airline/messaging', label: t('airline.nav.messaging') },
          { to: '/airline/goodwill', label: t('airline.nav.goodwill') },
          { to: '/airline/partners', label: t('airline.nav.partners') },
        ]}
      />
      {airlineCode && (
        <Routes>
          <Route index element={<AirlineDashboard key={airlineCode} airlineCode={airlineCode} />} />
          <Route path="messaging" element={<AirlineMessaging key={airlineCode} airlineCode={airlineCode} />} />
          <Route path="goodwill" element={<AirlineGoodwill key={airlineCode} airlineCode={airlineCode} />} />
          <Route path="partners" element={<AirlinePartners key={airlineCode} airlineCode={airlineCode} />} />
        </Routes>
      )}
    </>
  );
}

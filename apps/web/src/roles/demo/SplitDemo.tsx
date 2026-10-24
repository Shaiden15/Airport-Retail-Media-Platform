import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Shell } from '../../app/Shell.tsx';
import { DEFAULT_SCREEN } from '../passenger/PassengerPage.tsx';
import { ScreenPicker } from '../passenger/ScreenPicker.tsx';
import { ScreenPlayer } from '../passenger/ScreenPlayer.tsx';
import { AdminDashboard } from '../admin/AdminDashboard.tsx';
import { AirlineDashboard } from '../airline/AirlineDashboard.tsx';
import { MediaDashboard } from '../media/MediaDashboard.tsx';
import { RetailerLiveDashboard } from '../retailer/RetailerPage.tsx';

const RIGHT_ROLES = ['retailer', 'admin', 'media', 'airline'] as const;
type RightRole = (typeof RIGHT_ROLES)[number];

// Demo mode: the passenger screen on the left, any role dashboard on the right, one shared clock
export function SplitDemo() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const screenId = params.get('screen') ?? DEFAULT_SCREEN;
  const rightParam = params.get('right') ?? 'retailer';
  const right: RightRole = (RIGHT_ROLES as readonly string[]).includes(rightParam) ? (rightParam as RightRole) : 'retailer';
  const company = params.get('company') ?? 'adv-aurelle';
  const update = (key: string, value: string) => {
    params.set(key, value);
    setParams(params);
  };

  return (
    <Shell role={right === 'retailer' ? 'retailer' : right} defaultScreen={screenId}>
      <div className="flex flex-wrap items-center gap-4 border-b border-muted/10 px-6 py-2 text-sm">
        <span className="font-semibold">{t('demo.split.title')}</span>
        <ScreenPicker value={screenId} onChange={(id) => update('screen', id)} />
        <label className="flex items-center gap-2">
          <span className="text-muted">{t('demo.split.right')}</span>
          <select className="rounded-md border border-muted/30 bg-surface px-2 py-1" value={right} onChange={(e) => update('right', e.target.value)} aria-label={t('demo.split.right')}>
            {RIGHT_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.name.${r}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" data-testid="split-demo">
        <div className="flex items-start justify-center">
          <ScreenPlayer screenId={screenId} />
        </div>
        <div className="min-w-0">
          {right === 'retailer' && <RetailerLiveDashboard advertiserId={company} />}
          {right === 'admin' && <AdminDashboard />}
          {right === 'media' && <MediaDashboard />}
          {right === 'airline' && <AirlineDashboard airlineCode={params.get('airline') ?? 'XH'} />}
        </div>
      </div>
    </Shell>
  );
}

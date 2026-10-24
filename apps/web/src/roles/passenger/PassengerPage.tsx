import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Shell } from '../../app/Shell.tsx';
import { ScreenPicker } from './ScreenPicker.tsx';
import { ScreenPlayer } from './ScreenPlayer.tsx';

export const DEFAULT_SCREEN = 'SCR-052';

export function PassengerPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const screenId = params.get('screen') ?? DEFAULT_SCREEN;

  return (
    <Shell role="passenger" defaultScreen={screenId}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
        <ScreenPicker
          value={screenId}
          onChange={(id) => {
            params.set('screen', id);
            setParams(params);
          }}
        />
        <Link to={`/screen/${encodeURIComponent(screenId)}`} target="_blank" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t('shell.nav.kiosk')}
        </Link>
      </div>
      <div className="px-6 pb-8">
        <ScreenPlayer screenId={screenId} />
      </div>
    </Shell>
  );
}

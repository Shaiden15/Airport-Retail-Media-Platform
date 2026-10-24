import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { applyPalette } from '../../theme/applyTheme.ts';
import { ScreenPlayer } from './ScreenPlayer.tsx';

// Full-screen view of one physical screen, as it would run on the display hardware
export function KioskScreen() {
  const { screenId = '' } = useParams();
  useEffect(() => applyPalette('dark'), []);
  return (
    <div className="grid h-screen place-items-center bg-black p-4">
      <ScreenPlayer screenId={screenId} fill />
    </div>
  );
}

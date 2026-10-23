import { parseTheme, type Palette } from '@dwellcast/shared';
import themeJson from '../../../../config/theme.json';

export const theme = parseTheme(themeJson);

export function applyPalette(mode: 'light' | 'dark'): void {
  const palette: Palette = mode === 'dark' ? theme.colors.dark : theme.colors.light;
  const root = document.documentElement;
  root.dataset.theme = mode;
  root.style.setProperty('--dc-primary', palette.primary);
  root.style.setProperty('--dc-accent', palette.accent);
  root.style.setProperty('--dc-background', palette.background);
  root.style.setProperty('--dc-surface', palette.surface);
  root.style.setProperty('--dc-text', palette.text);
  root.style.setProperty('--dc-muted', palette.muted);
}

import { readFileSync } from 'node:fs';
import { parseTheme, type Theme } from '@dwellcast/shared';

// Read at startup so operators can rebrand by editing config/theme.json without a rebuild
const THEME_FILE = new URL('../../../config/theme.json', import.meta.url);

export function loadTheme(): Theme {
  return parseTheme(JSON.parse(readFileSync(THEME_FILE, 'utf8')));
}

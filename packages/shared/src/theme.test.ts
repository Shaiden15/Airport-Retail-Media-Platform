import { describe, expect, it } from 'vitest';
import themeJson from '../../../config/theme.json';
import { parseTheme } from './theme.ts';
import { roleTheme, isRole } from './roles.ts';

describe('theme config', () => {
  it('ships a valid white-label theme', () => {
    const theme = parseTheme(themeJson);
    expect(theme.productName).toBe('Dwellcast');
    expect(theme.locales.default).not.toBe(theme.locales.secondary);
  });

  it('rejects malformed colours', () => {
    const broken = structuredClone(themeJson);
    broken.colors.light.primary = 'teal';
    expect(() => parseTheme(broken)).toThrow();
  });
});

describe('roles', () => {
  it('gives admin the dark control-room theme and business roles the light theme', () => {
    expect(roleTheme('admin')).toBe('dark');
    expect(roleTheme('retailer')).toBe('light');
    expect(roleTheme('media')).toBe('light');
    expect(roleTheme('airline')).toBe('light');
  });

  it('validates role names', () => {
    expect(isRole('media')).toBe(true);
    expect(isRole('root')).toBe(false);
  });
});

export const ROLES = ['admin', 'retailer', 'media', 'airline', 'passenger'] as const;
export type Role = (typeof ROLES)[number];
export type ThemeMode = 'dark' | 'light';

// Admin uses the dark control-room theme, business roles use the light theme
export function roleTheme(role: Role): ThemeMode {
  switch (role) {
    case 'admin':
    case 'passenger':
      return 'dark';
    case 'retailer':
    case 'media':
    case 'airline':
      return 'light';
  }
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const palette = z.object({
  primary: hexColor,
  accent: hexColor,
  background: hexColor,
  surface: hexColor,
  text: hexColor,
  muted: hexColor,
});

export const LOCALES = ['en', 'hi', 'ar', 'fr', 'es', 'zh'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const themeSchema = z.object({
  productName: z.string().min(1).max(40),
  tagline: z.string().max(120),
  logoText: z.string().min(1).max(3),
  airportName: z.string().min(1).max(80),
  currency: z.string().regex(/^[A-Z]{3}$/),
  locales: z.object({ default: localeSchema, secondary: localeSchema }),
  colors: z.object({ light: palette, dark: palette }),
});

export type Theme = z.infer<typeof themeSchema>;
export type Palette = z.infer<typeof palette>;

export function parseTheme(input: unknown): Theme {
  return themeSchema.parse(input);
}

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import hi from './locales/hi.json';
import { theme } from '../theme/applyTheme.ts';

export const resources = { en: { translation: en }, hi: { translation: hi } } as const;

export const availableLocales = [theme.locales.default, theme.locales.secondary].filter(
  (code) => Object.hasOwn(resources, code),
);

void i18n.use(initReactI18next).init({
  resources,
  lng: theme.locales.default,
  fallbackLng: 'en',
  interpolation: { escapeValue: true },
});

export default i18n;

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import sv from './locales/sv.json';

// Custom detector: manualen.nu domain → Swedish
const hostnameDetector = {
  name: 'hostname',
  lookup() {
    if (typeof window !== 'undefined' && window.location.hostname.includes('manualen.nu')) {
      return 'sv';
    }
    return undefined;
  },
};

const languageDetector = new LanguageDetector();
languageDetector.addDetector(hostnameDetector);

i18n
  .use(languageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      sv: { translation: sv },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['hostname', 'querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
  });

export default i18n;

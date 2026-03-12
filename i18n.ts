import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import sv from './locales/sv.json';

// Custom detector: domain determines language
// manualen.nu → Swedish, frameops.ai → English
const hostnameDetector = {
  name: 'hostname',
  lookup() {
    if (typeof window === 'undefined') return undefined;
    if (window.location.hostname.includes('manualen.nu')) return 'sv';
    if (window.location.hostname.includes('frameops.ai')) return 'en';
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
      // querystring first so ?lang=sv still works on frameops.ai
      // hostname second so domain always wins over stale localStorage
      order: ['querystring', 'hostname', 'navigator'],
      lookupQuerystring: 'lang',
      caches: [],
    },
  });

export default i18n;

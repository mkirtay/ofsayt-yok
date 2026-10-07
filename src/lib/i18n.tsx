import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { resolvePluralKey } from './i18nPlural';
import { BRAND_I18N_VARS, brandText } from '@/config/brand';

import { getNamespace, registerNamespace } from './i18nRegistry';
// Temel TR namespace'ler: her sayfada (header, alt menü, maç listesi, gündem paneli). Diğerleri sayfa chunk'ından
// (`lib/i18nNamespaces/*`), EN dil seçilince (`lib/i18nEnglish.ts`) — bkz. lib/i18nRegistry.ts.
import trCommon from '../../public/locales/tr/common.json';
import trNav from '../../public/locales/tr/nav.json';
import trMatch from '../../public/locales/tr/match.json';
import trLeagues from '../../public/locales/tr/leagues.json';
import trGundem from '../../public/locales/tr/gundem.json';

registerNamespace('tr', 'common', trCommon);
registerNamespace('tr', 'nav', trNav);
registerNamespace('tr', 'match', trMatch);
registerNamespace('tr', 'leagues', trLeagues);
registerNamespace('tr', 'gundem', trGundem);

let englishLoad: Promise<unknown> | null = null;
/** EN sözlükleri tek chunk; ikinci çağrı aynı promise'i döner. Hata olursa sonraki seçimde yeniden denenir. */
function loadEnglish(): Promise<unknown> {
  englishLoad ??= import('./i18nEnglish').catch((error) => {
    englishLoad = null;
    throw error;
  });
  return englishLoad;
}

type I18nContextType = {
  locale: string;
  setLocale: (locale: string) => void;
};

const I18nContext = createContext<I18nContextType>({ locale: 'tr', setLocale: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState('tr');

  useEffect(() => {
    const saved = localStorage.getItem('locale');
    // EN sözlük yüklenmeden dil değişmez: yarı TR yarı EN ekran olmasın (TR zaten varsayılan, SSR'da da TR).
    if (saved === 'en') void loadEnglish().then(() => setLocaleState('en'), () => {});
  }, []);

  /**
   * `<html lang>` aktif dile bağlanır (SSR'da `_document` "tr" basar, hidrasyondan sonra düzelir).
   * Sadece SEO/ekran okuyucu değil GÖRSEL bir etkisi de var: `text-transform: uppercase`, dilin
   * büyük harf kurallarını uygular — `lang="tr"` iken "Date of birth" → "DATE OF BİRTH" (noktalı İ).
   */
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: string) => {
    localStorage.setItem('locale', next);
    if (next === 'en') void loadEnglish().then(() => setLocaleState('en'), () => {});
    else setLocaleState(next);
  }, []);

  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

function resolve(obj: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function useTranslation(ns: string) {
  const { locale } = useContext(I18nContext);

  const t = useCallback(
    (key: string, opts?: Record<string, unknown>): string => {
      let namespace = ns;
      let actualKey = key;
      if (key.includes(':')) {
        const idx = key.indexOf(':');
        namespace = key.slice(0, idx);
        actualKey = key.slice(idx + 1);
      }
      const dict = getNamespace(locale, namespace) ?? getNamespace('tr', namespace) ?? {};
      const lookupKey = resolvePluralKey(actualKey, opts?.count, locale, (k) => resolve(dict, k) !== undefined);
      let value = resolve(dict, lookupKey) ?? actualKey;
      // Marka değişkenleri ({{brand}}, {{siteDomain}}, {{contactEmail}}) her zaman dolar; çağıranınki önce gelir.
      if (opts) {
        value = value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? BRAND_I18N_VARS[k] ?? ''));
      } else {
        value = brandText(value);
      }
      return value;
    },
    [locale, ns],
  );

  return { t };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function appWithTranslation<P extends Record<string, any>>(App: ComponentType<P>) {
  return function AppWithTranslation(props: P) {
    return (
      <I18nProvider>
        <App {...props} />
      </I18nProvider>
    );
  };
}

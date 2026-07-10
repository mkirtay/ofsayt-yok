import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';

import trCommon from '../../public/locales/tr/common.json';
import enCommon from '../../public/locales/en/common.json';
import trNav from '../../public/locales/tr/nav.json';
import enNav from '../../public/locales/en/nav.json';
import trAuth from '../../public/locales/tr/auth.json';
import enAuth from '../../public/locales/en/auth.json';
import trCredits from '../../public/locales/tr/credits.json';
import enCredits from '../../public/locales/en/credits.json';
import trMatch from '../../public/locales/tr/match.json';
import enMatch from '../../public/locales/en/match.json';
import trStandings from '../../public/locales/tr/standings.json';
import enStandings from '../../public/locales/en/standings.json';
import trProfile from '../../public/locales/tr/profile.json';
import enProfile from '../../public/locales/en/profile.json';
import trAi from '../../public/locales/tr/ai.json';
import enAi from '../../public/locales/en/ai.json';
import trLegal from '../../public/locales/tr/legal.json';
import enLegal from '../../public/locales/en/legal.json';

const TRANSLATIONS: Record<string, Record<string, Record<string, unknown>>> = {
  tr: {
    common: trCommon as Record<string, unknown>,
    nav: trNav as Record<string, unknown>,
    auth: trAuth as Record<string, unknown>,
    credits: trCredits as Record<string, unknown>,
    match: trMatch as Record<string, unknown>,
    standings: trStandings as Record<string, unknown>,
    profile: trProfile as Record<string, unknown>,
    ai: trAi as Record<string, unknown>,
    legal: trLegal as Record<string, unknown>,
  },
  en: {
    common: enCommon as Record<string, unknown>,
    nav: enNav as Record<string, unknown>,
    auth: enAuth as Record<string, unknown>,
    credits: enCredits as Record<string, unknown>,
    match: enMatch as Record<string, unknown>,
    standings: enStandings as Record<string, unknown>,
    profile: enProfile as Record<string, unknown>,
    ai: enAi as Record<string, unknown>,
    legal: enLegal as Record<string, unknown>,
  },
};

type I18nContextType = {
  locale: string;
  setLocale: (locale: string) => void;
};

const I18nContext = createContext<I18nContextType>({ locale: 'tr', setLocale: () => {} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState('tr');

  useEffect(() => {
    const saved = localStorage.getItem('locale');
    if (saved === 'tr' || saved === 'en') setLocaleState(saved);
  }, []);

  const setLocale = useCallback((next: string) => {
    setLocaleState(next);
    localStorage.setItem('locale', next);
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
      const dict =
        (TRANSLATIONS[locale]?.[namespace] ?? TRANSLATIONS['tr']?.[namespace] ?? {}) as Record<string, unknown>;
      let value = resolve(dict, actualKey) ?? actualKey;
      if (opts) {
        value = value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? ''));
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

/** Tema tercihi — `_tokens.scss` ile aynı iki değer. Varsayılan: dark (dark-mode-first). */
export type Theme = 'dark' | 'light';

export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'oy_theme';

export function normalizeTheme(raw: unknown): Theme {
  return raw === 'light' || raw === 'dark' ? raw : DEFAULT_THEME;
}

export function toggleTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark';
}

/**
 * `_document.tsx` içinde ilk boyamadan ÖNCE çalışan satır-içi script (tema
 * flaşını önler). Mantık `normalizeTheme` ile aynı — biri değişirse diğeri de.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='${DEFAULT_THEME}';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','${DEFAULT_THEME}');}})();`;

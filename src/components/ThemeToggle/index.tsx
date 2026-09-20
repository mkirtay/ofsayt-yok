import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_THEME, normalizeTheme, THEME_STORAGE_KEY, toggleTheme, type Theme } from '@/lib/theme';
import { useTranslation } from '@/lib/i18n';
import styles from './themeToggle.module.scss';

function readTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  return normalizeTheme(document.documentElement.getAttribute('data-theme'));
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common');
  // SSR ile aynı ilk değer (hydration uyumu); gerçek tema mount'ta okunur.
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const onToggle = useCallback(() => {
    const next = toggleTheme(readTheme());
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    setTheme(next);
  }, []);

  const isDark = theme === 'dark';
  const label = isDark ? t('themeToLight') : t('themeToDark');

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className}`.trim()}
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-pressed={!isDark}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}

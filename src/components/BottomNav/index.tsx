import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  activeBottomNavKey,
  bottomNavTarget,
  GUNDEM_PATH,
  type BottomNavKey,
} from '@/utils/bottomNav';
import styles from './bottomNav.module.scss';

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  width: 22,
  height: 22,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const ICONS: Record<BottomNavKey, ReactNode> = {
  live: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </svg>
  ),
  standings: (
    <svg {...ICON_PROPS}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  leagues: (
    <svg {...ICON_PROPS}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4zM8 6H4v1a3 3 0 0 0 3 3M16 6h4v1a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4" />
    </svg>
  ),
  favorites: (
    <svg {...ICON_PROPS}>
      <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z" />
    </svg>
  ),
  gundem: (
    <svg {...ICON_PROPS}>
      <path d="M4 5h16v11H9l-5 4V5z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  ),
};

const KEYS: BottomNavKey[] = ['live', 'gundem', 'standings', 'leagues', 'favorites'];

/**
 * Mobil alt navigasyon (Design System §3/§4): 56-60px, ikon+etiket dikey, yalnızca mobilde,
 * safe-area padding. Sekmeler ana sayfayı `?tab=` / `?panel=` ile açar; "Gündem" /gundem sayfasına gider.
 */
export default function BottomNav() {
  const router = useRouter();
  const { t } = useTranslation('nav');
  const active = activeBottomNavKey(router.pathname, router.query);

  return (
    <nav className={styles.nav} aria-label={t('bottomNav.label')}>
      {KEYS.map((key) => {
        const label = t(`bottomNav.${key}`);
        const cls = `${styles.item} ${active === key ? styles.active : ''}`.trim();
        const inner = (
          <>
            {ICONS[key]}
            <span className={styles.label}>{label}</span>
          </>
        );
        if (key === 'gundem') {
          const isActive = active === 'gundem';
          return (
            <Link
              key={key}
              href={GUNDEM_PATH}
              className={`${styles.item} ${isActive ? styles.active : ''}`.trim()}
              aria-current={isActive ? 'page' : undefined}
            >
              {inner}
            </Link>
          );
        }
        return (
          <Link
            key={key}
            href={{ pathname: '/', query: bottomNavTarget(key) }}
            shallow={router.pathname === '/'}
            scroll={false}
            className={cls}
            aria-current={active === key ? 'page' : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}

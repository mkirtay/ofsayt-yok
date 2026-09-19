import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchAiStatsDashboard } from '@/hooks/useAiStatsDashboard';
import { useTranslation } from '@/lib/i18n';
import MyAnalysesList from './MyAnalysesList';
import { useDismiss } from './useDismiss';
import styles from './header.module.scss';

/** Ürün/AI özellikleri tek "AI" menüsü altında: AI İsabeti + (oturum varsa) AI Analizlerim. */
export default function AiMenu() {
  const { t } = useTranslation('nav');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  const prefetch = useCallback(() => {
    if (session?.user) void prefetchAiStatsDashboard(queryClient);
  }, [queryClient, session?.user]);

  return (
    <div className={styles.menuWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.headerNavPill} ${styles.menuTrigger}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.aiSpark} aria-hidden="true">✦</span>
        {t('aiMenu')}
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className={styles.menuPanel} role="menu">
          <Link
            href="/ai-istatistikleri"
            role="menuitem"
            className={styles.menuItem}
            onClick={close}
            onMouseEnter={prefetch}
            onFocus={prefetch}
          >
            {t('aiAccuracy')}
          </Link>
          {session ? (
            <>
              <div className={styles.menuHeading}>{t('myAnalyses')}</div>
              <div className={styles.menuList}>
                <MyAnalysesList />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

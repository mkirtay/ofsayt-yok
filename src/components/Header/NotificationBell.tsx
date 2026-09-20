import { useCallback, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useUnreadCount } from '@/hooks/useGundem';
import BellIcon from '@/components/icons/BellIcon';
import NotificationList from './NotificationList';
import { useDismiss } from './useDismiss';
import styles from './header.module.scss';

/** Rozette gösterilen üst sınır ("99+"). */
const BADGE_MAX = 99;

/**
 * Bildirim zili: okunmamış sayısı rozeti (60 sn polling `useUnreadCount`) + açılır bildirim listesi.
 * Yalnızca oturum açıkken render edilmelidir (Header dalı garanti eder). `useDismiss`/`menuWrap`/`menuPanel` AccountMenu kalıbı;
 * dar ekranda panel tam genişlikte sheet olur (`notifPanel`).
 */
export default function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation('gundem');
  const { data: count = 0 } = useUnreadCount();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  const label = count > 0 ? t('notifications.labelUnread', { count }) : t('notifications.label');

  return (
    <div className={[styles.menuWrap, className].filter(Boolean).join(' ')} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellBtn}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={t('notifications.label')}
        onClick={() => setOpen((o) => !o)}
      >
        <BellIcon />
        {count > 0 ? (
          <span className={styles.bellBadge} aria-hidden="true">
            {count > BADGE_MAX ? `${BADGE_MAX}+` : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className={`${styles.menuPanel} ${styles.menuPanelRight} ${styles.notifPanel}`} role="dialog" aria-label={t('notifications.title')}>
          <NotificationList onNavigate={close} />
        </div>
      ) : null}
    </div>
  );
}

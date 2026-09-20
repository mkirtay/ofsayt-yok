import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchProfile } from '@/hooks/useProfile';
import { useTranslation } from '@/lib/i18n';
import Avatar from '@/components/Avatar';
import { useDismiss } from './useDismiss';
import styles from './header.module.scss';

/** Hesap: tek avatar düğmesi → Profil + Çıkış Yap (eskiden 3 ayrı öğe: Profil pill'i, kullanıcı adı, Çıkış butonu). */
export default function AccountMenu() {
  const { t } = useTranslation('nav');
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(wrapRef, open, close);

  if (!session) return null;
  const name = session.user.username || session.user.name || session.user.email || '';

  return (
    <div className={styles.menuWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.avatarBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('account')}: ${name}`}
        title={name}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => void prefetchProfile(queryClient)}
      >
        <Avatar name={name} image={session.user.image} className={styles.avatarInner} />
      </button>
      {open ? (
        <div className={`${styles.menuPanel} ${styles.menuPanelRight}`} role="menu">
          <div className={styles.menuUser}>{name}</div>
          <Link href="/profile" role="menuitem" className={styles.menuItem} onClick={close}>
            {t('profile')}
          </Link>
          <button type="button" role="menuitem" className={`${styles.menuItem} ${styles.menuItemButton}`} onClick={() => signOut()}>
            {t('signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

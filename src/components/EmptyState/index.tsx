import type { ReactNode } from 'react';
import styles from './emptyState.module.scss';

export type EmptyStateProps = {
  /** İkincil-seviye mesaj. Hata değil bilgi notu tonunda yazılmalı. */
  children: ReactNode;
  /** Varsayılan: bilgi ikonu. */
  icon?: ReactNode;
  className?: string;
};

function InfoIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <circle cx="12" cy="7.75" r="0.6" fill="currentColor" />
    </svg>
  );
}

/**
 * Boş / bilgi durumları için tek kalıp (Design System §2, §5): ikon + ikincil gri 13px metin, kart çerçevesi.
 * Kırmızı/hata rengi KULLANMAZ — veri yokluğu hata değildir.
 */
export default function EmptyState({ children, icon, className }: EmptyStateProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')} role="status">
      <span className={styles.icon}>{icon ?? <InfoIcon />}</span>
      <p className={styles.text}>{children}</p>
    </div>
  );
}

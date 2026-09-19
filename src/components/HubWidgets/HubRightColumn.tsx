import type { ReactNode } from 'react';
import styles from './hubWidgets.module.scss';

/**
 * Ana sayfa sağ sütununun TEK giriş noktası. Şimdilik mini puan durumu widget'ı
 * ile dolu; reklam alanı geldiğinde yalnızca `children` (veya bu bileşenin içeriği)
 * bir reklam slotuyla değiştirilir — layout/grid tarafına dokunmak gerekmez.
 */
export default function HubRightColumn({ children }: { children: ReactNode }) {
  return (
    <aside className={styles.rightColumn} data-slot="hub-right" aria-label="Yan içerik">
      {children}
    </aside>
  );
}

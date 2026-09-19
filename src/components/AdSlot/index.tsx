import { useAdsVisible } from '@/hooks/useAdsVisible';
import styles from './adSlot.module.scss';

type AdSlotProps = {
  /** Reklam birimi kimliği (ileride AdSense `data-ad-slot` değeri). */
  slot: string;
  /** Boyut ipucu: `rectangle` 300×250, `leaderboard` 728×90, `auto` esnek. */
  format?: 'rectangle' | 'leaderboard' | 'auto';
  /** Yalnızca masaüstünde göster (sidebar reklamı gibi). */
  desktopOnly?: boolean;
  className?: string;
};

/**
 * Yeniden kullanılabilir reklam alanı — ŞİMDİLİK placeholder (gerçek reklam script'i YOK).
 * `NEXT_PUBLIC_ADS_ENABLED` kapalıyken veya kullanıcı premium iken hiçbir şey render etmez.
 * AdSense bağlanınca yalnızca `.frame` içeriği (ins etiketi) değişir; yerleşim ve kapı aynı kalır.
 */
export default function AdSlot({ slot, format = 'rectangle', desktopOnly = false, className }: AdSlotProps) {
  const visible = useAdsVisible();
  if (!visible) return null;
  return (
    <aside
      className={[styles.slot, styles[format], desktopOnly ? styles.desktopOnly : '', className].filter(Boolean).join(' ')}
      aria-label="Reklam"
      data-ad-slot={slot}
    >
      <span className={styles.label}>Reklam</span>
      <div className={styles.frame} aria-hidden="true">
        {format === 'rectangle' ? '300 × 250' : format === 'leaderboard' ? '728 × 90' : 'Reklam alanı'}
      </div>
    </aside>
  );
}

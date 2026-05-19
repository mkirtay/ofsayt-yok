import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import styles from './premiumModal.module.scss';

const LS_KEY = 'ofsaytyok_pm_shown';
const DELAY_MS = 45_000;

export default function PremiumModal() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (session?.user?.isPremium) return;
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(LS_KEY)) return;

    const timer = setTimeout(() => {
      setOpen(true);
      localStorage.setItem(LS_KEY, '1');
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [status, session]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setOpen(false)}
          aria-label="Kapat"
        >
          ✕
        </button>

        <div className={styles.badge}>⭐ Premium</div>
        <h2 className={styles.headline}>Analiz yapan tarafta ol</h2>
        <p className={styles.sub}>
          Yapay zeka destekli tahminler, detaylı istatistikler ve maça özel içerikler.
        </p>

        <ul className={styles.featureList}>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>🤖</span>
            <div>
              <strong>AI Maç Analizi</strong>
              <p>Skor tahmini, 1X2 olasılıkları, gol beklentisi ve bahis önerileri</p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>⚡</span>
            <div>
              <strong>Maç Trivias</strong>
              <p>Her maç için özel bilinmeyenler ve rekabet tarihi</p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>📊</span>
            <div>
              <strong>AI İsabeti Takibi</strong>
              <p>Geçmiş tahminlerin detaylı doğruluk istatistikleri</p>
            </div>
          </li>
        </ul>

        <div className={styles.pricingRow}>
          <div className={styles.priceCard}>
            <div className={styles.pricePeriod}>Aylık</div>
            <div className={styles.priceAmount}>79 ₺</div>
            <div className={styles.priceSub}>/ ay</div>
          </div>
          <div className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
            <div className={styles.popularBadge}>En Popüler</div>
            <div className={styles.pricePeriod}>Yıllık</div>
            <div className={styles.priceAmount}>699 ₺</div>
            <div className={styles.priceSub}>/ yıl • ayda ~58 ₺</div>
          </div>
        </div>

        <Link
          href="/premium"
          className={styles.ctaBtn}
          onClick={() => setOpen(false)}
        >
          Tüm Detayları Gör
        </Link>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={() => setOpen(false)}
        >
          Belki sonra
        </button>
      </div>
    </div>
  );
}

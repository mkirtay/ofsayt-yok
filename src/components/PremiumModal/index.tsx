import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import styles from './premiumModal.module.scss';

const SS_KEY = 'ofsaytyok_pm_shown';
const DELAY_MS = 45_000;

export default function PremiumModal() {
  const { data: session, status } = useSession();
  const { t } = useTranslation('premium');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (session?.user?.isPremium) return;
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(SS_KEY)) return;

    const timer = setTimeout(() => {
      setOpen(true);
      sessionStorage.setItem(SS_KEY, '1');
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [status, session]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={() => setOpen(false)}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="premium-modal-headline"
      >
        <button
          type="button"
          className={styles.closeBtn}
          onClick={() => setOpen(false)}
          aria-label={t('common:close')}
        >
          ✕
        </button>

        <div className={styles.badge}>{t('modal.badge')}</div>
        <h2 id="premium-modal-headline" className={styles.headline}>{t('modal.headline')}</h2>
        <p className={styles.sub}>{t('modal.sub')}</p>

        <ul className={styles.featureList}>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>🤖</span>
            <div>
              <strong>{t('modal.aiAnalysisTitle')}</strong>
              <p>{t('modal.aiAnalysisDesc')}</p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>⚡</span>
            <div>
              <strong>{t('modal.triviaTitle')}</strong>
              <p>{t('modal.triviaDesc')}</p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureIcon}>📊</span>
            <div>
              <strong>{t('modal.aiAccuracyTitle')}</strong>
              <p>{t('modal.aiAccuracyDesc')}</p>
            </div>
          </li>
        </ul>

        <div className={styles.pricingRow}>
          <div className={styles.priceCard}>
            <div className={styles.pricePeriod}>{t('modal.monthly')}</div>
            <div className={styles.priceAmount}>{t('modal.monthly79')}</div>
            <div className={styles.priceSub}>{t('modal.perMonth')}</div>
          </div>
          <div className={`${styles.priceCard} ${styles.priceCardFeatured}`}>
            <div className={styles.popularBadge}>{t('modal.mostPopular')}</div>
            <div className={styles.pricePeriod}>{t('modal.yearly')}</div>
            <div className={styles.priceAmount}>{t('modal.yearly699')}</div>
            <div className={styles.priceSub}>{t('modal.perYear')}</div>
          </div>
        </div>

        <Link
          href="/premium"
          className={styles.ctaBtn}
          onClick={() => setOpen(false)}
        >
          {t('modal.seeDetails')}
        </Link>
        <button
          type="button"
          className={styles.dismissBtn}
          onClick={() => setOpen(false)}
        >
          {t('modal.maybeLater')}
        </button>
      </div>
    </div>
  );
}

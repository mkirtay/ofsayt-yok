import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/profile';
import styles from './profile.module.scss';
import { trackGrowth } from '@/lib/growthEvents';

type Referral = { code: string; url: string; invited: number; rewarded: number; rewardActive: boolean; bonus: number };

/**
 * Profil › Davet et (büyüme raporu 2.3): kişisel davet linki (/davet/{kod}), kopyala, WhatsApp, kaç kişi katıldı.
 * Ödül: davetli e-postasını doğrulayıp ilk tahminini yapınca iki tarafa kredi (lib/referral.ts).
 */
export default function InviteTab() {
  const { t } = useTranslation('profile');
  const [data, setData] = useState<Referral | null>(null);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user/referral')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Referral) => !cancelled && setData(d))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const text = data ? t('invite.shareText', { url: data.url }) : '';
  const copy = async () => {
    if (!data) return;
    trackGrowth('invite_share', { channel: 'copy' });
    try {
      await navigator.clipboard.writeText(data.url);
      setCopied(true);
    } catch {
      // pano yok
    }
  };

  return (
    <section className={styles.section} aria-labelledby="invite-title">
      <h2 id="invite-title" className={styles.sectionTitle}>
        {t('invite.title')}
      </h2>
      <p className={styles.hint}>{data?.rewardActive ? t('invite.introReward', { n: data.bonus }) : t('invite.intro')}</p>
      {error ? (
        <p className={`${styles.message} ${styles.err}`}>{t('invite.error')}</p>
      ) : !data ? (
        <p className={styles.hint}>{t('invite.loading')}</p>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="invite-link">
              {t('invite.linkLabel')}
            </label>
            <input id="invite-link" className={styles.input} value={data.url} readOnly onFocus={(e) => e.currentTarget.select()} />
          </div>
          <div className={styles.inviteActions}>
            <button type="button" className={styles.submit} onClick={() => void copy()}>
              {copied ? t('invite.copied') : t('invite.copy')}
            </button>
            <a className={styles.secondaryBtn} href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" onClick={() => trackGrowth('invite_share', { channel: 'whatsapp' })}>
              {t('invite.whatsapp')}
            </a>
          </div>
          <p className={styles.hint}>{t('invite.stats', { invited: data.invited, rewarded: data.rewarded })}</p>
        </>
      )}
    </section>
  );
}

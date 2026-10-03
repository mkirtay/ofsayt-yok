import Link from 'next/link';
import Avatar from '@/components/Avatar';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/profile';
import type { ProfileDto } from '@/hooks/useProfile';
import type { UserSummaryDto } from '@/pages/api/user/summary';
import styles from './profile.module.scss';

type Props = {
  profile: ProfileDto;
  /** Yüklenene kadar null — rozet / tarih / sayı satırları aynı yükseklikte boş kalır (CLS 0). */
  summary: UserSummaryDto | null;
  onEdit: () => void;
};

const STAT_KEYS = ['analyses', 'favoriteTeams', 'favoriteLeagues', 'posts'] as const;

/**
 * Profil başlık kartı (takım sayfası üst kartıyla aynı dil): avatar, ad, @kullanıcıadı, üyelik tarihi, kredi /
 * premium / yönetici rozetleri, "Profili düzenle" (Bilgilerim sekmesine geçip ilk alana odaklanır) + 4 istatistik.
 * Bu sayfa her zaman oturum sahibinin kendi profili → YÖNETİCİ rozeti yalnız burada.
 */
export default function ProfileHeaderCard({ profile, summary, onEdit }: Props) {
  const { t } = useTranslation('profile');
  const { locale } = useI18n();
  const displayName = profile.name || profile.username || profile.email.split('@')[0];
  const dateFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { month: 'long', year: 'numeric' });
  const dayFmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <section className={styles.headerCard} aria-label={displayName}>
      <div className={styles.headerTop}>
        <Avatar name={displayName} image={profile.image} size={72} className={styles.headerAvatar} />
        <div className={styles.headerText}>
          <h1 className={styles.headerName}>{displayName}</h1>
          <p className={styles.headerHandle}>{profile.username ? `@${profile.username}` : ' '}</p>
          <p className={styles.headerSince}>
            {summary ? t('header.memberSince', { date: dateFmt.format(new Date(summary.memberSince)) }) : ' '}
          </p>
        </div>
      </div>

      <div className={styles.headerBadges}>
        {summary ? (
          <>
            <Link href="/credits" className={styles.badgeCredits} title={t('header.creditBalance')}>
              {t('header.credits', { count: summary.credits })}
            </Link>
            {summary.premium ? (
              <span
                className={styles.badgePremium}
                title={summary.premiumUntil ? t('header.premiumUntil', { date: dayFmt.format(new Date(summary.premiumUntil)) }) : undefined}
              >
                {t('header.premium')}
              </span>
            ) : null}
            {summary.admin ? <span className={styles.badgeAdmin}>{t('header.admin')}</span> : null}
          </>
        ) : null}
        <button type="button" className={styles.editBtn} onClick={onEdit}>
          {t('header.editProfile')}
        </button>
      </div>

      <dl className={styles.stats} aria-label={t('stats.label')}>
        {STAT_KEYS.map((key) => (
          <div key={key} className={styles.stat}>
            <dt className={styles.statLabel}>{t(`stats.${key}`)}</dt>
            <dd className={styles.statValue}>{summary ? summary.counts[key] : '—'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

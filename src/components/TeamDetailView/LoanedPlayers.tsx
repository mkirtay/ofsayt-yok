import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { LoanedPlayer } from '@/services/sportmonks/teamLoans';
import { detailedPositionLabel } from '@/utils/positionLabel';
import styles from './teamDetailView.module.scss';

type Props = {
  players: LoanedPlayer[] | null;
  error: boolean;
  onRetry: () => void;
};

function ddmmyyyy(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Dönüş ay + yıl ("Haz 2027" / "Jun 2027"): kiralıklar sezon sonunda biter, gün dar ekranda yer kaplar (tam tarih title'da). */
function monthYear(iso: string, locale: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/**
 * Kadro sekmesinin altında "Kiralıktaki oyuncular" (bkz. services/sportmonks/teamLoans.ts). Yüklenirken ve liste
 * boşken hiçbir şey çizilmez (bölüm kadro listesinin altında; yer ayırmaya gerek yok). Hata "kiralık yok" değildir:
 * kısa not + yeniden dene.
 */
export default function LoanedPlayers({ players, error, onRetry }: Props) {
  const { t } = useTranslation('team');
  const { locale } = useI18n();
  if (error && !players) {
    return (
      <section className={styles.squadGroup} aria-labelledby="team-loans-title">
        <h3 id="team-loans-title" className={styles.squadGroupTitle}>
          {t('loans.title')}
        </h3>
        <p className={styles.loanError}>
          {t('loans.error')}{' '}
          <button type="button" className={styles.cardHeadBtn} onClick={onRetry}>
            {t('common:retry')}
          </button>
        </p>
      </section>
    );
  }
  if (!players || players.length === 0) return null;

  return (
    <section className={styles.squadGroup} aria-labelledby="team-loans-title">
      <h3 id="team-loans-title" className={styles.squadGroupTitle}>
        {t('loans.title')} ({players.length})
      </h3>
      <div className={`${styles.squadRow} ${styles.loanRow} ${styles.squadHead}`} aria-hidden="true">
        <span className={styles.squadNameCol}>{t('loans.player')}</span>
        <span className={styles.squadPosCol}>{t('loans.position')}</span>
        <span>{t('loans.club')}</span>
        <span className={styles.loanUntilCol}>{t('loans.until')}</span>
      </div>
      <ul>
        {players.map((p) => (
          <li key={p.id}>
            <Link href={`/players/${p.id}`} className={`${styles.squadPlayer} ${styles.squadRow} ${styles.loanRow}`} prefetch={false}>
              <span className={styles.squadNameCol}>
                {p.photo ? (
                  <TeamLogo src={p.photo} alt="" className={styles.squadPhoto} width={28} height={28} />
                ) : (
                  <span className={`${styles.squadPhoto} ${styles.squadPhotoEmpty}`} aria-hidden="true" />
                )}
                <span className={styles.squadName}>{p.name}</span>
              </span>
              <span className={styles.squadPosCol}>{detailedPositionLabel(p.detailedPositionId) ?? '—'}</span>
              <span className={styles.loanClub}>
                <TeamLogo src={p.club.logo} alt="" className={styles.loanClubLogo} width={18} height={18} />
                <span className={styles.loanClubName}>{p.club.name}</span>
              </span>
              <span className={styles.loanUntilCol} title={p.until ? ddmmyyyy(p.until) : undefined}>
                {p.until ? (
                  <>
                    <span className={styles.srOnly}>{t('loans.until')}: </span>
                    {monthYear(p.until, locale)}
                  </>
                ) : (
                  '—'
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

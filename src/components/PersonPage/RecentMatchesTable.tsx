import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { personLeagueLabel } from './leagueLabel';
import { buildMatchHref } from '@/utils/matchUrl';
import { isoDateToTr } from '@/utils/dateFormat';
import type { PersonRecentMatch } from '@/server/people/refereePage';
import styles from './personPage.module.scss';

/** Son maçlar: tarih, maç (maç sayfasına link), skor, lig. */
export default function RecentMatchesTable({ matches }: { matches: PersonRecentMatch[] }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  return (
    <section className={styles.card} aria-labelledby="person-recent">
      <h2 id="person-recent" className={styles.sectionTitle}>
        {t('person.recentTitle')}
      </h2>
      {matches.length === 0 ? (
        <p className={styles.empty}>{t('person.empty')}</p>
      ) : (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{t('person.colDate')}</th>
                <th className={styles.left}>{t('person.colMatch')}</th>
                <th>{t('person.colScore')}</th>
                <th className={styles.left}>{t('person.colLeague')}</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id}>
                  <td className={styles.muted}>{m.date ? isoDateToTr(m.date) : '—'}</td>
                  <td className={styles.left}>
                    <Link href={buildMatchHref({ id: m.id, home_name: m.home.name, away_name: m.away.name })} className={styles.matchLink} prefetch={false}>
                      {m.home.name} – {m.away.name}
                    </Link>
                  </td>
                  <td>{m.scores?.score?.replace(/\s+/g, '') || '—'}</td>
                  <td className={`${styles.left} ${styles.muted}`}>
                    <span className={styles.leagueCell}>
                      {m.competition?.logo ? (
                        <TeamLogo
                          src={m.competition.logo}
                          width={16}
                          className={competitionLogoNeedsBackdrop(m.competition.id) ? styles.logoBackdrop : undefined}
                        />
                      ) : null}
                      {personLeagueLabel(m.competition?.id, tl, m.competition?.name || '—')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { leagueNameById } from '@/utils/leagueName';
import { countryDisplayName } from '@/utils/countryName';
import { isoDateToTr } from '@/utils/dateFormat';
import type { CoachPageData } from '@/server/people/coachPage';
import RecentMatchesTable from './RecentMatchesTable';
import { initials } from './RefereeView';
import styles from './personPage.module.scss';

/** Teknik direktör sayfası: başlık (foto, ad, yaş, uyruk, mevcut takım), sezon × turnuva × takım G-B-M, son 10 maç. */
export default function CoachView({ data }: { data: CoachPageData }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const pct = (n: number) => (locale === 'en' ? `${n}%` : `%${n}`);

  return (
    <div className={styles.page}>
      <header className={`${styles.card} ${styles.header}`}>
        {data.photo ? (
          <TeamLogo src={data.photo} width={72} height={72} className={styles.avatar} alt="" priority />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {initials(data.name)}
          </span>
        )}
        <div className={styles.headText}>
          <p className={styles.role}>{t('person.coachRole')}</p>
          <h1 className={styles.name}>{data.name}</h1>
          <p className={styles.facts}>
            {data.age != null ? <span className={styles.fact}>{t('person.age', { count: data.age })}</span> : null}
            {data.nationality ? (
              <span className={styles.fact}>
                {data.nationality.flag ? <TeamLogo src={data.nationality.flag} width={20} height={14} className={styles.flag} /> : null}
                {countryDisplayName(data.nationality, locale)}
              </span>
            ) : null}
          </p>
          {data.currentTeam ? (
            <p className={styles.facts}>
              <span className={styles.fact}>
                <span>{t('person.currentTeam')}:</span>
                <Link href={`/teams/${data.currentTeam.id}`} className={styles.teamLink}>
                  <TeamLogo src={data.currentTeam.logo} width={18} />
                  {data.currentTeam.name}
                </Link>
              </span>
              {data.currentTeam.since ? (
                <span className={styles.fact}>{t('person.since', { date: isoDateToTr(data.currentTeam.since) })}</span>
              ) : null}
            </p>
          ) : null}
        </div>
      </header>

      <section className={styles.card} aria-labelledby="coach-seasons">
        <h2 id="coach-seasons" className={styles.sectionTitle}>
          {t('person.seasonsTitle')}
        </h2>
        {data.seasons.length === 0 ? (
          <p className={styles.empty}>{t('person.empty')}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('person.colSeason')}</th>
                  <th className={styles.left}>{t('person.colLeague')}</th>
                  <th className={styles.left}>{t('person.colTeam')}</th>
                  <th>{t('person.colMatches')}</th>
                  <th>{t('person.colWins')}</th>
                  <th>{t('person.colDraws')}</th>
                  <th>{t('person.colLosses')}</th>
                  <th>{t('person.colWinPct')}</th>
                </tr>
              </thead>
              <tbody>
                {data.seasons.map((s) => (
                  <tr key={`${s.seasonId}-${s.teamId}`}>
                    <td>{s.seasonName}</td>
                    <td className={styles.left}>{leagueNameById(s.leagueId ?? undefined, '—', tl)}</td>
                    <td className={styles.left}>
                      {s.teamId ? (
                        <Link href={`/teams/${s.teamId}`} className={styles.teamCellLink} prefetch={false}>
                          <TeamLogo src={s.teamLogo} width={18} />
                          {s.teamName}
                        </Link>
                      ) : (
                        s.teamName
                      )}
                    </td>
                    <td>{s.matches}</td>
                    <td>{s.wins}</td>
                    <td>{s.draws}</td>
                    <td>{s.losses}</td>
                    <td>{s.winPct != null ? pct(s.winPct) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note}>{t('person.coverageNote')}</p>
      </section>

      <RecentMatchesTable matches={data.recent} />
    </div>
  );
}

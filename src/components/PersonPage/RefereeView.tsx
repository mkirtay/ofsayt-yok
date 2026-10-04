import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { leagueNameById } from '@/utils/leagueName';
import type { RefereePageData } from '@/server/people/refereePage';
import RecentMatchesTable from './RecentMatchesTable';
import styles from './personPage.module.scss';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr');
}

/** Hakem sayfası: başlık (baş harfli avatar, ad, ülke), sezon tablosu, son 10 maç, takım kırılımı. Yalnız sayılar. */
export default function RefereeView({ data }: { data: RefereePageData }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const fmt = (n: number | null) => (n == null ? '—' : nf.format(n));
  const pm = (total: number, matches: number) => (matches > 0 ? nf.format(Math.round((total / matches) * 100) / 100) : '—');
  const { teams } = data;

  return (
    <div className={styles.page}>
      <header className={`${styles.card} ${styles.header}`}>
        <span className={styles.avatar} aria-hidden="true">
          {initials(data.name)}
        </span>
        <div className={styles.headText}>
          <p className={styles.role}>{t('person.refereeRole')}</p>
          <h1 className={styles.name}>{data.name}</h1>
          {data.country ? (
            <p className={styles.facts}>
              <span className={styles.fact}>
                {data.country.flag ? <TeamLogo src={data.country.flag} width={20} height={14} className={styles.flag} /> : null}
                {data.country.name}
              </span>
            </p>
          ) : null}
        </div>
      </header>

      <section className={styles.card} aria-labelledby="ref-seasons">
        <h2 id="ref-seasons" className={styles.sectionTitle}>
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
                  <th>{t('person.colMatches')}</th>
                  <th>{t('person.colYellowPm')}</th>
                  <th>{t('person.colRedPm')}</th>
                  <th>{t('person.colPenPm')}</th>
                  <th>{t('person.colFoulsPm')}</th>
                  <th>{t('person.colVarPm')}</th>
                </tr>
              </thead>
              <tbody>
                {data.seasons.map((s) => (
                  <tr key={`${s.seasonId}`}>
                    <td>{s.seasonName}</td>
                    <td className={styles.left}>{leagueNameById(s.leagueId ?? undefined, '—', tl)}</td>
                    <td>{s.matches}</td>
                    <td>{fmt(s.yellowPerMatch)}</td>
                    <td>{fmt(s.redPerMatch)}</td>
                    <td>{fmt(s.penaltiesPerMatch)}</td>
                    <td>{fmt(s.foulsPerMatch)}</td>
                    <td>{fmt(s.varPerMatch)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RecentMatchesTable matches={data.recent} />

      <section className={styles.card} aria-labelledby="ref-teams">
        <h2 id="ref-teams" className={styles.sectionTitle}>
          {teams.scope === 'season' && teams.seasonName
            ? t('person.teamsTitleSeason', { season: teams.seasonName, count: teams.matchCount })
            : t('person.teamsTitleLast', { count: teams.matchCount })}
        </h2>
        {teams.rows.length === 0 ? (
          <p className={styles.empty}>{t('person.empty')}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table} data-testid="referee-teams">
              <thead>
                <tr>
                  <th>{t('person.colTeam')}</th>
                  <th>{t('person.colMatches')}</th>
                  <th>{t('person.colYellow')}</th>
                  <th>{t('person.colYellowPm')}</th>
                  <th>{t('person.colRed')}</th>
                  <th>{t('person.colRedPm')}</th>
                  <th>{t('person.colPenFor')}</th>
                </tr>
              </thead>
              <tbody>
                {teams.rows.map((r) => (
                  <tr key={r.teamId}>
                    <td>
                      <Link href={`/teams/${r.teamId}`} className={styles.teamCellLink} prefetch={false}>
                        <TeamLogo src={r.logo} width={18} />
                        {r.name}
                      </Link>
                    </td>
                    <td>{r.matches}</td>
                    <td>{r.yellow}</td>
                    <td>{pm(r.yellow, r.matches)}</td>
                    <td>{r.red}</td>
                    <td>{pm(r.red, r.matches)}</td>
                    <td>{r.penaltiesFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note}>{t('person.teamsNote')}</p>
      </section>
    </div>
  );
}

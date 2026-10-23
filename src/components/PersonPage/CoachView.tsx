import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { personLeagueLabel } from './leagueLabel';
import { countryDisplayName } from '@/utils/countryName';
import { isoDateToTr } from '@/utils/dateFormat';
import type { CoachPageData } from '@/server/people/coachPage';
import { coachTotals, groupCoachSeasons } from '@/services/sportmonks/coachStats';
import RecentMatchesTable from './RecentMatchesTable';
import { initials } from './RefereeView';
import styles from './personPage.module.scss';

/**
 * Teknik direktör sayfası: başlık (foto, ad, yaş, uyruk + mevcut takım / göreve başlama bilgi hücreleri), kapsanan maçların
 * özeti, "sezon + takım" gruplu turnuva tablosu (sezon ortası takım değişikliği karışmasın), son 10 maç.
 */
export default function CoachView({ data }: { data: CoachPageData }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const pct = (n: number) => (locale === 'en' ? `${n}%` : `%${n}`);
  const totals = coachTotals(data.seasons);
  const groups = groupCoachSeasons(data.seasons, data.currentTeam?.id);
  const share = (n: number) => (totals.matches > 0 ? (n / totals.matches) * 100 : 0);
  const summary = [
    { key: 'matches', label: t('person.summaryMatches'), value: String(totals.matches) },
    { key: 'wins', label: t('person.winsLabel'), value: String(totals.wins) },
    { key: 'draws', label: t('person.drawsLabel'), value: String(totals.draws) },
    { key: 'losses', label: t('person.lossesLabel'), value: String(totals.losses) },
    { key: 'winPct', label: t('person.colWinPct'), value: totals.winPct != null ? pct(totals.winPct) : '—' },
  ];

  return (
    <div className={styles.page}>
      <header className={`${styles.card} ${styles.coachHero}`}>
        <div className={styles.heroTop}>
          {data.photo ? (
            <TeamLogo src={data.photo} width={88} height={88} className={`${styles.avatar} ${styles.avatarLg}`} alt="" priority />
          ) : (
            <span className={`${styles.avatar} ${styles.avatarLg}`} aria-hidden="true">
              {initials(data.name)}
            </span>
          )}
          <div className={styles.headText}>
            <p className={styles.role}>{t('person.coachRole')}</p>
            <h1 className={styles.name}>{data.name}</h1>
            <p className={styles.chips}>
              {data.age != null ? <span className={styles.chip}>{t('person.age', { count: data.age })}</span> : null}
              {data.nationality ? (
                <span className={styles.chip}>
                  {data.nationality.flag ? <TeamLogo src={data.nationality.flag} width={20} height={14} className={styles.flag} /> : null}
                  {countryDisplayName(data.nationality, locale)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        {data.currentTeam ? (
          <dl className={styles.infoGrid}>
            <div className={styles.infoCell}>
              <dt>{t('person.currentTeam')}</dt>
              <dd>
                <Link href={`/teams/${data.currentTeam.id}`} className={styles.teamLink}>
                  <TeamLogo src={data.currentTeam.logo} width={22} />
                  {data.currentTeam.name}
                </Link>
              </dd>
            </div>
            {data.currentTeam.since ? (
              <div className={styles.infoCell}>
                <dt>{t('person.sinceLabel')}</dt>
                <dd>{isoDateToTr(data.currentTeam.since)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </header>

      {totals.matches > 0 ? (
        <section className={styles.card} aria-labelledby="coach-summary">
          <h2 id="coach-summary" className={styles.sectionTitle}>
            {t('person.summaryTitle')}
            <span className={styles.sectionSub}> · {t('person.coverageShort')}</span>
          </h2>
          <dl className={`${styles.statCards} ${styles.coachStats}`} data-testid="coach-summary">
            {summary.map((c) => (
              <div key={c.key} className={styles.statCard}>
                <dt>{c.label}</dt>
                <dd className={styles.statValue}>{c.value}</dd>
              </div>
            ))}
          </dl>
          <div className={styles.wdlBar} role="img" aria-label={`${t('person.winsLabel')} ${totals.wins}, ${t('person.drawsLabel')} ${totals.draws}, ${t('person.lossesLabel')} ${totals.losses}`}>
            <span className={styles.wdlWin} style={{ width: `${share(totals.wins)}%` }} />
            <span className={styles.wdlDraw} style={{ width: `${share(totals.draws)}%` }} />
            <span className={styles.wdlLoss} style={{ width: `${share(totals.losses)}%` }} />
          </div>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="coach-seasons">
        <h2 id="coach-seasons" className={styles.sectionTitle}>
          {t('person.seasonsTitle')}
        </h2>
        {groups.length === 0 ? (
          <p className={styles.empty}>{t('person.empty')}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('person.colLeague')}</th>
                  <th>{t('person.colMatches')}</th>
                  <th>{t('person.colWins')}</th>
                  <th>{t('person.colDraws')}</th>
                  <th>{t('person.colLosses')}</th>
                  <th>{t('person.colWinPct')}</th>
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={`${g.seasonName}-${g.teamId ?? g.teamName}`}>
                  <tr className={styles.groupRow}>
                    <th colSpan={6} scope="colgroup">
                      <span className={styles.groupHead}>
                        <span className={styles.seasonBadge}>{g.seasonName}</span>
                        {g.teamId ? (
                          <Link href={`/teams/${g.teamId}`} className={styles.teamCellLink} prefetch={false}>
                            <TeamLogo src={g.teamLogo} width={20} />
                            {g.teamName}
                          </Link>
                        ) : (
                          <span className={styles.teamCell}>{g.teamName}</span>
                        )}
                        <span className={styles.groupTotal}>
                          {t('person.seasonMatches', { count: g.matches })}
                          {g.winPct != null ? ` · ${pct(g.winPct)}` : ''}
                        </span>
                      </span>
                    </th>
                  </tr>
                  {g.rows.map((s) => (
                    <tr key={`${s.seasonId}-${s.teamId}-${s.leagueId}`}>
                      <td>{personLeagueLabel(s.leagueId, tl)}</td>
                      <td>{s.matches}</td>
                      <td>{s.wins}</td>
                      <td>{s.draws}</td>
                      <td>{s.losses}</td>
                      <td>
                        {s.winPct != null ? (
                          <span className={styles.barCell}>
                            {pct(s.winPct)}
                            <span className={styles.miniTrack} aria-hidden="true">
                              <span className={`${styles.miniFill} ${styles.miniWin}`} style={{ width: `${Math.max(4, s.winPct)}%` }} />
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
        <p className={styles.note}>{t('person.coverageNote')}</p>
      </section>

      <RecentMatchesTable matches={data.recent} loadMore={{ coachId: data.id }} hasMore={data.hasMoreMatches === true} />
    </div>
  );
}

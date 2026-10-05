import Link from 'next/link';
import { useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { personLeagueLabel } from './leagueLabel';
import { countryDisplayName } from '@/utils/countryName';
import { personSlug } from '@/utils/personUrl';
import { refereeComparePath } from '@/config/refereeTableLeagues';
import type { RefereePageData } from '@/server/people/refereePage';
import type { RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import RecentMatchesTable from './RecentMatchesTable';
import styles from './personPage.module.scss';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr');
}

/** Hakem sayfası: başlık, özet kartları (lig ortalamasıyla), sezon tablosu (mini çubuklar), son 10 maç, sezon seçicili takım kırılımı. Yalnız sayılar. */
export default function RefereeView({ data }: { data: RefereePageData }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
  const pm = (total: number, matches: number) => (matches > 0 ? nf.format(Math.round((total / matches) * 100) / 100) : '—');
  const { teams, summary } = data;
  const [teamSeason, setTeamSeason] = useState(teams.defaultSeason);
  const breakdown = teams.seasons.find((s) => s.seasonName === teamSeason) ?? teams.seasons[0] ?? null;

  // Sezon tablosu mini çubukları: sütun başına en büyük değere göre (yalnız görsel; sayı hücrede).
  const maxOf = (get: (r: RefereeSeasonTableRow) => number | null) => Math.max(0, ...data.seasons.map((r) => get(r) ?? 0));
  const max = {
    yellow: maxOf((r) => r.yellowPerMatch),
    red: maxOf((r) => r.redPerMatch),
    penalties: maxOf((r) => r.penaltiesPerMatch),
    fouls: maxOf((r) => r.foulsPerMatch),
    var: maxOf((r) => r.varPerMatch),
  };
  const barCell = (v: number | null, m: number) => (
    <span className={styles.barCell}>
      <span>{fmt(v)}</span>
      <span className={styles.miniTrack} aria-hidden="true">
        <span className={styles.miniFill} style={{ width: `${v != null && m > 0 ? Math.max(4, (v / m) * 100) : 0}%` }} />
      </span>
    </span>
  );

  const ctx = summary.context;
  const ctxLabel = ctx ? `${personLeagueLabel(ctx.leagueId, tl, '')} ${ctx.seasonName}`.trim() : '';
  const cards: { key: string; label: string; value: string; avg?: string | null }[] = [
    { key: 'matches', label: t('person.summaryMatches'), value: String(summary.totalMatches), avg: t('person.summarySeasons', { count: summary.seasonCount }) },
    ...(ctx
      ? ([
          ['yellow', 'person.colYellowPm'],
          ['red', 'person.colRedPm'],
          ['penalties', 'person.colPenPm'],
          ['var', 'person.colVarPm'],
        ] as const).map(([k, label]) => ({
          key: k,
          label: t(label),
          value: fmt(ctx.rates[k]),
          avg: ctx.leagueAvg ? t('person.leagueAvg', { value: fmt(ctx.leagueAvg[k]) }) : null,
        }))
      : []),
  ];

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
                {countryDisplayName(data.country, locale)}
              </span>
            </p>
          ) : null}
          <p className={styles.facts}>
            <Link href={refereeComparePath(data.seasons, personSlug(data.name, data.id))} className={styles.teamLink} prefetch={false}>
              {t('person.compareWith')}
            </Link>
          </p>
        </div>
      </header>

      <section className={styles.card} aria-labelledby="ref-summary">
        <h2 id="ref-summary" className={styles.sectionTitle}>
          {t('person.summaryTitle')}
          {ctx ? <span className={styles.sectionSub}> · {t('person.summaryContext', { context: ctxLabel, count: ctx.matches })}</span> : null}
        </h2>
        <dl className={styles.statCards} data-testid="referee-summary">
          {cards.map((c) => (
            <div key={c.key} className={styles.statCard}>
              <dt>{c.label}</dt>
              <dd className={styles.statValue}>{c.value}</dd>
              {c.avg ? <dd className={styles.statAvg}>{c.avg}</dd> : null}
            </div>
          ))}
        </dl>
      </section>

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
                    <td className={styles.left}>{personLeagueLabel(s.leagueId, tl)}</td>
                    <td>{s.matches}</td>
                    <td>{barCell(s.yellowPerMatch, max.yellow)}</td>
                    <td>{barCell(s.redPerMatch, max.red)}</td>
                    <td>{barCell(s.penaltiesPerMatch, max.penalties)}</td>
                    <td>{barCell(s.foulsPerMatch, max.fouls)}</td>
                    <td>{barCell(s.varPerMatch, max.var)}</td>
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
          {breakdown ? t('person.teamsTitleSeason', { season: breakdown.seasonName, count: breakdown.matchCount }) : t('person.teamsTitleLast', { count: 0 })}
        </h2>
        {teams.seasons.length > 1 ? (
          <div className={styles.toolbar}>
            <select
              className={styles.select}
              value={breakdown?.seasonName ?? ''}
              aria-label={t('person.seasonLabel')}
              onChange={(e) => setTeamSeason(e.target.value)}
            >
              {teams.seasons.map((s) => (
                <option key={s.seasonName} value={s.seasonName}>
                  {s.seasonName} ({t('list.matchCount', { count: s.matchCount })})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {!breakdown || breakdown.rows.length === 0 ? (
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
                {breakdown.rows.map((r) => (
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

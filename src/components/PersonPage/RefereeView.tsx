import Link from 'next/link';
import { buildRefereeSummary } from '@/utils/refereeSeo';
import { useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { personLeagueLabel } from './leagueLabel';
import { countryDisplayName } from '@/utils/countryName';
import { personSlug } from '@/utils/personUrl';
import { refereeComparePath } from '@/config/refereeTableLeagues';
import type { RefereePageData } from '@/server/people/refereePage';
import RecentMatchesTable from './RecentMatchesTable';
import RefereeCompetitionTable from './RefereeCompetitionTable';
import RefereeFanRating from './RefereeFanRating';
import RefereeAiReport from './RefereeAiReport';
import PersonAvatar from './PersonAvatar';
import RefereeProfileSide from './RefereeProfileSide';
import RefereeNextMatch from './RefereeNextMatch';
import styles from './personPage.module.scss';
import { teamHref } from '@/utils/teamUrl';

export { initials } from './PersonAvatar';

/** Hakem sayfası: başlık, özet kartları (lig ortalamasıyla), turnuva tablosu (sezonlar açılır), son 10 maç, sezon seçicili takım kırılımı. Yalnız sayılar. */
export default function RefereeView({ data }: { data: RefereePageData }) {
  // Alıntılanabilir özet (SEO/GEO): sunucu HTML'inde, başlığın hemen altında.
  const seoSummary = buildRefereeSummary(data);
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
  const pm = (total: number, matches: number) => (matches > 0 ? nf.format(Math.round((total / matches) * 100) / 100) : '—');
  const { teams, summary } = data;
  const [teamSeason, setTeamSeason] = useState(teams.defaultSeason);
  const breakdown = teams.seasons.find((s) => s.seasonName === teamSeason) ?? teams.seasons[0] ?? null;

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

  const compareHref = refereeComparePath(data.seasons, personSlug(data.name, data.id));

  // Masaüstünde bölünmüş ekran: solda profil, sağda bağlamsal panel (sıradaki görev, UEFA kariyeri, lig ortalaması).
  return (
    <div className={styles.split}>
      <div className={styles.splitMain}>
      <header className={`${styles.card} ${styles.header}`}>
        <PersonAvatar name={data.name} photo={data.photo} size={72} className={styles.avatar} priority />
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
            <Link href={compareHref} className={styles.teamLink} prefetch={false}>
              {t('person.compareWith')}
            </Link>
          </p>
        </div>
      </header>
      <RefereeNextMatch data={data} ctxLabel={ctxLabel} />
      {seoSummary.length ? <p className={styles.seoSummary}>{seoSummary.join(' ')}</p> : null}

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

      {/* Hakem karnesi: özet istatistiklerin hemen altında (grafikli; istemcide yüklenir). */}
      <RefereeAiReport refereeId={data.id} />

      {data.trMatches?.length ? (
        <RecentMatchesTable matches={data.trMatches} title={t('person.trMatchesTitle')} sectionId="referee-tr-matches" note={t('person.trMatchesNote')} />
      ) : null}

      <RefereeCompetitionTable rows={data.seasons} fmt={fmt} />

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
                      <Link href={teamHref(r.teamId, r.name)} className={styles.teamCellLink} prefetch={false}>
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
      <RefereeFanRating refereeId={data.id} />
      </div>
      <RefereeProfileSide data={data} compareHref={compareHref} />
    </div>
  );
}

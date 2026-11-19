import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { refereeHref } from '@/utils/personUrl';
import { buildMatchHref } from '@/utils/matchUrl';
import { isoDateToTr } from '@/utils/dateFormat';
import { weightedRatesWithFouls } from '@/utils/refereeAverages';
import { countryDisplayName } from '@/utils/countryName';
import type { RefereeLeagueTable, RefereeTableRow } from '@/server/people/refereeLeagueTable';
import PersonAvatar from './PersonAvatar';
import styles from './personPage.module.scss';
import ts from './refereeTable.module.scss';

const METRICS = [
  ['yellow', 'person.colYellowPm', 'yellowPerMatch'],
  ['red', 'person.colRedPm', 'redPerMatch'],
  ['penalties', 'person.colPenPm', 'penaltiesPerMatch'],
  ['fouls', 'person.colFoulsPm', 'foulsPerMatch'],
  ['var', 'person.colVarPm', 'varPerMatch'],
] as const;

/**
 * /hakemler sağ paneli (masaüstünde tablonun yanında, mobilde altında): ligin hakem ortalaması, seçili hakemin özeti
 * (lig ortalamasıyla yan yana, yorum yok), UEFA tablolarında Türk takımlarının maçları + hakemleri, haftalık atamalar
 * linki. Hepsi tablo verisinden; ek istek yok.
 */
export default function RefereeTableSide({ data, leagueName, selected, weekHref }: { data: RefereeLeagueTable; leagueName: string; selected?: RefereeTableRow; weekHref?: string }) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
  const avg = weightedRatesWithFouls(data.rows);
  const totalMatches = data.rows.reduce((n, r) => n + r.matches, 0);

  return (
    <aside className={styles.side} aria-label={t('person.sideLeagueAvgTitle')} data-testid="referee-table-side">
      <section className={styles.card} aria-labelledby="side-avg">
        <h2 id="side-avg" className={styles.sectionTitle}>
          {t('person.sideLeagueAvgTitle')}
        </h2>
        <div className={styles.sideBody}>
          <p className={styles.sideSub}>
            {leagueName} {data.season.name} · {t('person.sideLeagueAvgSub', { referees: data.rows.length, matches: totalMatches })}
          </p>
          <dl className={styles.sideStats}>
            {METRICS.map(([k, label]) => (
              <div key={k}>
                <dt>{t(label)}</dt>
                <dd>{fmt(avg[k])}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="side-selected" data-testid="referee-side-selected">
        <h2 id="side-selected" className={styles.sectionTitle}>
          {t('person.sideSelectedTitle')}
        </h2>
        {selected ? (
          <div className={styles.sideBody}>
            <div className={styles.sidePerson}>
              <PersonAvatar name={selected.name} photo={selected.photo} size={52} className={styles.sideAvatar} />
              <div>
                <p className={styles.sideName}>{selected.name}</p>
                <p className={styles.sideSub}>
                  {selected.country ? (
                    <>
                      {selected.country.flag ? <TeamLogo src={selected.country.flag} width={18} height={12} className={ts.rowFlag} /> : null}{' '}
                      {countryDisplayName(selected.country, locale)} ·{' '}
                    </>
                  ) : null}
                  {data.season.name} · {selected.matches} {t('person.colMatches').toLocaleLowerCase(locale === 'en' ? 'en' : 'tr')}
                </p>
              </div>
            </div>
            <dl className={styles.sideStats}>
              {METRICS.map(([k, label, field]) => (
                <div key={k}>
                  <dt>{t(label)}</dt>
                  <dd>
                    {fmt(selected[field])}
                    <span className={styles.sideStatAvg}>{t('person.sideLeagueAvgShort', { value: fmt(avg[k]) })}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <Link href={refereeHref(selected.refereeId, selected.name)} className={styles.sideLink}>
              {t('person.profileLink')}
            </Link>
          </div>
        ) : (
          <p className={styles.empty}>{t('person.sideSelectedHint')}</p>
        )}
      </section>

      {data.trMatches?.length ? (
        <section className={styles.card} aria-labelledby="side-tr" data-testid="referee-side-tr">
          <h2 id="side-tr" className={styles.sectionTitle}>
            {t('person.sideTrMatchesTitle')}
          </h2>
          <ul className={styles.sideList}>
            {data.trMatches.slice(0, 12).map((m) => (
              <li key={m.fixtureId} className={styles.sideListItem}>
                <Link href={buildMatchHref({ id: m.fixtureId, home_name: m.home.name, away_name: m.away.name })} className={styles.sideMatch} prefetch={false}>
                  <TeamLogo src={m.home.logo} width={16} />
                  {m.home.name}
                  <span aria-hidden="true">–</span>
                  <TeamLogo src={m.away.logo} width={16} />
                  {m.away.name}
                </Link>
                <span className={styles.sideMeta}>
                  {m.startingAt ? <span>{isoDateToTr(m.startingAt.slice(0, 10))}</span> : null}
                  {m.referee ? (
                    <span>
                      {t('person.refereeLabel')}:{' '}
                      <Link href={refereeHref(m.referee.id, m.referee.name)} prefetch={false}>
                        {m.referee.name}
                      </Link>
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>{t('person.sideTrMatchesNote')}</p>
        </section>
      ) : null}

      {weekHref ? (
        <section className={styles.card} aria-labelledby="side-week">
          <h2 id="side-week" className={styles.sectionTitle}>
            {t('person.sideWeekTitle')}
          </h2>
          <div className={styles.sideBody}>
            <Link href={weekHref} className={styles.sideLink} prefetch={false}>
              {t('person.sideWeekLink', { league: leagueName })}
            </Link>
          </div>
        </section>
      ) : null}
    </aside>
  );
}

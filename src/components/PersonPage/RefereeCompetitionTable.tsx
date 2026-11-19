import { Fragment, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { weightedRatesWithFouls, type RefereeRates } from '@/utils/refereeAverages';
import type { RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import { personLeagueLabel } from './leagueLabel';
import styles from './personPage.module.scss';

export type CompetitionGroup = {
  key: string;
  leagueId: number | null;
  matches: number;
  /** Yeni sezon önce (girişteki sıra korunur). */
  seasons: RefereeSeasonTableRow[];
  /** "2014–2027" ya da tek sezonda "2025/2026". */
  span: string;
  rates: RefereeRates & { fouls: number | null };
};

const years = (seasonName: string) => seasonName.split('/').map((y) => y.trim()).filter(Boolean);

/** Lig × sezon satırlarını turnuvaya göre toplar: maç ağırlıklı ortalama, en çok maçlı turnuva önce. */
export function groupByCompetition(rows: readonly RefereeSeasonTableRow[]): CompetitionGroup[] {
  const map = new Map<string, RefereeSeasonTableRow[]>();
  for (const r of rows) {
    const key = r.leagueId == null ? 'x' : String(r.leagueId);
    map.set(key, [...(map.get(key) ?? []), r]);
  }
  return [...map.entries()]
    .map(([key, seasons]) => {
      const newest = years(seasons[0].seasonName);
      const oldest = years(seasons[seasons.length - 1].seasonName);
      const span = seasons.length === 1 ? seasons[0].seasonName : `${oldest[0] ?? ''}–${newest[newest.length - 1] ?? ''}`;
      return {
        key,
        leagueId: seasons[0].leagueId,
        matches: seasons.reduce((n, s) => n + s.matches, 0),
        seasons,
        span,
        rates: weightedRatesWithFouls(seasons),
      };
    })
    .sort((a, b) => b.matches - a.matches || (a.leagueId ?? 0) - (b.leagueId ?? 0));
}

/** Hakem sayfası: turnuva başına tek satır (tüm sezonların maç ağırlıklı ortalaması); satıra dokununca sezonlar açılır. */
export default function RefereeCompetitionTable({ rows, fmt }: { rows: readonly RefereeSeasonTableRow[]; fmt: (n: number | null | undefined) => string }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const groups = groupByCompetition(rows);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const total = groups.length > 1 ? weightedRatesWithFouls(rows) : null;
  const totalMatches = rows.reduce((n, r) => n + r.matches, 0);

  const rateCells = (r: { yellow: number | null; red: number | null; penalties: number | null; fouls: number | null; var: number | null }) => (
    <>
      <td>{fmt(r.yellow)}</td>
      <td>{fmt(r.red)}</td>
      <td>{fmt(r.penalties)}</td>
      <td>{fmt(r.fouls)}</td>
      <td>{fmt(r.var)}</td>
    </>
  );

  return (
    <section className={styles.card} aria-labelledby="ref-seasons">
      <h2 id="ref-seasons" className={styles.sectionTitle}>
        {t('person.competitionsTitle')}
        <span className={styles.sectionSub}> · {t('person.competitionsSub')}</span>
      </h2>
      {groups.length === 0 ? (
        <p className={styles.empty}>{t('person.empty')}</p>
      ) : (
        <div className={styles.scroll}>
          <table className={`${styles.table} ${styles.compTable}`} data-testid="referee-competitions">
            <thead>
              <tr>
                <th className={styles.left}>{t('person.colLeague')}</th>
                <th>{t('person.colMatches')}</th>
                <th>{t('person.colYellowShort')}</th>
                <th>{t('person.colRedShort')}</th>
                <th>{t('person.colPenShort')}</th>
                <th>{t('person.colFoulsShort')}</th>
                <th>{t('person.colVarShort')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const label = personLeagueLabel(g.leagueId, tl);
                const many = g.seasons.length > 1;
                const isOpen = open.has(g.key);
                return (
                  <Fragment key={g.key}>
                    <tr className={isOpen ? styles.compRowOpen : undefined}>
                      <td className={styles.left}>
                        {many ? (
                          <button
                            type="button"
                            className={styles.compToggle}
                            aria-expanded={isOpen}
                            onClick={() => toggle(g.key)}
                          >
                            <span className={styles.compChevron} aria-hidden="true" />
                            <span className={styles.compName}>{label}</span>
                            <span className={styles.compMeta}>
                              {t('person.summarySeasons', { count: g.seasons.length })} · <span className={styles.compSpan}>{g.span}</span>
                            </span>
                          </button>
                        ) : (
                          <span className={styles.compStatic}>
                            <span className={styles.compName}>{label}</span>
                            <span className={styles.compMeta}>{g.span}</span>
                          </span>
                        )}
                      </td>
                      <td className={styles.compMatches}>{g.matches}</td>
                      {rateCells(g.rates)}
                    </tr>
                    {many && isOpen
                      ? g.seasons.map((s) => (
                          <tr key={s.seasonId} className={styles.compSeasonRow}>
                            <td className={styles.left}>{s.seasonName}</td>
                            <td>{s.matches}</td>
                            {rateCells({ yellow: s.yellowPerMatch, red: s.redPerMatch, penalties: s.penaltiesPerMatch, fouls: s.foulsPerMatch, var: s.varPerMatch })}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
            {total ? (
              <tfoot>
                <tr className={styles.compTotal}>
                  <td className={styles.left}>{t('person.allCompetitions')}</td>
                  <td>{totalMatches}</td>
                  {rateCells(total)}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      )}
    </section>
  );
}

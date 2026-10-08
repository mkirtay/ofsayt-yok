import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import type { PlayerSeasonStats } from '@/services/playerProfile';
import { buildPlayerCareer, isCareerPartial, shortSeasonName, type CareerRow, type CareerTotals } from '@/utils/playerCareer';
import styles from './playerProfile.module.scss';

/**
 * Kariyer — tüm sezonlar tek tabloda (sezon azalan; lig grubu önce, kupa/uluslararası ayrı grup), grup ara toplamları,
 * genel toplam ve 2+ takımda takım bazında toplamlar. Veri sezon seçicisiyle AYNI profil yanıtı (yeni istek yok).
 * Dar ekranda (<640px) turnuva takım adının altına iner; yine sığmazsa tablo kendi içinde yatay kayar (sayfa kaymaz); sütun başlıkları `scope`'lu, kısaltmalar `abbr title`'lı.
 */
export default function Career({ seasons }: { seasons: PlayerSeasonStats[] }) {
  const { t } = useTranslation('player');
  const career = useMemo(() => buildPlayerCareer(seasons), [seasons]);
  if (career.groups.length === 0) return null;
  const showSubtotals = career.groups.length > 1;
  const partialBadge = <span className={styles.partialBadge}>{t('career.partial')}</span>;

  const numCells = (x: CareerTotals | CareerRow) => (
    <>
      <td className={styles.num}>{x.apps ?? '—'}</td>
      <td className={styles.num}>{x.goals}</td>
      <td className={styles.num}>{x.assists}</td>
    </>
  );

  return (
    <section className={styles.card} aria-labelledby="pp-career" data-testid="player-career">
      <div className={styles.careerHead}>
        <h2 id="pp-career" className={styles.cardTitle}>{t('career.title')}</h2>
        {/* Kapsam notu başlığın altında, tek cümle (eskiden tablonun altındaydı ve görülmüyordu). */}
        <p className={styles.careerCoverage}>{t('career.coverage')}</p>
      </div>
      <div className={styles.tableScroll} role="region" aria-label={t('career.caption')} tabIndex={0}>
        <table className={`${styles.table} ${styles.careerTable}`}>
          <caption className={styles.srOnly}>{t('career.caption')}</caption>
          <thead>
            <tr>
              <th scope="col" className={styles.left}>{t('career.season')}</th>
              <th scope="col" className={styles.left}>{t('career.team')}</th>
              <th scope="col" className={`${styles.left} ${styles.careerComp}`}>{t('career.competition')}</th>
              <th scope="col" className={styles.num}><abbr title={t('career.apps')}>{t('career.appsShort')}</abbr></th>
              <th scope="col" className={styles.num}><abbr title={t('career.goals')}>{t('career.goalsShort')}</abbr></th>
              <th scope="col" className={styles.num}><abbr title={t('career.assists')}>{t('career.assistsShort')}</abbr></th>
            </tr>
          </thead>
          {career.groups.map((g) => (
            <tbody key={g.kind} data-group={g.kind}>
              {/* Grup / toplam satırları turnuva sütununa ayrı (boş) hücre koyar: dar ekranda o sütun gizlenince colSpan kaymasın. */}
              <tr className={styles.careerGroup}>
                <th scope="rowgroup" colSpan={2} className={styles.left}>{t(`career.groups.${g.kind}`)}</th>
                <td className={styles.careerComp} />
                <td colSpan={3} />
              </tr>
              {g.rows.map((r) => (
                <tr key={r.key} data-testid="career-row">
                  <td className={styles.left}>{shortSeasonName(r.seasonName)}</td>
                  <th scope="row" className={`${styles.left} ${styles.careerTeam}`}>
                    {r.teamId != null ? (
                      <Link href={`/teams/${r.teamId}`} className={styles.teamCell} prefetch={false}>
                        {r.teamLogo ? <TeamLogo src={r.teamLogo} alt="" width={18} height={18} className={styles.teamLogo} /> : null}
                        <span className={styles.teamName}>{r.teamName ?? '—'}</span>
                      </Link>
                    ) : (
                      <span className={styles.teamCell}>
                        <span className={styles.teamName}>{r.teamName ?? '—'}</span>
                      </span>
                    )}
                    {/* Dar ekranda turnuva sütunu gizlenir, ad takımın altında görünür (display:none → ekran okuyucu ikisinden yalnız görüneni okur). */}
                    {r.leagueName ? <span className={styles.careerCompInline}>{r.leagueName}</span> : null}
                  </th>
                  <td className={`${styles.left} ${styles.careerComp}`}>{r.leagueName ?? '—'}</td>
                  {numCells(r)}
                </tr>
              ))}
              {showSubtotals ? (
                <tr className={styles.careerSubtotal} data-testid={`career-subtotal-${g.kind}`}>
                  <th scope="row" colSpan={2} className={styles.left}>{t(`career.subtotal.${g.kind}`)}</th>
                  <td className={styles.careerComp} />
                  {numCells(g.total)}
                </tr>
              ) : null}
            </tbody>
          ))}
          <tfoot>
            <tr className={styles.careerTotal} data-testid="career-total">
              <th scope="row" colSpan={2} className={styles.left}>
                {t('career.total')}
                {isCareerPartial(career) ? <> {partialBadge}</> : null}
              </th>
              <td className={styles.careerComp} />
              {numCells(career.total)}
            </tr>
          </tfoot>
        </table>
      </div>

      {career.teams.length > 1 ? (
        <>
          <h3 className={styles.groupTitle} id="pp-career-teams">{t('career.byTeam')}</h3>
          <ul className={styles.careerTeams} aria-labelledby="pp-career-teams">
            {career.teams.map((tm) => (
              <li key={tm.key} data-testid="career-team-total">
                <span className={styles.teamCell}>
                  {tm.teamLogo ? <TeamLogo src={tm.teamLogo} alt="" width={18} height={18} className={styles.teamLogo} /> : null}
                  <span className={styles.teamName}>{tm.teamName}</span>
                  {tm.partial ? partialBadge : null}
                </span>
                <span className={styles.careerTeamNums}>
                  <span><abbr title={t('career.apps')}>{t('career.appsShort')}</abbr> {tm.apps}</span>
                  <span><abbr title={t('career.goals')}>{t('career.goalsShort')}</abbr> {tm.goals}</span>
                  <span><abbr title={t('career.assists')}>{t('career.assistsShort')}</abbr> {tm.assists}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {career.missingApps ? <p className={styles.careerNote}>{t('career.missingApps')}</p> : null}
    </section>
  );
}

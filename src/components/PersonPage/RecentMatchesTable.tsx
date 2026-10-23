import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { personLeagueLabel } from './leagueLabel';
import { buildMatchHref } from '@/utils/matchUrl';
import { isoDateToTr } from '@/utils/dateFormat';
import type { PersonRecentMatch } from '@/server/people/refereePage';
import styles from './personPage.module.scss';

type LoadMore = { coachId: number };

/**
 * Son maçlar: tarih, maç (takım logolu, maç sayfasına link), skor, lig. `loadMore` verilirse (teknik direktör sayfası,
 * `hasMore`) tablonun altında "Daha fazla" düğmesi: sonraki 10 maç `/api/coaches/[id]/matches?page=N` ile gelir.
 */
export default function RecentMatchesTable({ matches, loadMore, hasMore = false }: { matches: PersonRecentMatch[]; loadMore?: LoadMore; hasMore?: boolean }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const [extra, setExtra] = useState<PersonRecentMatch[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(hasMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const rows = [...matches, ...extra.filter((m) => !matches.some((x) => x.id === m.id))];

  const onLoadMore = async () => {
    if (!loadMore || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/coaches/${loadMore.coachId}/matches?page=${page}`);
      if (res.status === 404) {
        setMore(false);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { matches: PersonRecentMatch[]; hasMore: boolean };
      setExtra((prev) => [...prev, ...body.matches]);
      setPage((p) => p + 1);
      setMore(body.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };
  return (
    <section className={styles.card} aria-labelledby="person-recent">
      <h2 id="person-recent" className={styles.sectionTitle}>
        {rows.length > matches.length ? t('person.recentTitleN', { count: rows.length }) : t('person.recentTitle')}
      </h2>
      {rows.length === 0 ? (
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
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className={styles.muted}>{m.date ? isoDateToTr(m.date) : '—'}</td>
                  <td className={styles.left}>
                    <Link href={buildMatchHref({ id: m.id, home_name: m.home.name, away_name: m.away.name })} className={styles.matchLink} prefetch={false}>
                      <span className={styles.matchTeam}>
                        <TeamLogo src={m.home.logo} width={18} />
                        {m.home.name}
                      </span>
                      <span className={styles.matchDash} aria-hidden="true">–</span>
                      <span className={styles.matchTeam}>
                        <TeamLogo src={m.away.logo} width={18} />
                        {m.away.name}
                      </span>
                    </Link>
                  </td>
                  <td className={styles.score}>{m.scores?.score?.replace(/\s+/g, '') || '—'}</td>
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
      {loadMore && (more || failed) ? (
        <div className={styles.loadMore}>
          {failed ? <p className={styles.loadMoreError} role="alert">{t('person.loadMoreError')}</p> : null}
          <button type="button" className={styles.loadMoreBtn} onClick={onLoadMore} disabled={loading}>
            {loading ? t('person.loadingMore') : failed ? t('person.retry') : t('person.loadMore')}
          </button>
        </div>
      ) : null}
    </section>
  );
}

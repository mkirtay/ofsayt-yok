import Link from 'next/link';
import type { TopScorerEntry, TopScorersPayload } from '@/services/liveScoreService';
import styles from './matchCompetitionTopScorers.module.scss';

function rankCellClass(rank: number): string {
  if (rank === 1) return `${styles.rankBadge} ${styles.rank1}`;
  if (rank === 2) return `${styles.rankBadge} ${styles.rank2}`;
  if (rank === 3) return `${styles.rankBadge} ${styles.rank3}`;
  return styles.rankPlain;
}

interface MatchCompetitionTopScorersProps {
  data: TopScorersPayload | null;
  loading?: boolean;
}

export default function MatchCompetitionTopScorers({
  data,
  loading,
}: MatchCompetitionTopScorersProps) {
  if (loading) {
    return (
      <section className={styles.block} aria-label="Gol krallığı">
        <div className={styles.sectionDivider} aria-hidden />
        <div className={styles.loading}>Gol krallığı yükleniyor…</div>
      </section>
    );
  }

  const list = data?.topscorers ?? [];
  const seasonName = data?.season?.name;

  if (!list.length) {
    return (
      <section className={styles.block} aria-label="Gol krallığı">
        <div className={styles.sectionDivider} aria-hidden />
        <div className={styles.titleContainer}>
          <h2 className={styles.title}>Gol Krallığı</h2>
          {seasonName ? <p className={styles.season}>Sezon: {seasonName}</p> : null}
        </div>
        <p className={styles.empty}>Gol krallığı verisi bulunamadı.</p>
      </section>
    );
  }

  return (
    <section className={styles.block} aria-label="Gol krallığı">
      <div className={styles.sectionDivider} aria-hidden />
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>Gol Krallığı</h2>
        {seasonName ? <p className={styles.season}>Sezon: {seasonName}</p> : null}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colRank}>#</th>
              <th className={styles.colPlayerTeam}>Oyuncu</th>
              <th>O</th>
              <th>A</th>
              <th className={styles.colGoals}>G</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row: TopScorerEntry, i: number) => {
              const rank = i + 1;
              const pid = row.player?.id;
              const pname = row.player?.name ?? '—';
              const photo = row.player?.photo;
              const tid = row.team?.id;
              const tname = row.team?.name ?? '—';
              const logo = row.team?.logo;
              return (
                <tr key={`${pid ?? 'p'}-${tid ?? 't'}-${i}`}>
                  <td className={styles.colRank}>
                    <span className={rankCellClass(rank)}>{rank}</span>
                  </td>
                  <td className={styles.colPlayerTeam}>
                    <div className={styles.playerTeamCell}>
                      {photo ? (
                        <img
                          src={photo}
                          alt=""
                          className={styles.playerPhoto}
                          width={18}
                          height={18}
                        />
                      ) : null}
                      {logo ? (
                        <img
                          src={logo}
                          alt=""
                          className={styles.teamLogo}
                          width={16}
                          height={16}
                        />
                      ) : null}
                      <div className={styles.nameStack}>
                        <span className={styles.playerName}>{pname}</span>
                        {tid != null ? (
                          <Link
                            href={`/teams/${tid}`}
                            className={styles.teamSubLink}
                            prefetch={false}
                          >
                            {tname}
                          </Link>
                        ) : (
                          <span className={styles.teamSubText}>{tname}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{row.played ?? '—'}</td>
                  <td>{row.assists ?? '—'}</td>
                  <td className={styles.colGoals}>{row.goals}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

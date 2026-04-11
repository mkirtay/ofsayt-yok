import Link from 'next/link';
import { CompetitionTableStandingRow } from '@/services/liveScoreService';
import styles from './worldCupGroupCard.module.scss';

type WorldCupGroupCardProps = {
  groupName: string;
  standings: CompetitionTableStandingRow[];
};

function teamName(row: CompetitionTableStandingRow): string {
  return row.team?.name || row.name || '—';
}

function teamId(row: CompetitionTableStandingRow): number | null {
  const id = row.team?.id ?? row.team_id;
  return typeof id === 'number' ? id : null;
}

function teamLogo(row: CompetitionTableStandingRow): string | undefined {
  return row.team?.logo || row.logo;
}

export default function WorldCupGroupCard({ groupName, standings }: WorldCupGroupCardProps) {
  return (
    <section className={styles.card}>
      <header className={styles.header}>
        <h3 className={styles.title}>Group {groupName}</h3>
      </header>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colRank}>#</th>
              <th className={styles.colTeam}>Team</th>
              <th>P</th>
              <th>W</th>
              <th>D</th>
              <th>L</th>
              <th>GF</th>
              <th>GA</th>
              <th>GD</th>
              <th>Pts</th>
              <th className={styles.colForm}>Form</th>
            </tr>
          </thead>
          <tbody>
            {standings.length ? (
              standings.map((row, index) => {
                const id = teamId(row);
                const logo = teamLogo(row);
                return (
                  <tr key={`${id ?? row.rank}-${index}`}>
                    <td className={styles.colRank}>{row.rank}</td>
                    <td className={styles.colTeam}>
                      <div className={styles.teamCell}>
                        {logo ? <img src={logo} alt="" width={16} height={16} className={styles.teamLogo} /> : null}
                        {id != null ? (
                          <Link href={`/teams/${id}`} className={styles.teamLink} prefetch={false}>
                            {teamName(row)}
                          </Link>
                        ) : (
                          <span className={styles.teamName}>{teamName(row)}</span>
                        )}
                      </div>
                    </td>
                    <td>{row.matches}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goals_scored ?? 0}</td>
                    <td>{row.goals_conceded ?? 0}</td>
                    <td>{row.goal_diff}</td>
                    <td className={styles.points}>{row.points}</td>
                    <td className={styles.form}>- - - - -</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className={styles.empty}>
                  Grup tablosu bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

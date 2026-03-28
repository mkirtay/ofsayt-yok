import Link from 'next/link';
import { Match } from '../../models/liveScore';
import styles from './matchList.module.scss';

interface MatchListProps {
  groupedMatches: {
    competition_id: number;
    competition_name: string;
    matches: Match[];
  }[];
}

export default function MatchList({ groupedMatches }: MatchListProps) {
  if (groupedMatches.length === 0) {
    return <div className={styles.empty}>Şu an gösterilecek maç bulunmuyor.</div>;
  }

  return (
    <div className={styles.matchList}>
      {groupedMatches.map((group) => (
        <div key={group.competition_id} className={styles.group}>
          <div className={styles.groupHeader}>{group.competition_name}</div>
          <table className={styles.table}>
            <tbody>
              {group.matches.map((match) => {
                const homeName = match.home?.name || '';
                const awayName = match.away?.name || '';
                const score = match.scores?.score || '- : -';
                const time = match.time || '';
                const status = match.status;
                const isLive = status === 'IN PLAY' || status === 'HALF TIME BREAK';

                return (
                  <tr key={match.id} className={styles.row}>
                    <td className={`${styles.time} ${isLive ? styles.live : ''}`}>
                      {isLive ? `${time}'` : status === 'FINISHED' ? 'MS' : time}
                    </td>
                    <td className={styles.homeTeam}>{homeName}</td>
                    <td className={styles.score}>
                      <Link href={`/matches/${match.id}`} className={styles.scoreLink}>
                        {score}
                      </Link>
                    </td>
                    <td className={styles.awayTeam}>{awayName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

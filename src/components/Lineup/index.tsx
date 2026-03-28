import { LineupPlayer } from '@/models/domain';
import styles from './lineup.module.scss';

interface LineupProps {
  lineups: any | null;
}

export default function Lineup({ lineups }: LineupProps) {
  const homeData = lineups?.lineup?.home;
  const awayData = lineups?.lineup?.away;

  if (!homeData && !awayData) {
    return <div className={styles.empty}>Kadrolar henüz açıklanmadı.</div>;
  }

  const homePlayers: LineupPlayer[] = homeData?.players || [];
  const awayPlayers: LineupPlayer[] = awayData?.players || [];

  const homeStarters = homePlayers.filter((p) => p.substitution === '0');
  const awayStarters = awayPlayers.filter((p) => p.substitution === '0');

  const homeTeamName = homeData?.team?.name || 'Ev Sahibi';
  const awayTeamName = awayData?.team?.name || 'Deplasman';

  return (
    <div className={styles.lineupContainer}>
      <h3 className={styles.title}>İlk 11</h3>
      <div className={styles.content}>
        <div className={styles.side}>
          <div className={styles.sideTitle}>{homeTeamName}</div>
          <ul className={styles.playerList}>
            {homeStarters.map((p) => (
              <li key={p.id} className={styles.player}>
                <span className={styles.number}>{p.shirt_number}</span>
                <span className={styles.name}>{p.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.pitch}>
          <div className={styles.pitchInner}>
            <div className={styles.centerCircle} />
            <div className={styles.halfLine} />
            <div className={styles.penaltyAreaTop} />
            <div className={styles.penaltyAreaBottom} />
          </div>
        </div>

        <div className={styles.side}>
          <div className={styles.sideTitle}>{awayTeamName}</div>
          <ul className={styles.playerList}>
            {awayStarters.map((p) => (
              <li key={p.id} className={styles.player}>
                <span className={styles.number}>{p.shirt_number}</span>
                <span className={styles.name}>{p.name}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

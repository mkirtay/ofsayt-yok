import type { Lineup } from "@/models/domain";
import styles from "./lineup.module.scss";

interface LineupProps {
  lineups: Lineup[];
}

export default function Lineup({ lineups }: LineupProps) {
  if (lineups.length === 0) {
    return <p className={styles.empty}>Lineup bilgisi yok.</p>;
  }

  return (
    <div className={styles.grid}>
      {lineups.map((lineup) => (
        <div key={lineup.teamId} className={styles.card}>
          <div className={styles.header}>
            <span className={styles.label}>Formasyon</span>
            <span className={styles.value}>{lineup.formation}</span>
          </div>
          <ul className={styles.players}>
            {lineup.startXI.map((player) => (
              <li key={`${lineup.teamId}-${player.number}`}>
                <span className={styles.number}>{player.number}</span>
                <span>{player.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

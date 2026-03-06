import type { Team } from "@/models/domain";
import styles from "./teamHeader.module.scss";

interface TeamHeaderProps {
  team: Team;
}

export default function TeamHeader({ team }: TeamHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <p className={styles.label}>Takım</p>
        <h2 className={styles.name}>{team.name}</h2>
      </div>
    </div>
  );
}

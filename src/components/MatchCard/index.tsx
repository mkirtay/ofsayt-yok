import Link from "next/link";

import type { Match } from "@/models/domain";
import styles from "./matchCard.module.scss";

interface MatchCardProps {
  match: Match;
  isHighlighted?: boolean;
  compact?: boolean;
}

export default function MatchCard({
  match,
  isHighlighted = false,
  compact = false,
}: MatchCardProps) {
  const isLive = match.status !== "FT" && match.status !== "NS";
  const totalGoals = match.score.home + match.score.away;
  const goalDiff = Math.abs(match.score.home - match.score.away);

  return (
    <article
      className={`${styles.card} ${isHighlighted ? styles.highlight : ""} ${
        compact ? styles.compact : ""
      }`}
    >
      <div className={styles.row}>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${isLive ? styles.live : styles.muted}`}>
            {isLive ? "LIVE" : match.status}
          </span>
          <span className={`${styles.badge} ${styles.time}`}>
            {match.elapsed}&apos;
          </span>
        </div>
        <div className={styles.teams}>
          <Link className={styles.teamLink} href={`/teams/${match.homeTeam.id}`}>
            <span className={styles.teamName}>{match.homeTeam.name}</span>
          </Link>
          <div className={styles.score}>
            {match.score.home} - {match.score.away}
          </div>
          <Link className={styles.teamLink} href={`/teams/${match.awayTeam.id}`}>
            <span className={styles.teamName}>{match.awayTeam.name}</span>
          </Link>
        </div>
        <div className={styles.meta}>
          <Link className={styles.detailLink} href={`/matches/${match.id}`}>
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}

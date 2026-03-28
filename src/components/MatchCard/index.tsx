import styles from './matchCard.module.scss';
import { Match } from '@/models/liveScore';
import Link from 'next/link';

interface MatchCardProps {
  match: Match | null;
}

export default function MatchCard({ match }: MatchCardProps) {
  if (!match) {
    return <div className={styles.matchCard}>Maç bilgisi bulunamadı</div>;
  }

  const compName = match.competition?.name || '';
  const homeName = match.home?.name || '';
  const awayName = match.away?.name || '';
  const homeLogo = match.home?.logo;
  const awayLogo = match.away?.logo;
  const score = match.scores?.score || '? - ?';
  const htScore = match.scores?.ht_score;
  const matchStatus = match.status || '';
  const matchTime = match.time || '';
  const location = match.location || '';

  return (
    <div className={styles.matchCard}>
      <div className={styles.leagueName}>{compName}</div>

      <div className={styles.teamsContainer}>
        <div className={styles.team}>
          <Link href={`/teams/${match.home?.id || ''}`} className={styles.teamLink}>
            {homeLogo ? (
              <img src={homeLogo} alt={homeName} className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>{homeName.charAt(0)}</div>
            )}
            <div className={styles.teamName}>{homeName}</div>
          </Link>
        </div>

        <div className={styles.scoreContainer}>
          <div className={styles.statusBadge}>
            {matchStatus === 'IN PLAY' ? `${matchTime}'` : matchStatus === 'FINISHED' ? 'MS' : matchStatus === 'HALF TIME BREAK' ? 'İY' : matchTime}
          </div>
          <div className={styles.score}>{score}</div>
          {htScore && <div className={styles.htScore}>İY: {htScore}</div>}
        </div>

        <div className={styles.team}>
          <Link href={`/teams/${match.away?.id || ''}`} className={styles.teamLink}>
            {awayLogo ? (
              <img src={awayLogo} alt={awayName} className={styles.logo} />
            ) : (
              <div className={styles.logoPlaceholder}>{awayName.charAt(0)}</div>
            )}
            <div className={styles.teamName}>{awayName}</div>
          </Link>
        </div>
      </div>

      {location && <div className={styles.location}>{location}</div>}
    </div>
  );
}

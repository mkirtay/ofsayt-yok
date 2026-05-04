import Link from 'next/link';
import type { BracketPair, BracketRound } from '@/utils/uefaBracket';
import styles from './bracket.module.scss';

type Props = {
  rounds: BracketRound[];
  competitionName?: string;
};

function TeamRow({
  team,
  highlighted,
}: {
  team: BracketPair['home'];
  highlighted: boolean;
}) {
  return (
    <div
      className={`${styles.team} ${highlighted ? styles.teamWinner : ''}`.trim()}
    >
      {team?.logo ? (
        <img
          src={team.logo}
          alt=""
          className={styles.teamLogo}
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={styles.teamLogoPlaceholder} aria-hidden />
      )}
      <span className={styles.teamName}>{team?.name ?? 'Belirsiz'}</span>
    </div>
  );
}

function PairCard({ pair }: { pair: BracketPair }) {
  const last = pair.matches[pair.matches.length - 1];
  const href = last ? `/matches/${last.id}` : undefined;
  const body = (
    <div className={styles.pairInner}>
      <div className={styles.teamsCol}>
        <TeamRow team={pair.home} highlighted={pair.winner === 'home'} />
        <TeamRow team={pair.away} highlighted={pair.winner === 'away'} />
      </div>
      {pair.scoreText ? (
        <div className={styles.scoreCol}>{pair.scoreText}</div>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} prefetch={false} className={styles.pair}>
        {body}
      </Link>
    );
  }
  return <div className={styles.pair}>{body}</div>;
}

export default function UefaKnockoutBracket({ rounds, competitionName }: Props) {
  if (!rounds.length) return null;

  return (
    <section className={styles.root} aria-label="Eleme turu braketi">
      {competitionName ? (
        <header className={styles.header}>
          <h3 className={styles.title}>{competitionName} — Eleme Braketi</h3>
        </header>
      ) : null}
      <div className={styles.scroller}>
        <div className={styles.columns}>
          {rounds.map((round) => (
            <div key={round.key} className={styles.column}>
              <div className={styles.columnHeader}>{round.label}</div>
              <div className={styles.columnBody}>
                {round.pairs.map((pair) => (
                  <PairCard key={pair.key} pair={pair} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

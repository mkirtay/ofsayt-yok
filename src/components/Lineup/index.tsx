import { LineupPlayer } from '@/models/domain';
import { LineupSkeleton } from '@/components/Skeleton';
import styles from './lineup.module.scss';

interface LineupProps {
  lineups: any | null;
  loading?: boolean;
}

type PositionKey = 'GK' | 'DF' | 'MF' | 'FW';
const POSITION_ORDER: PositionKey[] = ['GK', 'DF', 'MF', 'FW'];

function groupByPosition(players: LineupPlayer[]): Record<PositionKey, LineupPlayer[]> {
  const groups: Record<PositionKey, LineupPlayer[]> = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of players) {
    const key = POSITION_ORDER.includes(p.position as PositionKey)
      ? (p.position as PositionKey)
      : 'MF';
    groups[key].push(p);
  }
  for (const key of POSITION_ORDER) {
    groups[key].sort((a, b) => Number(a.shirt_number) - Number(b.shirt_number));
  }
  return groups;
}

function formationLabel(groups: Record<PositionKey, LineupPlayer[]>): string | null {
  const { DF, MF, FW } = groups;
  if (DF.length + MF.length + FW.length === 0) return null;
  return [DF.length, MF.length, FW.length].filter((n) => n > 0).join('-');
}

/** "Rodrigo De Paul" -> "R. D. Paul" (saha üzerinde kompakt gösterim). */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(' ');
  return `${initials} ${last}`;
}

function PlayerToken({ player, team }: { player: LineupPlayer; team: 'home' | 'away' }) {
  return (
    <div className={styles.formationPlayer} title={player.name}>
      <span className={`${styles.formationDot} ${team === 'home' ? styles.formationDotHome : styles.formationDotAway}`}>
        {player.shirt_number}
      </span>
      <span className={styles.formationName}>{shortName(player.name)}</span>
    </div>
  );
}

function flattenByPosition(groups: Record<PositionKey, LineupPlayer[]>): LineupPlayer[] {
  return POSITION_ORDER.flatMap((key) => groups[key]);
}

function CompactList({ players }: { players: LineupPlayer[] }) {
  return (
    <ul className={styles.compactList}>
      {players.map((p) => (
        <li key={p.id} className={styles.compactRow}>
          <span className={styles.compactNumber}>{p.shirt_number}</span>
          <span className={styles.compactName}>{p.name}</span>
        </li>
      ))}
    </ul>
  );
}

function FormationRows({
  groups,
  order,
  team,
}: {
  groups: Record<PositionKey, LineupPlayer[]>;
  order: PositionKey[];
  team: 'home' | 'away';
}) {
  const rows = order.map((key) => groups[key]).filter((row) => row.length > 0);
  return (
    <div className={`${styles.formationHalf} ${team === 'home' ? styles.formationHalfHome : styles.formationHalfAway}`}>
      {rows.map((row, i) => (
        <div key={i} className={styles.formationRow}>
          {row.map((p) => (
            <PlayerToken key={p.id} player={p} team={team} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Lineup({ lineups, loading }: LineupProps) {
  if (loading) {
    return <LineupSkeleton />;
  }

  const homeData = lineups?.lineup?.home;
  const awayData = lineups?.lineup?.away;

  if (!homeData && !awayData) {
    return <div className={styles.empty}>Kadrolar henüz açıklanmadı.</div>;
  }

  const homePlayers: LineupPlayer[] = homeData?.players || [];
  const awayPlayers: LineupPlayer[] = awayData?.players || [];

  const homeStarters = homePlayers.filter((p) => p.substitution === '0');
  const awayStarters = awayPlayers.filter((p) => p.substitution === '0');

  const homeGroups = groupByPosition(homeStarters);
  const awayGroups = groupByPosition(awayStarters);

  const homeTeamName = homeData?.team?.name || 'Ev Sahibi';
  const awayTeamName = awayData?.team?.name || 'Deplasman';
  const homeFormation = formationLabel(homeGroups);
  const awayFormation = formationLabel(awayGroups);

  return (
    <div className={styles.lineupContainer}>
      <h3 className={styles.title}>İlk 11</h3>

      <div className={styles.layout}>
        <CompactList players={flattenByPosition(homeGroups)} />

        <div className={styles.pitchCol}>
          <div className={styles.teamBar}>
            <span className={styles.teamBarName}>{homeTeamName}</span>
            {homeFormation && <span className={styles.formationBadge}>{homeFormation}</span>}
          </div>

          <div className={styles.pitch}>
            <div className={styles.pitchInner}>
              <div className={styles.penaltyAreaTop} />
              <div className={styles.penaltyAreaBottom} />
              <div className={styles.halfLine} />
              <div className={styles.centerCircle} />
            </div>

            <FormationRows groups={homeGroups} order={['GK', 'DF', 'MF', 'FW']} team="home" />
            <FormationRows groups={awayGroups} order={['FW', 'MF', 'DF', 'GK']} team="away" />
          </div>

          <div className={styles.teamBar}>
            <span className={styles.teamBarName}>{awayTeamName}</span>
            {awayFormation && <span className={styles.formationBadge}>{awayFormation}</span>}
          </div>
        </div>

        <CompactList players={flattenByPosition(awayGroups)} />
      </div>
    </div>
  );
}

import Link from 'next/link';
import type {
  CompetitionTableData,
  CompetitionTableStandingRow,
} from '@/services/liveScoreService';
import { getStandingRankZone } from '@/config/standingsZones';
import { standingsRankZoneClass } from '@/utils/standingsRankZoneUi';
import styles from './matchCompetitionStandings.module.scss';

function standingTeamId(s: CompetitionTableStandingRow): number | undefined {
  const id = s.team?.id ?? s.team_id;
  return id != null ? Number(id) : undefined;
}

function standingTeamName(s: CompetitionTableStandingRow): string {
  return s.team?.name || s.name || '—';
}

function standingTeamLogo(s: CompetitionTableStandingRow): string | undefined {
  return s.team?.logo || s.logo;
}

function StandingsTable({
  standings,
  competitionId,
  homeTeamId,
  awayTeamId,
}: {
  standings: CompetitionTableStandingRow[];
  competitionId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
}) {
  if (!standings.length) return null;

  const total = standings.length;

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colRank}>#</th>
            <th className={styles.colTeam}>Takım</th>
            <th>O</th>
            <th>G</th>
            <th>B</th>
            <th>M</th>
            <th>A</th>
            <th>Y</th>
            <th>Av</th>
            <th className={styles.colPoints}>P</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const tid = standingTeamId(row);
            const highlight =
              tid != null && (tid === homeTeamId || tid === awayTeamId);
            const logo = standingTeamLogo(row);
            const zone = getStandingRankZone(row.rank, total, competitionId);
            return (
              <tr
                key={`${tid ?? i}-${row.rank}`}
                className={highlight ? styles.rowHighlight : undefined}
              >
                <td className={`${styles.colRank} ${standingsRankZoneClass(zone) ?? ''}`.trim()}>
                  {row.rank}
                </td>
                <td className={styles.colTeam}>
                  {tid != null ? (
                    <div className={styles.teamCell}>
                      {logo ? (
                        <img src={logo} alt="" className={styles.teamLogo} width={16} height={16} />
                      ) : null}
                      <Link href={`/teams/${tid}`} className={styles.teamLink} prefetch={false}>
                        {standingTeamName(row)}
                      </Link>
                    </div>
                  ) : (
                    standingTeamName(row)
                  )}
                </td>
                <td>{row.matches}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.goals_scored ?? '—'}</td>
                <td>{row.goals_conceded ?? '—'}</td>
                <td>{row.goal_diff}</td>
                <td className={styles.colPoints}>{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface MatchCompetitionStandingsProps {
  data: CompetitionTableData | null;
  loading?: boolean;
  competitionName?: string;
  homeTeamId?: number;
  awayTeamId?: number;
}

export default function MatchCompetitionStandings({
  data,
  loading,
  competitionName,
  homeTeamId,
  awayTeamId,
}: MatchCompetitionStandingsProps) {
  if (loading) {
    return (
      <div className={styles.block}>
        <div className={styles.loading}>Puan durumu yükleniyor…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <section className={styles.block} aria-label="Lig puan durumu">
        <h2 className={styles.title}>{competitionName || 'Lig'}</h2>
        <p className={styles.empty}>Puan tablosu bulunamadı.</p>
      </section>
    );
  }

  const compName = data.competition?.name || competitionName || 'Lig';
  const competitionId = data.competition?.id;
  const season = data.season;

  const legacyTable = Array.isArray(data.table) ? data.table : null;
  const hasStageStandings = data.stages?.some((s) =>
    s.groups?.some((g) => (g.standings?.length ?? 0) > 0)
  );
  const hasAnyRows = (legacyTable?.length ?? 0) > 0 || Boolean(hasStageStandings);

  return (
    <section className={styles.block} aria-label="Lig puan durumu">
      <h2 className={styles.title}>{compName}</h2>
      {season?.name ? (
        <p className={styles.season}>
          Sezon: {season.name}
          {season.start && season.end
            ? ` · ${season.start.slice(0, 4)}–${season.end.slice(0, 4)}`
            : null}
        </p>
      ) : null}

      {legacyTable?.length ? (
        <StandingsTable
          standings={legacyTable as CompetitionTableStandingRow[]}
          competitionId={competitionId}
          homeTeamId={homeTeamId}
          awayTeamId={awayTeamId}
        />
      ) : null}

      {data.stages?.map((stageBlock, si) => (
        <div key={stageBlock.stage?.id ?? si}>
          {data.stages!.length > 1 && stageBlock.stage?.name ? (
            <h3 className={styles.subheading}>{stageBlock.stage.name}</h3>
          ) : null}
          {stageBlock.groups?.map((group, gi) => (
            <div key={group.id ?? `${si}-${gi}`}>
              {stageBlock.groups!.length > 1 && group.name ? (
                <h3 className={styles.subheading}>Grup {group.name}</h3>
              ) : null}
              {group.standings?.length ? (
                <StandingsTable
                  standings={group.standings}
                  competitionId={competitionId}
                  homeTeamId={homeTeamId}
                  awayTeamId={awayTeamId}
                />
              ) : null}
            </div>
          ))}
        </div>
      ))}

      {!hasAnyRows ? <p className={styles.empty}>Puan tablosu bulunamadı.</p> : null}
    </section>
  );
}

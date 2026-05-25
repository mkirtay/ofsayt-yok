import type { CompetitionTableData } from '@/services/liveScoreService';
import styles from './teamList.module.scss';

export type TeamEntry = {
  teamId: number;
  name: string;
  logo?: string;
  groupName: string;
};

export function extractAllTeams(tableData: CompetitionTableData | null): TeamEntry[] {
  if (!tableData?.stages?.length) return [];
  const seen = new Set<number>();
  const teams: TeamEntry[] = [];

  for (const stage of tableData.stages) {
    for (const group of stage.groups ?? []) {
      for (const row of group.standings ?? []) {
        const id = row.team?.id ?? row.team_id ?? 0;
        const name = row.team?.name ?? row.name ?? '';
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        teams.push({
          teamId: id,
          name,
          logo: row.team?.logo ?? row.logo,
          groupName: String(group.name ?? ''),
        });
      }
    }
  }

  return teams.sort((a, b) => {
    const gc = a.groupName.localeCompare(b.groupName);
    if (gc !== 0) return gc;
    return a.name.localeCompare(b.name, 'tr');
  });
}

type Props = {
  tableData: CompetitionTableData | null;
  favoriteTeamIds: number[];
  onToggleFavorite: (teamId: number) => void;
  onSelectTeam: (team: TeamEntry) => void;
};

export default function WorldCupTeamList({ tableData, favoriteTeamIds, onToggleFavorite, onSelectTeam }: Props) {
  const teams = extractAllTeams(tableData);
  const favSet = new Set(favoriteTeamIds);

  if (!teams.length) {
    return <div className={styles.empty}>Takım verisi yüklenemedi.</div>;
  }

  let lastGroup = '';

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerCount}>{teams.length} takım</span>
        <span className={styles.headerHint}>Takıma tıkla → detay | ★ → favori</span>
      </div>
      <div className={styles.list}>
        {teams.map((team) => {
          const isNewGroup = team.groupName !== lastGroup;
          lastGroup = team.groupName;
          const isFav = favSet.has(team.teamId);

          return (
            <div key={team.teamId}>
              {isNewGroup && (
                <div className={styles.groupHeader}>Group {team.groupName}</div>
              )}
              <div className={styles.teamRow}>
                <button
                  className={styles.teamInfo}
                  onClick={() => onSelectTeam(team)}
                  title={`${team.name} detaylarını gör`}
                >
                  {team.logo ? (
                    <img
                      src={team.logo}
                      alt=""
                      width={24}
                      height={24}
                      className={styles.teamLogo}
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.teamLogoPlaceholder} />
                  )}
                  <span className={styles.teamName}>{team.name}</span>
                </button>
                <button
                  className={`${styles.favBtn} ${isFav ? styles.favBtnActive : ''}`}
                  onClick={(e) => { e.stopPropagation(); onToggleFavorite(team.teamId); }}
                  aria-label={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                  title={isFav ? 'Favorilerden çıkar' : 'Favorilere ekle'}
                >
                  {isFav ? '★' : '☆'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

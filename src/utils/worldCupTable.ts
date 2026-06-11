import { sortWorldCupGroupsByName } from '@/config/worldCup';
import type {
  CompetitionGroupItem,
  CompetitionTableData,
  CompetitionTableStandingRow,
} from '@/services/liveScoreService';

export type GroupStandings = {
  id: number;
  name: string;
  standings: CompetitionTableStandingRow[];
};

export function extractGroupsFromTable(data: CompetitionTableData | null): CompetitionGroupItem[] {
  if (!data?.stages?.length) return [];
  const raw = data.stages.flatMap((stage) => stage.groups ?? []);
  return sortWorldCupGroupsByName(
    raw
      .map((g): CompetitionGroupItem | null => {
        const id = Number(g?.id);
        const name = String(g?.name ?? '').trim();
        if (!Number.isFinite(id) || !name) return null;
        return { id, name };
      })
      .filter((g): g is CompetitionGroupItem => g != null)
  );
}

export function extractGroupStandings(data: CompetitionTableData | null): GroupStandings[] {
  if (!data?.stages?.length) return [];
  const groups = data.stages.flatMap((stage) =>
    (stage.groups || []).map((group) => ({
      id: Number(group.id),
      name: String(group.name || ''),
      standings: group.standings || [],
    }))
  );
  return sortWorldCupGroupsByName(
    groups.filter((g) => Number.isFinite(g.id) && g.name)
  );
}

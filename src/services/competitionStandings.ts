/**
 * Puan durumu — konferans / grup / aşama ayrımıyla. `GET /standings/seasons/{s}?include=participant;details.type;
 * group;stage`.
 *
 * Neden: `liveScoreService.getCompetitionTableFull` bütün satırları tek tabloya düzleştiriyordu; birden çok grubu
 * olan liglerde sıra numaraları tekrar ediyordu (MLS: Batı ve Doğu konferansı → 1, 1, 2, 2…; Arjantin: Apertura +
 * Clausura × Grup A/B = 60 satır tek tabloda). 2026-10-02 taraması: planın 34 liginden yalnız MLS (779) ve Arjantin
 * (636) böyle; Türkiye Kupası grup aşamasına geçince aynı yol onu da kapsar.
 *
 * Tek grup + tek aşama → eskisi gibi `table`; birden çok → `stages[].groups[]` (MatchCompetitionStandings bunu her
 * grup için ayrı tablo + başlık olarak çizer, sıra her grupta 1'den başlar). Aşamalar: güncel önce, sonra bitmemiş,
 * sonra yeniden eskiye.
 */
import { sportmonksClientRequest, sportmonksCollectAllPages } from './sportmonksRuntimeClient';
import { pivotStandingRow } from './sportmonks/standingsPivot';
import type { SportmonksStandingRow } from './sportmonks/types';
import type { CompetitionTableData, CompetitionTableStandingRow } from './liveScoreService';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';

export const STANDINGS_WITH_GROUPS_INCLUDE = 'participant;details.type;group;stage';

type StageInfo = { id: number; name?: string | null; is_current?: boolean | null; finished?: boolean | null; starting_at?: string | null };
type GroupInfo = { id: number; name?: string | null };
export type SportmonksStandingRowWithGroup = SportmonksStandingRow & { group?: GroupInfo | null; stage?: StageInfo | null };

function toRow(row: SportmonksStandingRowWithGroup): CompetitionTableStandingRow {
  const p = pivotStandingRow(row);
  return {
    rank: p.rank,
    points: p.points,
    matches: p.matches,
    goal_diff: p.goal_diff,
    goals_scored: p.goals_scored,
    goals_conceded: p.goals_conceded,
    won: p.won,
    drawn: p.drawn,
    lost: p.lost,
    team: { id: p.team_id, name: p.name, ...(p.short_code ? { short_code: p.short_code } : {}), ...(p.logo ? { logo: p.logo } : {}) },
    team_id: p.team_id,
    name: p.name,
    ...(p.short_code ? { short_code: p.short_code } : {}),
    ...(p.logo ? { logo: p.logo } : {}),
  } as CompetitionTableStandingRow;
}

const byRank = (a: CompetitionTableStandingRow, b: CompetitionTableStandingRow) => Number(a.rank) - Number(b.rank);

/** Satırlar → tek tablo ya da aşama/grup blokları (saf; test edilir). */
export function buildStandingsData(
  rows: SportmonksStandingRowWithGroup[],
  leagueId: number,
  seasonId: number,
  groupId?: number | string,
): CompetitionTableData {
  const filtered = groupId != null && groupId !== '' ? rows.filter((r) => String(r.group_id ?? '') === String(groupId)) : rows;
  const base = { competition: { id: leagueId, name: '' }, season: { id: seasonId } };
  const groupKeys = new Set(filtered.map((r) => r.group_id ?? null));
  const stageKeys = new Set(filtered.map((r) => r.stage_id ?? null));
  if (groupKeys.size <= 1 && stageKeys.size <= 1) {
    return { ...base, table: filtered.map(toRow).sort(byRank) };
  }

  const stages = new Map<number | null, { info: StageInfo | null; groups: Map<number | null, { info: GroupInfo | null; rows: CompetitionTableStandingRow[] }> }>();
  for (const r of filtered) {
    const sKey = r.stage_id ?? null;
    let stage = stages.get(sKey);
    if (!stage) {
      stage = { info: r.stage ?? null, groups: new Map() };
      stages.set(sKey, stage);
    }
    const gKey = r.group_id ?? null;
    let group = stage.groups.get(gKey);
    if (!group) {
      group = { info: r.group ?? null, rows: [] };
      stage.groups.set(gKey, group);
    }
    group.rows.push(toRow(r));
  }

  const stageRank = (s: StageInfo | null) => (s?.is_current ? 0 : s?.finished === false ? 1 : 2);
  const ordered = [...stages.entries()].sort(
    ([, a], [, b]) => stageRank(a.info) - stageRank(b.info) || (b.info?.starting_at ?? '').localeCompare(a.info?.starting_at ?? ''),
  );
  return {
    ...base,
    stages: ordered.map(([sKey, s]) => ({
      stage: { ...(sKey != null ? { id: sKey } : {}), ...(s.info?.name ? { name: s.info.name } : {}) },
      groups: [...s.groups.entries()]
        .sort(([, a], [, b]) => (a.info?.name ?? '').localeCompare(b.info?.name ?? '', 'tr'))
        .map(([gKey, g]) => ({
          ...(gKey != null ? { id: gKey } : {}),
          ...(g.info?.name ? { name: g.info.name } : {}),
          standings: g.rows.sort(byRank),
        })),
    })),
  };
}

async function resolveCurrentSeasonId(leagueId: number): Promise<number | null> {
  // `liveScoreService` ile AYNI istek (aynı önbellek anahtarı).
  const envelope = await sportmonksClientRequest<{ id: number; seasons?: { id: number; is_current?: boolean }[] }>(
    'football',
    `/leagues/${leagueId}`,
    { include: 'seasons' },
  );
  return envelope.data?.seasons?.find((s) => s.is_current)?.id ?? null;
}

/** `getCompetitionTableFull` ile aynı imza/dönüş; çok gruplu liglerde `stages`. Hata → null. */
export async function getCompetitionStandings(
  competitionId: string,
  query?: { season?: number; group_id?: number | string },
): Promise<CompetitionTableData | null> {
  try {
    const leagueId = Number(competitionId);
    if (!Number.isFinite(leagueId) || leagueId <= 0 || leagueId === WORLD_CUP_COMPETITION_ID) return null;
    const seasonId = query?.season ?? (await resolveCurrentSeasonId(leagueId));
    if (seasonId == null) return null;
    const rows = await sportmonksCollectAllPages<SportmonksStandingRowWithGroup>({
      basePath: 'football',
      path: `/standings/seasons/${seasonId}`,
      perPage: 50,
      extraParams: { include: STANDINGS_WITH_GROUPS_INCLUDE },
    });
    return buildStandingsData(rows, leagueId, seasonId, query?.group_id);
  } catch (error) {
    console.error('Error fetching competition standings (sportmonks)', error);
    return null;
  }
}

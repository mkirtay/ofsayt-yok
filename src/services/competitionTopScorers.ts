/**
 * Gol Krallığı — oynanan maç (O) yanıta gömülü: `GET /topscorers/seasons/{s}?include=player.statistics.details;
 * participant&filters=seasonTopscorerTypes:{208|209};playerStatisticSeasons:{s};playerStatisticDetailTypes:321`.
 *
 * Neden: eski yol (`liveScoreService.getTopScorers` + `getTopScorerAppearances`) listedeki HER TAKIM için ayrı
 * `squads/seasons/{s}/teams/{id}` isteği atıyordu (Süper Lig'de 18 istek, sekme her açıldığında). Oyuncunun sezon
 * istatistiği topscorers satırına iç içe include ile gelir; `playerStatisticDetailTypes:321` yalnız APPEARANCES'ı
 * bırakır (2026-10-02 doğrulandı: sayfa 5,8 → 7,3 KB gz). İstek sayısı aynı (gol + asist × en çok 2 sayfa), ek
 * istek sıfır. Puan durumundaki "O" takımın maç sayısıdır, oyuncunun değil — kullanılamaz.
 */
import { sportmonksClientRequest, sportmonksCollectAllPages } from './sportmonksRuntimeClient';
import { checkFilteredResult } from './sportmonks/filterAssertion';
import {
  APPEARANCES_STAT_TYPE_ID,
  ASSIST_TOPSCORER_TYPE_ID,
  GOAL_TOPSCORER_TYPE_ID,
  mapTopscorerRowsToEntries,
} from './sportmonksKatman2Mapper';
import type { SportmonksPlayerStatistic, SportmonksTopscorerRow } from './sportmonks/types';
import type { TopScorersPayload } from './liveScoreService';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';

/** Tür başına en çok bu kadar sayfa (50'şer → ilk 100) — `getTopScorers` ile aynı sınır. */
const MAX_PAGES = 2;

export const TOPSCORER_WITH_APPEARANCES_INCLUDE = 'player.statistics.details;participant';

export function topscorerAppearanceFilters(typeId: number, seasonId: number): string {
  return `seasonTopscorerTypes:${typeId};playerStatisticSeasons:${seasonId};playerStatisticDetailTypes:${APPEARANCES_STAT_TYPE_ID}`;
}

/** O yanıta gömülü → `useTopScorersWithAppearances` ayrıca kadro isteği atmaz. */
export type TopScorersWithAppearances = TopScorersPayload & { appearancesIncluded: true };

type RowWithStats = SportmonksTopscorerRow & {
  participant_id?: number;
  player?: SportmonksTopscorerRow['player'] & { statistics?: SportmonksPlayerStatistic[] | null };
};

/** Satırdaki oyuncu istatistiğinden o sezon, o takım için oynanan maç; bilinmiyorsa undefined. */
export function appearancesFromRow(row: RowWithStats, seasonId: number): number | undefined {
  const teamId = row.participant_id ?? row.participant?.id;
  const stats = (row.player?.statistics ?? []).filter(
    (s) => s.season_id === seasonId && (teamId == null || s.team_id == null || s.team_id === teamId),
  );
  let total = 0;
  let seen = false;
  for (const s of stats) {
    const raw = s.details?.find((d) => d.type_id === APPEARANCES_STAT_TYPE_ID)?.value;
    const n = typeof raw === 'number' ? raw : typeof raw === 'object' && raw ? raw.total : undefined;
    if (typeof n === 'number' && Number.isFinite(n)) {
      total += n;
      seen = true;
    }
  }
  return seen && total > 0 ? total : undefined;
}

/**
 * Gol satırlarından liste (asistler eklenir) + O. O doğrulanmışsa ve oyuncu asist sıralamasında yoksa asist gerçekten
 * 0'dır (`mergeAppearances` ile aynı kural).
 */
export function mapTopScorersWithAppearances(rows: RowWithStats[], seasonId: number): TopScorersPayload['topscorers'] {
  const played = new Map<number, number>();
  for (const r of rows) {
    const n = appearancesFromRow(r, seasonId);
    if (n !== undefined && !played.has(r.player_id)) played.set(r.player_id, n);
  }
  return mapTopscorerRowsToEntries(rows).map((e) => {
    const p = e.player?.id != null ? played.get(e.player.id) : undefined;
    return p === undefined ? e : { ...e, played: p, assists: e.assists ?? 0 };
  });
}

async function fetchRows(seasonId: number, typeId: number): Promise<RowWithStats[] | null> {
  const rows = await sportmonksCollectAllPages<RowWithStats>({
    basePath: 'football',
    path: `/topscorers/seasons/${seasonId}`,
    perPage: 50,
    maxPages: MAX_PAGES,
    extraParams: { include: TOPSCORER_WITH_APPEARANCES_INCLUDE, filters: topscorerAppearanceFilters(typeId, seasonId) },
  });
  // filters=... sessizce uygulanmayabiliyor (Pass 5) → satır türlerini doğrula.
  const check = checkFilteredResult(rows, [typeId], (r) => r.type_id);
  if (!check.ok) {
    console.error('[sportmonks] getTopScorersWithAppearances: filters=seasonTopscorerTypes sessizce uygulanmadı:', check.reason);
    return null;
  }
  return rows;
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

/** `getTopScorers` ile aynı imza ve sonuç + `played` (O) + `appearancesIncluded`. Hata → null. */
export async function getTopScorersWithAppearances(
  competitionId: string | number,
  opts?: { season?: number },
): Promise<TopScorersWithAppearances | null> {
  try {
    const leagueId = Number(competitionId);
    if (!Number.isFinite(leagueId) || leagueId <= 0 || leagueId === WORLD_CUP_COMPETITION_ID) return null;
    const seasonId = opts?.season ?? (await resolveCurrentSeasonId(leagueId));
    if (seasonId == null) return null;
    const [goalRows, assistRows] = await Promise.all([
      fetchRows(seasonId, GOAL_TOPSCORER_TYPE_ID),
      fetchRows(seasonId, ASSIST_TOPSCORER_TYPE_ID).catch(() => null),
    ]);
    if (goalRows == null) return null;
    return {
      competition: { id: leagueId, name: '' },
      season: { id: seasonId },
      topscorers: mapTopScorersWithAppearances([...goalRows, ...(assistRows ?? [])], seasonId),
      appearancesIncluded: true,
    };
  } catch (error) {
    console.error('Error fetching top scorers with appearances (sportmonks)', error);
    return null;
  }
}

/** Tahmin oyunu sayfalarının SSR verisi (kişisel veri yok → CDN önbelleklenir; kişisel kısım istemcide). */
import { seasonOf, weekKeyOf } from '@/lib/game/week';
import type { GameWeekView, LeaderboardView } from '@/lib/game/types';
import { loadLeaderboard } from '@/server/game/play';
import { listPublicWeekKeys, loadPublicWeek, resolveCurrentWeekKey } from '@/server/game/weeks';

export const GAME_PAGE_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

export type GameHomeData = { week: GameWeekView | null; season: string; board: LeaderboardView | null; prevKey: string | null; nextKey: string | null };

/** Yayındaki haftalar arasında komşular (taslaklar atlanır). */
export async function neighbourWeeks(weekKey: string): Promise<{ prevKey: string | null; nextKey: string | null }> {
  const keys = await listPublicWeekKeys(60);
  const older = keys.filter((k) => k < weekKey);
  const newer = keys.filter((k) => k > weekKey);
  return { prevKey: older[0] ?? null, nextKey: newer[newer.length - 1] ?? null };
}

export async function loadGameHome(now: Date = new Date()): Promise<GameHomeData> {
  const key = await resolveCurrentWeekKey(now);
  const week = key ? await loadPublicWeek(key) : null;
  const season = week?.season ?? seasonOf(weekKeyOf(now.getTime()))!;
  const [board, nav] = await Promise.all([loadLeaderboard('season', season), week ? neighbourWeeks(week.weekKey) : { prevKey: null, nextKey: null }]);
  return { week, season, board, ...nav };
}

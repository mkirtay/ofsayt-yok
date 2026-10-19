/** Tahmin oyunu sayfalarının SSR verisi (kişisel veri yok → CDN önbelleklenir; kişisel kısım istemcide). */
import { seasonOf, weekKeyOf } from '@/lib/game/week';
import type { GameDayView, GameWeekView, LeaderboardView } from '@/lib/game/types';
import { loadLeaderboard } from '@/server/game/play';
import { listPublicWeekKeys, loadPublicWeek, resolveCurrentWeekKey } from '@/server/game/weeks';
import { loadPublicDay, todayKey } from '@/server/game/days';

export const GAME_PAGE_CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

export type GameHomeData = {
  week: GameWeekView | null;
  season: string;
  board: LeaderboardView | null;
  prevKey: string | null;
  nextKey: string | null;
  /** SSR anı (ISO) — WeekPlay ilk çizimde başlamış maçları doğru gruba koysun. */
  renderedAt: string;
  /** Günlük oyun: bugünün (İstanbul) anahtarı, oyunu (yoksa null → "bugün maç yok") ve günlük tablo. */
  dayKey: string;
  day: GameDayView | null;
  dayBoard: LeaderboardView | null;
};

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
  const dayKey = todayKey(now);
  const [board, nav, day] = await Promise.all([
    loadLeaderboard('season', season),
    week ? neighbourWeeks(week.weekKey) : { prevKey: null, nextKey: null },
    loadPublicDay(dayKey),
  ]);
  const dayBoard = day ? await loadLeaderboard('day', dayKey) : null;
  return { week, season, board, ...nav, renderedAt: now.toISOString(), dayKey, day, dayBoard };
}

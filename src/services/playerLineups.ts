/**
 * Oyuncunun kariyer maç satırları — sunucu tarafı istek + cache (Sportmonks `Player` havuzu, TEK istek). Saf kurallar:
 * `utils/playerVs.ts` (istemci de oradan import eder; bu dosya Redis'e dokunduğu için tarayıcı paketine girmemeli).
 *
 * `GET /players/{id}?include=lineups.fixture.participants;lineups.fixture.scores;lineups.fixture.league:name,image_path;
 *  lineups.details&filters=lineupDetailTypes:118,119,52,79` — rating/dakika/gol/asist. Ham yanıt ~550KB (Kerem
 * Aktürkoğlu 479 lineup, 2026-09-25); planın kapsamadığı maçlarda `fixture` null gelir (Kerem 345, Icardi 453 satır) →
 * atılır. Sıkıştırılmış satırlar oyuncu başına 12 saat cache'lenir (`sportmonks:player-lineups:{id}`).
 *
 * Mapper'lar SAF ve `utils/playerVs`'te (test edilir; mobil aynı kuralları taklit eder); burada yalnızca istek + cache.
 */
import { readCache, writeCache } from '@/lib/livescoreCache';
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import { STAT } from './sportmonks/playerStatTypes';
import { mapPlayerLineups, type PlayerLineupRow, type RawPlayerLineup } from '@/utils/playerVs';

export * from '@/utils/playerVs';

export const PLAYER_LINEUPS_INCLUDE =
  'lineups.fixture.participants;lineups.fixture.scores;lineups.fixture.league:name,image_path;lineups.details';
export const PLAYER_LINEUPS_FILTERS = `lineupDetailTypes:${STAT.RATING},${STAT.MINUTES},${STAT.GOALS},${STAT.ASSISTS}`;
export const PLAYER_LINEUPS_CACHE_TTL_SECONDS = 12 * 60 * 60;
export const playerLineupsCacheKey = (playerId: number) => `sportmonks:player-lineups:${playerId}`;

/**
 * Oyuncunun satırları — önce cache (12 saat), yoksa TEK Sportmonks isteği. Oyuncu bulunamazsa `null`.
 * Hata fırlatır (çağıran 502 döner; boş sonuç cache'lenmez).
 */
export async function getPlayerLineupRows(playerId: number): Promise<PlayerLineupRow[] | null> {
  const key = playerLineupsCacheKey(playerId);
  const cached = await readCache(key);
  if (Array.isArray(cached)) return cached as PlayerLineupRow[];
  const env = await sportmonksClientRequest<{ id: number; lineups?: RawPlayerLineup[] }>('football', `/players/${playerId}`, {
    include: PLAYER_LINEUPS_INCLUDE,
    filters: PLAYER_LINEUPS_FILTERS,
  });
  if (!env.data) return null;
  const rows = mapPlayerLineups(env.data.lineups);
  await writeCache(key, rows, PLAYER_LINEUPS_CACHE_TTL_SECONDS);
  return rows;
}

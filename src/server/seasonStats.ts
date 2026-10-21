/**
 * Puan Durumu sayfası "Sezon Özeti" (Haftanın Özeti kartının "Sezon" görünümü; bkz. pages/api/leagues/season-stats.ts,
 * services/sportmonks/seasonStats.ts).
 *
 * İstekler (paylaşımlı Sportmonks önbelleğinden, bkz. cachePolicy):
 * - `leagues/{id}?include=seasons` — sezon gerçekten bu lige mi ait (puan durumu / Haftanın Özeti ile AYNI anahtar; ek istek yok).
 *   Rastgele sezon id'siyle Season havuzu yakılamaz: doğrulama Sportmonks'a sezon isteğinden ÖNCE.
 * - `seasons/{id}?include=statistics.participant` (Season havuzu, ~11 KB): süren sezon 6 sa, biten sezon 30 gün.
 * Hesaplama ucuz (30 satır) → ayrı SWR katmanı yok; ham yanıt önbellekte.
 *
 * Hata ≠ veri yok: Sportmonks hatası fırlatılır (uç 502, önbelleğe yazılmaz); oynanmamış sezon `summary: null`.
 */
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { istanbulToday } from '@/services/sportmonks/roundStats';
import {
  SEASON_STATS_INCLUDE,
  seasonStatsFinished,
  summarizeSeasonStatistics,
  type RawSeasonWithStatistics,
  type SeasonStatsSummary,
} from '@/services/sportmonks/seasonStats';
import { seasonBelongsToLeague } from '@/server/roundStats';

export class SeasonStatsInputError extends Error {}

export type SeasonStatsPayload = {
  season: { id: number; name: string | null; finished: boolean };
  summary: SeasonStatsSummary | null;
};

/** @throws SeasonStatsInputError lig planda değil / sezon o ligin değil (uç 400) */
export async function loadSeasonStats(leagueId: number, seasonId: number, now: number = Date.now()): Promise<SeasonStatsPayload> {
  if (!HUB_LEAGUE_IDS.includes(leagueId)) throw new SeasonStatsInputError('league');
  if (!(await seasonBelongsToLeague(leagueId, seasonId))) throw new SeasonStatsInputError('season');

  const envelope = await sportmonksClientRequest<RawSeasonWithStatistics>('football', `/seasons/${seasonId}`, { include: SEASON_STATS_INCLUDE });
  const season = envelope.data && !Array.isArray(envelope.data) ? envelope.data : null;
  // "Sonuç yok" (data alanı yok) = veri yok; HTTP hatası sportmonksRequest'te fırlar.
  return {
    season: { id: seasonId, name: season?.name?.trim() || null, finished: seasonStatsFinished(season, istanbulToday(now)) },
    summary: summarizeSeasonStatistics(season?.statistics ?? []),
  };
}

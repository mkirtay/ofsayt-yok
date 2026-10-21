/**
 * Haftanın Takımı (lig sayfası `/standings` sekmesi, `/api/leagues/{id}/team-of-the-week`) — lig başına tek Sportmonks
 * isteği, paylaşımlı cache'te 12 sa (ligde yoksa 6 sa; bkz. cachePolicy `team-of-the-week`). Ayrı havuz (TeamOfTheWeek),
 * Fixture kotasına dokunmaz.
 *
 * Hata ≠ veri yok: Sportmonks hatası / zaman aşımı FIRLATIR (route 5xx + no-store); yalnız "sonuç yok", eksik liste ya
 * da eski tur null döner (route 404, CDN'de kısa süre).
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { mapTeamOfTheWeek, TOTW_INCLUDE, type RawTotwRow, type TeamOfTheWeek } from '@/services/sportmonks/teamOfTheWeek';

export async function loadTeamOfTheWeek(leagueId: number, now: number = Date.now()): Promise<TeamOfTheWeek | null> {
  if (!Number.isInteger(leagueId) || leagueId <= 0) return null;
  const envelope = await sportmonksClientRequest<RawTotwRow[]>('football', `/team-of-the-week/leagues/${leagueId}/latest`, {
    include: TOTW_INCLUDE,
  });
  const rows = Array.isArray(envelope.data) ? envelope.data : null;
  return mapTeamOfTheWeek(leagueId, rows, now);
}

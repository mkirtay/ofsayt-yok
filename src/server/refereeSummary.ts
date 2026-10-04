/**
 * Hakem özeti (maç sayfası hakem kartı `/api/referees/{id}/summary`, AI analiz bağlamı) — tek Sportmonks isteği,
 * paylaşımlı cache'te 12 sa (bkz. cachePolicy `referees`). Hakem başına; aynı hakemin bütün maçları paylaşır.
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { summarizeRefereeStats, type RawReferee, type RefereeSummary } from '@/services/sportmonks/refereeStats';

/** Sezon istatistikleri isteği — hakem kartı, AI bağlamı ve hakem sayfası AYNI anahtarı paylaşır (12 sa). */
export const REFEREE_STATS_INCLUDE = 'statistics.details.type:developer_name;statistics.season:name,league_id,starting_at,is_current';

/** Ham sezon istatistikleri; okunamazsa null. */
export async function loadRefereeStatsRaw(refereeId: number): Promise<RawReferee | null> {
  if (!Number.isInteger(refereeId) || refereeId <= 0) return null;
  try {
    const envelope = await sportmonksClientRequest<RawReferee>('football', `/referees/${refereeId}`, { include: REFEREE_STATS_INCLUDE });
    const raw = envelope.data;
    return raw && !Array.isArray(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function loadRefereeSummary(refereeId: number, seasonId: number, leagueId: number | null): Promise<RefereeSummary | null> {
  if (!Number.isInteger(seasonId) || seasonId <= 0) return null;
  const raw = await loadRefereeStatsRaw(refereeId);
  return raw ? summarizeRefereeStats(raw, seasonId, leagueId) : null;
}

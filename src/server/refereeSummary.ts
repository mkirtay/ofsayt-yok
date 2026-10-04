/**
 * Hakem özeti (maç sayfası hakem kartı `/api/referees/{id}/summary`, AI analiz bağlamı) — tek Sportmonks isteği,
 * paylaşımlı cache'te 12 sa (bkz. cachePolicy `referees`). Hakem başına; aynı hakemin bütün maçları paylaşır.
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { summarizeRefereeStats, type RawReferee, type RefereeSummary } from '@/services/sportmonks/refereeStats';

export async function loadRefereeSummary(refereeId: number, seasonId: number, leagueId: number | null): Promise<RefereeSummary | null> {
  if (!Number.isInteger(refereeId) || refereeId <= 0 || !Number.isInteger(seasonId) || seasonId <= 0) return null;
  try {
    const envelope = await sportmonksClientRequest<RawReferee>('football', `/referees/${refereeId}`, {
      include: 'statistics.details.type:developer_name;statistics.season:name,league_id,starting_at,is_current',
    });
    const raw = envelope.data;
    if (!raw || Array.isArray(raw)) return null;
    return summarizeRefereeStats(raw, seasonId, leagueId);
  } catch {
    return null;
  }
}

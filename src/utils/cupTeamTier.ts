import type { Match } from '@/models/liveScore';
import {
  TURKEY_TIER_BY_LEAGUE_ID,
  TURKISH_CUP_LEAGUE_ID,
  type TurkeyTeamTiersPayload,
  type TurkeyTierKey,
} from '@/config/turkeyTiers';
import { isSportmonksProviderEnabled } from '@/services/sportmonksProviderFlag';

/** Takım-lig haritası yalnızca Türkiye Kupası maçlarında kullanılır (Sportmonks açıkken `competition.id = 606`). */
export function isTurkishCupMatch(match: Pick<Match, 'competition' | 'competition_id'> | null | undefined): boolean {
  if (!match || !isSportmonksProviderEnabled()) return false;
  return Number(match.competition?.id ?? match.competition_id) === TURKISH_CUP_LEAGUE_ID;
}

/**
 * Kupa maçında bir takımın kademe anahtarı; planda olmayan takım / eski sezon maçı / harita yok → `null` (etiket gösterilmez).
 * Eski sezon kontrolü: harita güncel sezonun lig yapısını yansıtır, geçen sezonun kupa maçına uygulanmaz.
 */
export function cupTeamTierKey(
  match: Pick<Match, 'competition' | 'competition_id' | 'date'>,
  teamId: number | string | null | undefined,
  payload: TurkeyTeamTiersPayload | null | undefined,
): TurkeyTierKey | null {
  if (!payload || teamId == null || !isTurkishCupMatch(match)) return null;
  if (payload.validFrom && match.date && match.date < payload.validFrom) return null;
  const leagueId = payload.tiers[String(teamId)];
  return leagueId != null ? (TURKEY_TIER_BY_LEAGUE_ID[leagueId] ?? null) : null;
}

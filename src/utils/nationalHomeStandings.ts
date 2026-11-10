/**
 * Ana sayfa sol puan durumu: seçili günde Türkiye milli takımının tablosu olan bir maçı varsa, varsayılan tablo o
 * maçın milli turnuvası olur (bkz. hooks/useNationalHomeStandings.ts). Saf mantık: hangi maç / turnuva?
 */
import { nationalLeagueByAfId } from '@/config/nationalLeagues';
import type { Match } from '@/models/liveScore';
import { isNationalMatchId, toAfId, toAppId } from '@/services/apiFootball/ids';

/** Türkiye A milli takımı (AF takım id 777). */
export const FOCUS_NATIONAL_TEAM_ID = toAppId(777);
/** Hazırlık maçlarının puan durumu yok → otomatik geçiş yapılmaz. */
const NO_TABLE_LEAGUE_AF_IDS = new Set([10]);

export type NationalFocus = { competitionId: number; competitionName: string; competitionLogo?: string };

export function pickNationalFocus(matches: readonly Match[]): NationalFocus | null {
  for (const m of matches) {
    if (!isNationalMatchId(m.id)) continue;
    if (Number(m.home?.id) !== FOCUS_NATIONAL_TEAM_ID && Number(m.away?.id) !== FOCUS_NATIONAL_TEAM_ID) continue;
    const comp = m.competition;
    if (comp?.id == null) continue;
    const af = toAfId(comp.id);
    if (af == null || NO_TABLE_LEAGUE_AF_IDS.has(af) || !nationalLeagueByAfId(af)) continue;
    return { competitionId: Number(comp.id), competitionName: comp.name ?? nationalLeagueByAfId(af)!.name, ...(comp.logo ? { competitionLogo: comp.logo } : {}) };
  }
  return null;
}

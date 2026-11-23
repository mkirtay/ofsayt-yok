/**
 * AI Asistan maç listesi önem sırası ("bugün hangi maçlar var?", canlı skorlar). Model ilk ~15 maçı görür ve genelde
 * baştakileri önerir; eskiden yalnız "Türk ligi mi" ayrımı vardı → TFF 2. Lig maçı Premier League'in önüne geçiyordu.
 *
 * Kademe (küçük önce):
 *  0 Türkiye'nin büyüklerinden (GS, FB, BJK, TS) biri oynuyor — lig fark etmez (Avrupa dahil)
 *  1 Süper Lig
 *  2 UEFA kulüp turnuvası
 *  3 Beş büyük lig
 *  4 Diğer 1. ligler + kupalar (leaguePriority grup 3)
 *  5 Alt kademe ligler (TFF 1. Lig, 2. Lig, Championship…)
 * Kademe içinde: Avrupa devi sayısı ↓, lig önceliği (compareLeaguePriority), başlama saati ↑.
 */
import type { Match } from '@/models/liveScore';
import { BIG_FIVE_IDS, SUPER_LIG_ID, UEFA_CLUB_IDS, leaguePriorityGroup } from '@/config/leaguePriority';
import { EURO_GIANT_EXTRA_IDS, EURO_GIANT_IDS, TURKEY_BIG_TEAM_IDS } from '@/config/gameMatchPriority';
import { matchKickoffMs } from '@/utils/matchActivity';

const leagueOf = (m: Match): number | null => {
  const v = Number(m.competition?.id ?? m.competition_id);
  return Number.isFinite(v) ? v : null;
};
const teamIds = (m: Match): number[] =>
  [m.home?.id ?? m.home_id, m.away?.id ?? m.away_id].filter((x): x is number => typeof x === 'number');

export function assistantMatchTier(m: Match): number {
  const ids = teamIds(m);
  if (ids.some((id) => TURKEY_BIG_TEAM_IDS.has(id))) return 0;
  const league = leagueOf(m);
  if (league === SUPER_LIG_ID) return 1;
  if (league != null && (UEFA_CLUB_IDS as readonly number[]).includes(league)) return 2;
  if (league != null && (BIG_FIVE_IDS as readonly number[]).includes(league)) return 3;
  return leaguePriorityGroup(league) === 4 ? 5 : 4;
}

function giantCount(m: Match): number {
  return teamIds(m).reduce((n, id) => n + (EURO_GIANT_IDS.has(id) ? 2 : EURO_GIANT_EXTRA_IDS.has(id) ? 1 : 0), 0);
}

/** Lig içi sabit sıra: Süper Lig, UEFA (sabit), büyük 5 (sabit), sonra id. */
function leagueOrder(m: Match): number {
  const league = leagueOf(m);
  if (league == null) return Number.MAX_SAFE_INTEGER;
  const uefa = (UEFA_CLUB_IDS as readonly number[]).indexOf(league);
  if (uefa >= 0) return uefa;
  const big = (BIG_FIVE_IDS as readonly number[]).indexOf(league);
  if (big >= 0) return 10 + big;
  return 100 + league;
}

export function compareAssistantMatches(a: Match, b: Match): number {
  return (
    assistantMatchTier(a) - assistantMatchTier(b) ||
    giantCount(b) - giantCount(a) ||
    leagueOrder(a) - leagueOrder(b) ||
    (matchKickoffMs(a) ?? 0) - (matchKickoffMs(b) ?? 0)
  );
}

export function sortAssistantMatches<T extends Match>(matches: readonly T[]): T[] {
  return [...matches].sort(compareAssistantMatches);
}

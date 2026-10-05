/**
 * Ana sayfa canlı maç şeridi (lig filtre chip'lerinin sağında): hangi maçlar, hangi sırayla.
 * Yeni veri çekmez — sayfanın zaten yüklediği canlı / fikstür listelerinden seçer.
 *
 * Öncelik: canlı maçlar (önce Süper Lig, sonra mevcut lig önem sıralaması, aynı ligde başlama saati); canlı yoksa
 * bugünün başlamamış maçları (başlama saatine göre, en çok 12); hiçbiri yoksa boş (şerit gizli). Seçili lig filtresi
 * (ve sayfanın izinli lig listesi) iki durumda da uygulanır.
 */
import type { Match } from '@/models/liveScore';
import { compareGroupedLeagues } from '@/config/leagues';
import { filterMatchesByLeagues, type LeagueFilterState } from '@/utils/leagueFilter';
import { isMatchLive, matchIstanbulDate, matchKickoffMs } from '@/utils/matchActivity';

export const LIVE_STRIP_MAX_UPCOMING = 12;
const SUPER_LIG_ID = 600;

export type LiveStripKind = 'live' | 'upcoming';

function isCalledOff(m: Match): boolean {
  return m.state_code === 'POSTPONED' || m.state_code === 'CANCELLED' || m.state_code === 'DELETED';
}

function compareLive(a: Match, b: Match): number {
  const sa = a.competition?.id === SUPER_LIG_ID;
  const sb = b.competition?.id === SUPER_LIG_ID;
  if (sa !== sb) return sa ? -1 : 1;
  const ga = { competition_id: a.competition?.id ?? 0, competition_name: a.competition?.name ?? '', country_name: a.country?.name };
  const gb = { competition_id: b.competition?.id ?? 0, competition_name: b.competition?.name ?? '', country_name: b.country?.name };
  return (
    compareGroupedLeagues(ga, gb) ||
    (matchKickoffMs(a) ?? 0) - (matchKickoffMs(b) ?? 0) ||
    Number(a.id) - Number(b.id)
  );
}

export function selectLiveStripMatches(input: {
  live: readonly Match[];
  /** Bugünün fikstürü için havuz (seçili gün + fikstür listeleri); yinelenenler elenir. */
  pool: readonly Match[];
  leagueFilter: LeagueFilterState;
  allowedCompetitionIds?: ReadonlySet<number> | null;
  todayIso: string;
}): { kind: LiveStripKind; matches: Match[] } | null {
  const allowed = (list: Match[]) => {
    const byPage = input.allowedCompetitionIds ? list.filter((m) => input.allowedCompetitionIds!.has(m.competition?.id ?? 0)) : list;
    return filterMatchesByLeagues(byPage, input.leagueFilter);
  };

  const live = allowed(input.live.filter((m) => isMatchLive(m))).sort(compareLive);
  if (live.length > 0) return { kind: 'live', matches: dedupe(live) };

  const upcoming = allowed(
    input.pool.filter((m) => m.status === 'NOT STARTED' && !isCalledOff(m) && matchIstanbulDate(m) === input.todayIso),
  ).sort((a, b) => (matchKickoffMs(a) ?? Infinity) - (matchKickoffMs(b) ?? Infinity) || Number(a.id) - Number(b.id));
  const matches = dedupe(upcoming).slice(0, LIVE_STRIP_MAX_UPCOMING);
  return matches.length > 0 ? { kind: 'upcoming', matches } : null;
}

function dedupe(list: Match[]): Match[] {
  const seen = new Set<string>();
  return list.filter((m) => {
    const id = String(m.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Ana sayfa canlı maç şeridi (lig filtre chip'lerinin sağında): hangi maçlar, hangi sırayla.
 * Yeni veri çekmez — sayfanın zaten yüklediği canlı / fikstür listelerinden seçer.
 *
 * Şerit her zaman karışık: önce canlı maçlar (önce Süper Lig, sonra mevcut lig önem sıralaması, aynı ligde başlama
 * saati), ardından bugünün başlamamış maçları; toplam en çok 12. Bugünden az kaldıysa (< 6) yarının maçları da eklenir.
 * Yaklaşanlar önem sırasıyla: lig önceliği (Süper Lig, büyük ligler…), aynı ligde büyük takım maçı (iki taraf da büyük
 * takımsa "derbi / büyük maç"), sonra saat. Hiçbiri yoksa null (şerit gizli). Seçili lig filtresi (ve sayfanın izinli
 * lig listesi) uygulanır.
 */
import type { Match } from '@/models/liveScore';
import { compareGroupedLeagues } from '@/config/leagues';
import { filterMatchesByLeagues, type LeagueFilterState } from '@/utils/leagueFilter';
import { isMatchLive, matchIstanbulDate, matchKickoffMs } from '@/utils/matchActivity';
import { shiftIsoDate } from '@/utils/dateStrip';

const SUPER_LIG_ID = 600;
export const LIVE_STRIP_MAX = 12;
/** Bugünden bu kadarın altında yaklaşan maç kaldıysa yarının maçları da eklenir. */
const TOMORROW_FILL_BELOW = 6;

/**
 * Büyük takımlar (Sportmonks takım id): Türkiye dört büyükleri + Avrupa'nın başlıca kulüpleri. Puan durumu / popülerlik
 * verisi şeride gelmediği için (yeni istek yok) sabit liste; yalnız aynı ligdeki yaklaşan maçların sırasını ve ince
 * "büyük maç" işaretini belirler.
 */
export const BIG_TEAM_IDS: ReadonlySet<number> = new Set([
  34, 88, 554, 688, // Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor
  3468, 83, 7980, // Real Madrid, Barcelona, Atlético
  9, 14, 8, 19, 18, 6, // Man City, Man United, Liverpool, Arsenal, Chelsea, Tottenham
  503, 68, 591, // Bayern, Dortmund, PSG
  625, 2930, 113, 597, // Juventus, Inter, Milan, Napoli
]);

function bigScore(m: Match): number {
  return (BIG_TEAM_IDS.has(m.home?.id ?? -1) ? 1 : 0) + (BIG_TEAM_IDS.has(m.away?.id ?? -1) ? 1 : 0);
}

export type LiveStripResult = { matches: Match[]; liveCount: number; bigIds: ReadonlySet<string> };

function isCalledOff(m: Match): boolean {
  return m.state_code === 'POSTPONED' || m.state_code === 'CANCELLED' || m.state_code === 'DELETED';
}

function groupOf(m: Match) {
  return { competition_id: m.competition?.id ?? 0, competition_name: m.competition?.name ?? '', country_name: m.country?.name };
}

function compareLeague(a: Match, b: Match): number {
  const sa = a.competition?.id === SUPER_LIG_ID;
  const sb = b.competition?.id === SUPER_LIG_ID;
  if (sa !== sb) return sa ? -1 : 1;
  return compareGroupedLeagues(groupOf(a), groupOf(b));
}

function compareLive(a: Match, b: Match): number {
  return compareLeague(a, b) || (matchKickoffMs(a) ?? 0) - (matchKickoffMs(b) ?? 0) || Number(a.id) - Number(b.id);
}

function compareUpcoming(a: Match, b: Match): number {
  return (
    compareLeague(a, b) ||
    bigScore(b) - bigScore(a) ||
    (matchKickoffMs(a) ?? Infinity) - (matchKickoffMs(b) ?? Infinity) ||
    Number(a.id) - Number(b.id)
  );
}

export function selectLiveStripMatches(input: {
  live: readonly Match[];
  /** Yaklaşan maçlar için havuz (seçili gün + fikstür listeleri); yinelenenler elenir. */
  pool: readonly Match[];
  leagueFilter: LeagueFilterState;
  allowedCompetitionIds?: ReadonlySet<number> | null;
  todayIso: string;
}): LiveStripResult | null {
  const allowed = (list: Match[]) => {
    const byPage = input.allowedCompetitionIds ? list.filter((m) => input.allowedCompetitionIds!.has(m.competition?.id ?? 0)) : list;
    return filterMatchesByLeagues(byPage, input.leagueFilter);
  };

  const live = dedupe(allowed(input.live.filter((m) => isMatchLive(m))).sort(compareLive));
  const taken = new Set(live.map((m) => String(m.id)));

  const notStarted = allowed(input.pool.filter((m) => m.status === 'NOT STARTED' && !isCalledOff(m) && !taken.has(String(m.id))));
  const onDay = (day: string) => dedupe(notStarted.filter((m) => matchIstanbulDate(m) === day).sort(compareUpcoming));
  const today = onDay(input.todayIso);
  const upcoming = today.length < TOMORROW_FILL_BELOW ? [...today, ...onDay(shiftIsoDate(input.todayIso, 1))] : today;

  const matches = [...live, ...upcoming].slice(0, LIVE_STRIP_MAX);
  if (matches.length === 0) return null;
  const bigIds = new Set(matches.filter((m) => !isMatchLive(m) && bigScore(m) === 2).map((m) => String(m.id)));
  return { matches, liveCount: Math.min(live.length, matches.length), bigIds };
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

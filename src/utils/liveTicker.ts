/**
 * Ana sayfa canlı ticker'ı (lig filtre satırının sağında / mobilde altında): hangi canlı maçlar, hangi sırayla.
 * Yeni veri çekmez — sayfanın zaten yüklediği canlı listeden (poll) seçer.
 *
 * Yalnız oynanan / devre arasındaki maçlar (en çok 20). Sıra maç listesinin lig sırasıyla aynı (config/leaguePriority.ts:
 * Süper Lig → 5 Büyük Lig bu sırayla → diğer 1. ligler / kupalar → alt kademeler); Türk dört büyüklerinin maçı (Avrupa
 * kupasında da) en önde. Aynı kademede başlama saati. Seçili lig filtresi (ve sayfanın izinli lig listesi) uygulanır.
 * Seçili günden bağımsız: canlı maç "şu an"dır. Hiç maç yoksa boş dizi — ticker hiç çizilmez.
 */
import type { Match } from '@/models/liveScore';
import { BIG_FIVE_IDS, leaguePriorityGroup } from '@/config/leaguePriority';
import { isSportmonksProviderEnabled, resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';
import { filterMatchesByLeagues, type LeagueFilterState } from '@/utils/leagueFilter';
import { isMatchLive, matchKickoffMs } from '@/utils/matchActivity';

export const LIVE_TICKER_MAX = 20;

/** Türk dört büyükleri (Sportmonks takım id) — Avrupa kupası maçında da öncelik. */
const TURKISH_TEAM_IDS: ReadonlySet<number> = new Set([34, 88, 554, 688]);

/**
 * Küçük önce: 0 = Türk dört büyüğünden birinin maçı, 1 = Süper Lig, 2.0–2.4 = 5 Büyük Lig (PL, La Liga, Bundesliga,
 * Serie A, Ligue 1), 3 = diğer 1. ligler / kupalar, 4 = alt kademeler (Türkiye 1. / 2. Lig dahil).
 */
export function tickerPriority(m: Match): number {
  if (TURKISH_TEAM_IDS.has(m.home?.id ?? -1) || TURKISH_TEAM_IDS.has(m.away?.id ?? -1)) return 0;
  const comp = m.competition?.id;
  const leagueId = comp == null ? null : isSportmonksProviderEnabled() ? comp : resolveSportmonksLeagueId(comp);
  const group = leaguePriorityGroup(leagueId);
  return group === 2 ? 2 + (BIG_FIVE_IDS as readonly number[]).indexOf(leagueId!) / 10 : group;
}

const kickoff = (m: Match) => matchKickoffMs(m) ?? 0;

export type LiveFilterInput = {
  live: readonly Match[];
  leagueFilter: LeagueFilterState;
  allowedCompetitionIds?: ReadonlySet<number> | null;
};

/**
 * Lig filtresinden (ve sayfanın izinli lig listesinden) geçen, şu an oynanan / devre arasındaki maçlar (tekil, sırasız).
 * "Canlı" sekmesinin gösterdiği küme — mobil "Canlı" çipinin sayısı da bundan (filtre "Süper Lig"ken yalnız onlar).
 */
export function filterLiveMatches(input: LiveFilterInput): Match[] {
  const live = input.live.filter((m) => isMatchLive(m));
  const byPage = input.allowedCompetitionIds ? live.filter((m) => input.allowedCompetitionIds!.has(m.competition?.id ?? 0)) : live;
  const seen = new Set<string>();
  return filterMatchesByLeagues(byPage, input.leagueFilter).filter((m) => {
    const id = String(m.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function selectLiveTickerMatches(input: LiveFilterInput): Match[] {
  return filterLiveMatches(input)
    .sort((a, b) => tickerPriority(a) - tickerPriority(b) || kickoff(a) - kickoff(b) || Number(a.id) - Number(b.id))
    .slice(0, LIVE_TICKER_MAX);
}

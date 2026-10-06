/**
 * Ana sayfa canlı maç şeridi (maç listesinin üstünde): hangi maçlar, hangi sırayla.
 * Yeni veri çekmez — sayfanın zaten yüklediği canlı (poll) ve gün listelerinden seçer.
 *
 * Yalnız BUGÜN seçiliyken. Sıra: önce canlılar, sonra bugün bitenler (en çok 15). İki grupta da önce öncelikli maçlar
 * (Türk takımı / Türkiye ligi, Süper Lig, 5 Büyük Lig), sonra diğerleri; canlılarda aynı kademede başlama saati,
 * bitmişlerde en yeni biten (başlama saati en geç olan) başa. Seçili lig filtresi (ve sayfanın izinli lig listesi)
 * uygulanır. Hiç maç yoksa null — şerit tamamen gizli.
 */
import type { Match } from '@/models/liveScore';
import { TURKEY_COUNTRY_ID } from '@/config/leagues';
import { filterMatchesByLeagues, presetCompetitionIds, type LeagueFilterState } from '@/utils/leagueFilter';
import { isMatchLive, matchIstanbulDate, matchKickoffMs } from '@/utils/matchActivity';

export const LIVE_STRIP_MAX_FINISHED = 15;
export const LIVE_STRIP_MAX_LIVE = 20;

/** Türk dört büyükleri (Sportmonks takım id) — Avrupa kupası maçında da öncelik. */
const TURKISH_TEAM_IDS: ReadonlySet<number> = new Set([34, 88, 554, 688]);

function isCalledOff(m: Match): boolean {
  return m.state_code === 'POSTPONED' || m.state_code === 'CANCELLED' || m.state_code === 'DELETED';
}

/** 0 = öncelikli (Türk takımı / Türkiye ligi, Süper Lig, 5 Büyük Lig), 1 = diğer. */
export function stripPriority(m: Match): 0 | 1 {
  const comp = m.competition?.id ?? -1;
  if (m.country?.id === TURKEY_COUNTRY_ID) return 0;
  if (TURKISH_TEAM_IDS.has(m.home?.id ?? -1) || TURKISH_TEAM_IDS.has(m.away?.id ?? -1)) return 0;
  return presetCompetitionIds('super').has(comp) || presetCompetitionIds('big5').has(comp) ? 0 : 1;
}

const kickoff = (m: Match) => matchKickoffMs(m) ?? 0;

export type LiveStripResult = { matches: Match[]; liveCount: number };

export function selectLiveStripMatches(input: {
  live: readonly Match[];
  /** Seçili günün maçları (bitmişler buradan). */
  pool: readonly Match[];
  leagueFilter: LeagueFilterState;
  allowedCompetitionIds?: ReadonlySet<number> | null;
  todayIso: string;
  selectedDate: string;
}): LiveStripResult | null {
  if (input.selectedDate !== input.todayIso) return null;

  const allowed = (list: Match[]) => {
    const byPage = input.allowedCompetitionIds ? list.filter((m) => input.allowedCompetitionIds!.has(m.competition?.id ?? 0)) : list;
    return filterMatchesByLeagues(byPage, input.leagueFilter);
  };

  const live = dedupe(allowed(input.live.filter((m) => isMatchLive(m))).sort((a, b) => stripPriority(a) - stripPriority(b) || kickoff(a) - kickoff(b) || Number(a.id) - Number(b.id))).slice(0, LIVE_STRIP_MAX_LIVE);
  const taken = new Set(live.map((m) => String(m.id)));

  const finished = dedupe(
    allowed(
      input.pool.filter((m) => m.status === 'FINISHED' && !isCalledOff(m) && !taken.has(String(m.id)) && matchIstanbulDate(m) === input.todayIso),
    ).sort((a, b) => stripPriority(a) - stripPriority(b) || kickoff(b) - kickoff(a) || Number(b.id) - Number(a.id)),
  ).slice(0, LIVE_STRIP_MAX_FINISHED);

  const matches = [...live, ...finished];
  return matches.length === 0 ? null : { matches, liveCount: live.length };
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

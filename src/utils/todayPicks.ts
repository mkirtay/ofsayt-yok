/**
 * `/bugun` ("Bugün Scor3'te") öne çıkan maç seçimi — saf, test edilebilir.
 *
 * Kademe (üstteki önce):
 *  1. Avrupa kupasında (UCL / UEL / UECL / Süper Kupa) Türk takımı — Türk takımı = Türkiye lig kademe haritasında
 *     (Süper Lig, 1. Lig, 2. Lig; `/api/leagues/turkey-team-tiers` ile aynı kaynak) olan takım.
 *  2. Süper Lig derbisi (Sportmonks `rivals`, bkz. server/teamRivals.ts).
 *  3. Süper Lig'in diğer maçları.
 *  4. Şampiyonlar Ligi (Türk takımı olmayan).
 *  5. Büyük 5 lig (Premier League, La Liga, Bundesliga, Serie A, Ligue 1 sırasıyla).
 * Diğer ligler hiç girmez. Kademe içinde başlama saati ↑ (büyük 5'te önce lig sırası); en çok `TODAY_PICKS_MAX`.
 */
import type { Match } from '@/models/liveScore';
import { BIG_FIVE_IDS, SUPER_LIG_ID, UEFA_CLUB_IDS } from '@/config/leaguePriority';
import { matchKickoffMs } from '@/utils/matchActivity';

export const TODAY_PICKS_MAX = 6;
export const CHAMPIONS_LEAGUE_ID = 2;

export type TodayPickTier = 'turkishInEurope' | 'derby' | 'superLig' | 'championsLeague' | 'bigFive';

const TIER_ORDER: readonly TodayPickTier[] = ['turkishInEurope', 'derby', 'superLig', 'championsLeague', 'bigFive'];

export type TodayPickContext = {
  /** Türk takımı id'leri (Türkiye lig kademe haritası). */
  turkishTeamIds: ReadonlySet<number>;
  /** Derbi olan maç id'leri (yalnız Süper Lig maçları için hesaplanır). */
  derbyMatchIds: ReadonlySet<number>;
};

const leagueOf = (m: Match): number | undefined => m.competition?.id ?? m.competition_id;
const teamIds = (m: Match): number[] =>
  [m.home?.id ?? m.home_id, m.away?.id ?? m.away_id].filter((x): x is number => typeof x === 'number');

export function todayPickTier(m: Match, ctx: TodayPickContext): TodayPickTier | null {
  const league = leagueOf(m);
  if (league == null) return null;
  if ((UEFA_CLUB_IDS as readonly number[]).includes(league) && teamIds(m).some((id) => ctx.turkishTeamIds.has(id))) {
    return 'turkishInEurope';
  }
  if (league === SUPER_LIG_ID) return ctx.derbyMatchIds.has(Number(m.id)) ? 'derby' : 'superLig';
  if (league === CHAMPIONS_LEAGUE_ID) return 'championsLeague';
  if ((BIG_FIVE_IDS as readonly number[]).includes(league)) return 'bigFive';
  return null;
}

/** Süper Lig maçları (derbi kontrolü yalnız bunlara yapılır → rakip isteği sayısı sınırlı). */
export function superLigMatches(matches: readonly Match[]): Match[] {
  return matches.filter((m) => leagueOf(m) === SUPER_LIG_ID);
}

export type TodayPick = { match: Match; tier: TodayPickTier };

export function selectTodayPicks(matches: readonly Match[], ctx: TodayPickContext, max: number = TODAY_PICKS_MAX): TodayPick[] {
  const seen = new Set<number>();
  const picks: TodayPick[] = [];
  for (const m of matches) {
    const id = Number(m.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const tier = todayPickTier(m, ctx);
    if (tier) picks.push({ match: m, tier });
  }
  const bigFiveRank = (m: Match) => (BIG_FIVE_IDS as readonly number[]).indexOf(leagueOf(m) ?? -1);
  const kickoff = (m: Match) => matchKickoffMs(m) ?? Number.MAX_SAFE_INTEGER;
  picks.sort((a, b) => {
    const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
    if (t) return t;
    if (a.tier === 'bigFive') {
      const l = bigFiveRank(a.match) - bigFiveRank(b.match);
      if (l) return l;
    }
    return kickoff(a.match) - kickoff(b.match) || Number(a.match.id) - Number(b.match.id);
  });
  return picks.slice(0, max);
}

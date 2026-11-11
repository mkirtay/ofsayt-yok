/** Maç → havuz girdisi + büyük 5 tablo bağlamı (Sportmonks tabloları paylaşımlı önbellekten; hata → o lig için "ilk 6" bilinmez). */
import type { Match } from '@/models/liveScore';
import { COMBO_POOL, topTeamIdsFromTable, type PoolContext, type PoolInput } from '@/config/comboPool';
import { getCompetitionTableFull } from '@/services/liveScoreService';
import { toAfId } from '@/services/apiFootball/ids';
import { matchKickoffMs } from '@/utils/matchActivity';

export function matchToPoolInput(m: Match): PoolInput {
  const national = toAfId(m.id) != null;
  const compId = Number(m.competition?.id ?? m.competition_id ?? 0);
  return {
    matchId: String(m.id),
    leagueId: national ? (toAfId(compId) ?? 0) : compId,
    national,
    homeTeamId: Number.isFinite(Number(m.home?.id)) ? Number(m.home.id) : null,
    awayTeamId: Number.isFinite(Number(m.away?.id)) ? Number(m.away.id) : null,
    homeCountryId: m.home?.country_id ?? null,
    awayCountryId: m.away?.country_id ?? null,
    homeName: m.home_name ?? m.home?.name ?? '',
    awayName: m.away_name ?? m.away?.name ?? '',
    kickoffMs: matchKickoffMs(m),
  };
}

/** Gündeki büyük 5 ligler için tablo → ilk N takım (yalnız gerekli ligler). */
export async function loadPoolContext(inputs: readonly PoolInput[], getTable: typeof getCompetitionTableFull = getCompetitionTableFull): Promise<PoolContext> {
  const leagues = [...new Set(inputs.filter((i) => !i.national && COMBO_POOL.bigFive.includes(i.leagueId)).map((i) => i.leagueId))];
  const entries = await Promise.all(leagues.map(async (l) => [l, topTeamIdsFromTable((await getTable(String(l)).catch(() => null)) as never)] as const));
  return { topTeamsByLeague: new Map(entries) };
}

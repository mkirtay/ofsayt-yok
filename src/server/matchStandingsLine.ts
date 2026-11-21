/**
 * Maç sayfası SSR puan durumu satırı: lig tablosu YALNIZ önbellekten (`withSportmonksCacheOnly`) — bu satır yeni
 * Sportmonks isteği atmaz; önbellekte yoksa satır yok. Tablo anahtarı lig sayfası (/lig/{slug}, ISR 30 dk) ile aynı
 * (`getCompetitionStandings`), o ligler hep sıcak. Milli maçta yok.
 */
import type { Match } from '@/models/liveScore';
import { leagueHubByLeagueId } from '@/config/leagueHubs';
import { leagueDisplayName } from '@/lib/gundem/bot/leagueNames';
import { isNationalMatchId } from '@/services/apiFootball/ids';
import { hubSelectionIdForLeague } from '@/utils/hubLeagueSelection';
import { pickStandings, type MatchStandingsLine } from '@/utils/matchStandingsLine';

export async function loadMatchStandingsLine(match: Match): Promise<MatchStandingsLine | null> {
  try {
    const leagueId = Number(match.competition?.id ?? match.competition_id);
    const homeId = Number(match.home?.id ?? match.home_id);
    const awayId = Number(match.away?.id ?? match.away_id);
    if (!(leagueId > 0) || !(homeId > 0) || !(awayId > 0) || isNationalMatchId(match.id)) return null;
    const [{ getCompetitionStandings }, { withSportmonksCacheOnly }, { toStandingsBlocks }] = await Promise.all([
      import('@/services/competitionStandings'),
      import('@/server/sportmonks/cachedFetch'),
      import('@/utils/standingsBlocks'),
    ]);
    const table = await withSportmonksCacheOnly({ misses: 0 }, () => getCompetitionStandings(String(leagueId)));
    const picked = pickStandings(
      toStandingsBlocks(table, (n) => n),
      { id: homeId, name: match.home?.name ?? '' },
      { id: awayId, name: match.away?.name ?? '' },
    );
    if (!picked) return null;
    const hub = leagueHubByLeagueId(leagueId);
    const leagueName = leagueDisplayName(leagueId, match.competition?.name ?? match.competition_name) ?? '';
    if (!leagueName) return null;
    return { leagueName, // Lig sayfası yoksa uygulamadaki puan durumu (o lig seçili).
    leagueHref: hub ? `/lig/${hub.slug}` : `/standings?league=${hubSelectionIdForLeague(leagueId)}`, ...picked };
  } catch {
    return null;
  }
}

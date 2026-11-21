/**
 * /teams/[id] ISR kabuğu için tek istek: takım adı (paylaşım etiketleri). İstek, istemcinin takım sayfasındaki
 * `teams/{id}` genel bakış isteğiyle aynı (aynı önbellek anahtarı → çoğunlukla HIT); sayfa render bütçesi (3 sn).
 */
import { getTeamOverview } from '@/services/teamPage';
import { leagueDisplayName } from '@/lib/gundem/bot/leagueNames';
import { primaryLeague } from '@/utils/teamSeo';
import { leagueHubByLeagueId } from '@/config/leagueHubs';
import type { TeamOverview } from '@/services/sportmonks/teamOverview';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } from '@/server/sportmonks/cachedFetch';

/**
 * SEO / GEO özeti için durağan bilgiler (aynı genel bakış yanıtından, ek istek yok). Kabuk 7 gün önbellekte kaldığından
 * yalnız yavaş değişen alanlar: skor / son maç gibi hızlı değişenler BURAYA girmez.
 */
export type TeamPageFacts = {
  logo: string | null;
  coach: string | null;
  venue: { name: string; city: string | null; capacity: number | null } | null;
  /** Güncel sezonun turnuvaları (ör. "Süper Lig", "UEFA Avrupa Ligi") ve sezon adı. */
  season: { name: string; competitions: string[] } | null;
  xUrl: string | null;
  /** Ana lig (güncel sezonda `domestic`); yoksa null. Eski kabuklarda alan yok. */
  league?: { id: number; name: string; slug: string | null } | null;
  /**
   * Ana ligdeki sıra (kabuk üretildiği gün; tablo YALNIZ önbellekten, yeni istek yok). Kabuk 7 gün tutulduğu için tarihle
   * ("22 Kasım itibarıyla") yazılır.
   */
  standing?: { rank: number; points: number; played: number; won: number; drawn: number; lost: number; goalDiff: number; asOf: string } | null;
};

export type TeamPageShell = { kind: 'found'; name: string; facts: TeamPageFacts } | { kind: 'missing' } | { kind: 'error' };

export function teamFactsFromOverview(o: TeamOverview): TeamPageFacts {
  const current = o.campaigns[0];
  // Türkçe kısa ad ("Super Lig" → "Süper Lig", "Champions League" → "Şampiyonlar Ligi"); eşlemesi yoksa API adı.
  const competitions = [...new Set((current?.seasons ?? []).map((s) => leagueDisplayName(s.leagueId, s.leagueName)).filter((n): n is string => Boolean(n)))];
  return {
    logo: o.team?.logo ?? null,
    coach: o.coach?.name ?? null,
    venue: o.venue?.name ? { name: o.venue.name, city: o.venue.city ?? null, capacity: o.venue.capacity ?? null } : null,
    season: current && competitions.length ? { name: current.name, competitions } : null,
    xUrl: o.social?.url ?? null,
    league: (() => {
      const l = primaryLeague(o.campaigns);
      return l ? { ...l, slug: leagueHubByLeagueId(l.id)?.slug ?? null } : null;
    })(),
  };
}

const asOfFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long' });

/** Ana ligdeki güncel sıra: lig tablosu yalnız önbellekten (lig sayfasıyla aynı anahtar); yoksa null. */
export async function loadTeamStanding(teamId: number, leagueId: number, now: number = Date.now()): Promise<TeamPageFacts['standing']> {
  try {
    const [{ getCompetitionStandings }, { withSportmonksCacheOnly }, { toStandingsBlocks }] = await Promise.all([
      import('@/services/competitionStandings'),
      import('@/server/sportmonks/cachedFetch'),
      import('@/utils/standingsBlocks'),
    ]);
    const table = await withSportmonksCacheOnly({ misses: 0 }, () => getCompetitionStandings(String(leagueId)));
    for (const b of toStandingsBlocks(table, (n) => n)) {
      const r = b.rows.find((x) => Number(x.team?.id ?? x.team_id) === teamId);
      if (r) return { rank: r.rank, points: r.points, played: r.matches, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goal_diff, asOf: asOfFmt.format(new Date(now)) };
    }
    return null;
  } catch {
    return null;
  }
}

const MISSING_STATUSES = new Set([400, 403, 404, 422]);

export async function loadTeamPageShell(teamId: string): Promise<TeamPageShell> {
  if (!/^\d{1,9}$/.test(teamId)) return { kind: 'missing' };
  try {
    const overview = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getTeamOverview(teamId));
    if (!overview.team?.name) return { kind: 'missing' };
    const facts = teamFactsFromOverview(overview);
    if (facts.league) facts.standing = await loadTeamStanding(overview.team.id, facts.league.id);
    return { kind: 'found', name: overview.team.name, facts };
  } catch (err) {
    if (err instanceof SportmonksHttpError && MISSING_STATUSES.has(err.status)) return { kind: 'missing' };
    return { kind: 'error' };
  }
}

/**
 * /teams/[id] ISR kabuğu için tek istek: takım adı (paylaşım etiketleri). İstek, istemcinin takım sayfasındaki
 * `teams/{id}` genel bakış isteğiyle aynı (aynı önbellek anahtarı → çoğunlukla HIT); sayfa render bütçesi (3 sn).
 */
import { getTeamOverview } from '@/services/teamPage';
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
};

export type TeamPageShell = { kind: 'found'; name: string; facts: TeamPageFacts } | { kind: 'missing' } | { kind: 'error' };

export function teamFactsFromOverview(o: TeamOverview): TeamPageFacts {
  const current = o.campaigns[0];
  const competitions = [...new Set((current?.seasons ?? []).map((s) => s.leagueName?.trim()).filter((n): n is string => Boolean(n)))];
  return {
    logo: o.team?.logo ?? null,
    coach: o.coach?.name ?? null,
    venue: o.venue?.name ? { name: o.venue.name, city: o.venue.city ?? null, capacity: o.venue.capacity ?? null } : null,
    season: current && competitions.length ? { name: current.name, competitions } : null,
    xUrl: o.social?.url ?? null,
  };
}

const MISSING_STATUSES = new Set([400, 403, 404, 422]);

export async function loadTeamPageShell(teamId: string): Promise<TeamPageShell> {
  if (!/^\d{1,9}$/.test(teamId)) return { kind: 'missing' };
  try {
    const overview = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getTeamOverview(teamId));
    return overview.team?.name ? { kind: 'found', name: overview.team.name, facts: teamFactsFromOverview(overview) } : { kind: 'missing' };
  } catch (err) {
    if (err instanceof SportmonksHttpError && MISSING_STATUSES.has(err.status)) return { kind: 'missing' };
    return { kind: 'error' };
  }
}

/**
 * /teams/[id] ISR kabuğu için tek istek: takım adı (paylaşım etiketleri). İstek, istemcinin takım sayfasındaki
 * `teams/{id}` genel bakış isteğiyle aynı (aynı önbellek anahtarı → çoğunlukla HIT); sayfa render bütçesi (3 sn).
 */
import { getTeamOverview } from '@/services/teamPage';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } from '@/server/sportmonks/cachedFetch';

export type TeamPageShell = { kind: 'found'; name: string } | { kind: 'missing' } | { kind: 'error' };

const MISSING_STATUSES = new Set([400, 403, 404, 422]);

export async function loadTeamPageShell(teamId: string): Promise<TeamPageShell> {
  if (!/^\d{1,9}$/.test(teamId)) return { kind: 'missing' };
  try {
    const overview = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getTeamOverview(teamId));
    return overview.team?.name ? { kind: 'found', name: overview.team.name } : { kind: 'missing' };
  } catch (err) {
    if (err instanceof SportmonksHttpError && MISSING_STATUSES.has(err.status)) return { kind: 'missing' };
    return { kind: 'error' };
  }
}

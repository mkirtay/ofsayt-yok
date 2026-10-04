/**
 * Sitemap'e hakem ve teknik direktör sayfaları: Süper Lig ve 1. Lig'in son iki sezonunda görev alanlar.
 * - hakemler `referees/seasons/{id}` (sayfalı), teknik direktörler `teams/seasons/{id}?include=coaches.coach`
 *   (görev aralığı son iki sezonla örtüşen); ikisi de günde bir (cachePolicy). Sezon başına ~2–4 istek, sitemap günde bir.
 * Hata sitemap'i düşürmez (boş liste).
 */
import { getSeasonsList } from '@/services/liveScoreService';
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import { coachHref, refereeHref } from '@/utils/personUrl';
import { REFEREE_TABLE_LEAGUES, refereeTablePath } from '@/config/refereeTableLeagues';

const LEAGUES = ['600', '603'];
const SEASONS_PER_LEAGUE = 2;

type RawPerson = { id: number; display_name?: string; common_name?: string; name?: string };
type RawTeamWithCoaches = { coaches?: { coach_id?: number; end?: string | null; coach?: RawPerson | null }[] | null };

const personName = (p: RawPerson | null | undefined) => p?.display_name ?? p?.common_name ?? p?.name ?? '';

export async function loadSitemapPeoplePaths(): Promise<string[]> {
  const seasonLists = await Promise.all(LEAGUES.map((l) => getSeasonsList({ competitionId: l }).catch(() => [])));
  const seasons = seasonLists.flatMap((list) => list.slice(0, SEASONS_PER_LEAGUE));
  if (!seasons.length) return [];
  // Son iki sezonun en erken başlangıcı: bundan sonra biten (ya da bitmeyen) görevler sayılır.
  const since = seasons.map((s) => s.start ?? '').filter(Boolean).sort()[0] ?? '';

  const paths = new Set<string>();
  await Promise.all(
    seasons.map(async (season) => {
      const [referees, teams] = await Promise.all([
        sportmonksCollectAllPages<RawPerson>({ basePath: 'football', path: `/referees/seasons/${season.id}`, perPage: 50, maxPages: 5 }).catch(() => []),
        sportmonksCollectAllPages<RawTeamWithCoaches>({
          basePath: 'football',
          path: `/teams/seasons/${season.id}`,
          perPage: 50,
          maxPages: 2,
          extraParams: { include: 'coaches.coach:display_name,common_name' },
        }).catch(() => []),
      ]);
      for (const r of referees) if (r?.id) paths.add(refereeHref(r.id, personName(r)));
      for (const t of teams) {
        for (const c of t.coaches ?? []) {
          if (!c.coach_id || (c.end && since && c.end < since)) continue;
          paths.add(coachHref(c.coach_id, personName(c.coach)));
        }
      }
    }),
  );
  return [...paths].sort();
}

/** Hakem tablosu: lig başına bir sayfa (güncel sezon). */
export function refereeTableSitemapPaths(): string[] {
  return REFEREE_TABLE_LEAGUES.map((l) => refereeTablePath(l.slug, null, true));
}

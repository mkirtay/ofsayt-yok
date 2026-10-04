/**
 * /hakemler sayfası: bir lig + sezonun hakem tablosu (SSR / ISR, 12 sa).
 * - Hakem listesi `referees/seasons/{seasonId}` (sezonda görev alanlar; 24 sa cache, sitemap ile ortak),
 * - her hakemin o sezonki satırı mevcut hakem istatistik cache'inden (hakem kartı / sayfası ile ortak anahtar, 12 sa),
 *   eşzamanlı en çok 8 istek. Sezon satırı olmayan (yardımcı hakem / dördüncü hakem) listeye girmez.
 * Hesaplanan tablo Redis'te 12 sa.
 */
import { getSeasonsList } from '@/services/liveScoreService';
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import { seasonLine, type RefereeSeasonLine } from '@/services/sportmonks/refereeStats';
import { loadRefereeStatsRaw } from '@/server/refereeSummary';
import { personSlug } from '@/utils/personUrl';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { REFEREE_TABLE_LEAGUES, seasonSlugOf, type RefereeTableLeague } from '@/config/refereeTableLeagues';

const STATS_CONCURRENCY = 8;
const TABLE_TTL_SECONDS = 12 * 60 * 60;
const SEASON_OPTIONS = 3;

export type RefereeTableRow = RefereeSeasonLine & { refereeId: number; name: string; slug: string };

export type RefereeLeagueTable = {
  league: RefereeTableLeague;
  season: { id: number; name: string; slug: string; isCurrent: boolean };
  seasons: { name: string; slug: string }[];
  rows: RefereeTableRow[];
};

type RawPerson = { id: number; display_name?: string; common_name?: string; name?: string };

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** `missing` = bilinmeyen lig / sezon; `null` = geçici hata. */
export async function loadRefereeLeagueTable(leagueSlug: string, seasonSlug: string | null): Promise<RefereeLeagueTable | 'missing' | null> {
  const league = REFEREE_TABLE_LEAGUES.find((l) => l.slug === leagueSlug);
  if (!league) return 'missing';
  const seasonList = (await getSeasonsList({ competitionId: String(league.id) }).catch(() => [])).slice(0, SEASON_OPTIONS);
  if (!seasonList.length) return null;
  const seasons = seasonList.map((s) => ({ id: s.id, name: s.name, slug: seasonSlugOf(s.name) }));
  const season = seasonSlug ? seasons.find((s) => s.slug === seasonSlug) : seasons[0];
  if (!season) return 'missing';

  const key = `${cacheKeyPrefix()}people:ref-table:v1:${season.id}`;
  let rows = await withRedis((r) => r.get<RefereeTableRow[]>(key), null);
  if (!rows) {
    const referees = await sportmonksCollectAllPages<RawPerson>({ basePath: 'football', path: `/referees/seasons/${season.id}`, perPage: 50, maxPages: 5 }).catch(() => null);
    if (!referees) return null;
    const unique = [...new Map(referees.filter((r) => r?.id).map((r) => [r.id, r])).values()];
    const lines = await mapWithConcurrency(unique, STATS_CONCURRENCY, async (r) => {
      const raw = await loadRefereeStatsRaw(r.id);
      const stat = raw?.statistics?.find((s) => (s.season_id ?? s.season?.id) === season.id);
      if (!stat) return null;
      const line = seasonLine(stat, season.id, season.name);
      if (line.matches <= 0) return null;
      const name = r.display_name ?? r.common_name ?? r.name ?? '';
      return { ...line, refereeId: r.id, name, slug: personSlug(name, r.id) } satisfies RefereeTableRow;
    });
    rows = sortByMatches(lines.filter((x): x is RefereeTableRow => x != null));
    if (rows.length) await withRedis((r) => r.set(key, rows, { ex: TABLE_TTL_SECONDS }), null);
  }

  return {
    league,
    season: { ...season, isCurrent: season.id === seasons[0]!.id },
    seasons: seasons.map(({ name, slug }) => ({ name, slug })),
    rows,
  };
}

/** Varsayılan sıra: maç sayısı (çoktan aza), eşitlikte ad. */
export function sortByMatches(rows: RefereeTableRow[]): RefereeTableRow[] {
  return [...rows].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name, 'tr'));
}

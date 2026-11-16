import type { GetServerSideProps } from 'next';
import { leagueHubBySlug } from '@/config/leagueHubs';
import { BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';

/**
 * /embed/puan-durumu/{lig}[?tema=koyu] — başka sitelerde iframe ile gösterilen puan durumu (bkz. server/embed). Çerçeveye
 * alınabilir (next.config `/embed/*` başlık istisnası), dizine eklenmez (noindex + robots Disallow). CDN 30 dk.
 */
export default function StandingsEmbed() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ params, query, res }) => {
  const hub = leagueHubBySlug(String(params?.slug ?? ''));
  if (!hub) return { notFound: true };
  const [{ getCompetitionStandings }, { withSportmonksTimeout, SPORTMONKS_TIMEOUT_MS }, { buildStandingsEmbedHtml }, { toStandingsBlocks }] = await Promise.all([
    import('@/services/competitionStandings'),
    import('@/server/sportmonks/cachedFetch'),
    import('@/server/embed/standingsEmbed'),
    import('@/utils/standingsBlocks'),
  ]);
  const table = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () => getCompetitionStandings(String(hub.leagueId))).catch(() => null);
  const rows = toStandingsBlocks(table, (n) => n)[0]?.rows ?? [];
  const base = siteBaseUrl();
  const html = buildStandingsEmbedHtml({
    leagueName: hub.name,
    hubUrl: `${base}/lig/${hub.slug}`,
    baseUrl: base,
    rows,
    theme: query.tema === 'koyu' ? 'dark' : 'light',
    brand: BRAND.name,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', rows.length ? 'public, s-maxage=1800, stale-while-revalidate=3600' : 'public, s-maxage=60');
  res.write(html);
  res.end();
  return { props: {} };
};

import type { GetServerSideProps } from 'next';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { getFixturesByDate } from '@/services/liveScoreService';
import { buildMatchSlug } from '@/utils/matchUrl';
import { livescoreAxiosFromIncomingMessage } from '@/server/livescoreInternalAxios';

const BASE_URL = process.env.AUTH_URL ?? 'https://ofsaytyok.app';

const STATIC_ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'hourly' },
  { path: '/standings', priority: '0.8', changefreq: 'daily' },
  { path: '/uefa', priority: '0.8', changefreq: 'daily' },
  { path: '/compare', priority: '0.6', changefreq: 'weekly' },
  { path: '/credits', priority: '0.7', changefreq: 'monthly' },
];

function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildXml(urls: { loc: string; priority: string; changefreq: string }[]): string {
  const entries = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

export default function SitemapXml() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const offsets = [-3, -2, -1, 0, 1, 2, 3];
  const dates = offsets.map(isoDateOffset);

  let matchUrls: { loc: string; priority: string; changefreq: string }[] = [];

  try {
    const client = livescoreAxiosFromIncomingMessage(req);
    const fixtureResults = await runWithLiveScoreHttpClient(client, () =>
      Promise.all(dates.map((d) => getFixturesByDate(d).catch(() => [])))
    );

    const seen = new Set<string>();
    for (const fixtures of fixtureResults) {
      for (const match of fixtures) {
        const id = String(match.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const slug = buildMatchSlug(match);
        const path = slug ? `/matches/${id}-${slug}` : `/matches/${id}`;
        matchUrls.push({ loc: `${BASE_URL}${path}`, priority: '0.6', changefreq: 'hourly' });
      }
    }
  } catch {
    // sitemap still works with just static routes
  }

  const staticUrls = STATIC_ROUTES.map((r) => ({
    loc: `${BASE_URL}${r.path}`,
    priority: r.priority,
    changefreq: r.changefreq,
  }));

  const xml = buildXml([...staticUrls, ...matchUrls]);

  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
  res.write(xml);
  res.end();

  return { props: {} };
};

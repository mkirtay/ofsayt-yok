import type { GetServerSideProps } from 'next';
import { getFixturesByDate } from '@/services/liveScoreService';
import { buildMatchSlug } from '@/utils/matchUrl';

const BASE_URL = process.env.AUTH_URL ?? 'https://ofsaytyok.app';

const STATIC_ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'hourly' },
  { path: '/standings', priority: '0.8', changefreq: 'daily' },
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

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  const offsets = [-3, -2, -1, 0, 1, 2, 3];
  const dates = offsets.map(isoDateOffset);

  const matchUrls: { loc: string; priority: string; changefreq: string }[] = [];

  try {
    const fixtureResults = await Promise.all(dates.map((d) => getFixturesByDate(d).catch(() => [])));

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

  // Hakem / teknik direktör sayfaları (Süper Lig + 1. Lig, son iki sezon) — hata sitemap'i düşürmez.
  let peopleUrls: { loc: string; priority: string; changefreq: string }[] = [];
  try {
    const { loadSitemapPeoplePaths } = await import('@/server/people/sitemapPeople');
    peopleUrls = (await loadSitemapPeoplePaths()).map((path) => ({ loc: `${BASE_URL}${path}`, priority: '0.4', changefreq: 'weekly' }));
  } catch {
    // yok say
  }

  const staticUrls = STATIC_ROUTES.map((r) => ({
    loc: `${BASE_URL}${r.path}`,
    priority: r.priority,
    changefreq: r.changefreq,
  }));

  const xml = buildXml([...staticUrls, ...matchUrls, ...peopleUrls]);

  res.setHeader('Content-Type', 'text/xml; charset=utf-8');
  // ±3 günlük maç listesi günde bir değişir; üretim ~750 ms CPU (7 günün fikstürü) → CDN'de 1 gün, sonra 1 gün
  // eski kopya verilirken arka planda yenilenir (bölge başına günde en çok ~1 üretim).
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(xml);
  res.end();

  return { props: {} };
};

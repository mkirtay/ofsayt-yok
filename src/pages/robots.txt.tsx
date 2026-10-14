import type { GetServerSideProps } from 'next';
import { siteBaseUrl } from '@/lib/siteUrl';
import { ROBOTS_BLOCKED_AI_AGENTS } from '@/config/crawlers';

/**
 * Eskiden `public/robots.txt` (statik); Sitemap satırı alan adına bağlı olduğu için `siteBaseUrl()`'den üretilir.
 * AI tarayıcıları (bkz. config/crawlers.ts) ayrı grupta tüm siteden engellenir; kendi grubu olan bot `*` grubunu okumaz.
 */
export function buildRobotsTxt(baseUrl: string): string {
  return [
    ...ROBOTS_BLOCKED_AI_AGENTS.map((agent) => `User-agent: ${agent}`),
    'Disallow: /',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    'Disallow: /api/',
    'Disallow: /profile',
    'Disallow: /ai-istatistikleri',
    'Disallow: /auth/',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export default function RobotsTxt() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  // İçerik yalnız dağıtımla değişir → CDN'de 1 gün (+1 gün eski kopya), fonksiyon neredeyse hiç çalışmaz.
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(buildRobotsTxt(siteBaseUrl()));
  res.end();
  return { props: {} };
};

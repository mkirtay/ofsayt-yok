import type { GetServerSideProps } from 'next';
import { siteBaseUrl } from '@/lib/siteUrl';

/** Eskiden `public/robots.txt` (statik); Sitemap satırı alan adına bağlı olduğu için `siteBaseUrl()`'den üretilir. */
export function buildRobotsTxt(baseUrl: string): string {
  return [
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

import type { GetServerSideProps } from 'next';
import { siteBaseUrl } from '@/lib/siteUrl';
import { ROBOTS_BLOCKED_AI_AGENTS } from '@/config/crawlers';

/**
 * Eskiden `public/robots.txt` (statik); Sitemap satırı alan adına bağlı olduğu için `siteBaseUrl()`'den üretilir.
 * AI eğitim / arama botları `*` grubunu okur (erişebilir; Sportmonks'a istek attıramaz, bkz. config/crawlers.ts). Yalnız
 * saldırgan kazıyıcılar ayrı grupta tüm siteden engellenir; kendi grubu olan bot `*` grubunu okumaz.
 */
export function buildRobotsTxt(baseUrl: string): string {
  return [
    ...ROBOTS_BLOCKED_AI_AGENTS.map((agent) => `User-agent: ${agent}`),
    'Disallow: /',
    '',
    'User-agent: *',
    // Grup içinde boş satır yok (katı ayrıştırıcılar boş satırdan sonraki Disallow'u gruba bağlamaz).
    'Allow: /',
    // Paylaşım görselleri ve logolar /api/ altında: Twitterbot robots.txt'ye uyar (kapalıysa X kartında görsel çıkmaz),
    // Google da og:image / SportsEvent.image ve logoları çekemezdi. En uzun eşleşen kural kazanır → yalnız bu iki yol
    // açık; çizim / veri okuma ogGuard bütçesiyle sınırlı (server/og/ogGuard.ts).
    'Allow: /api/og/',
    'Allow: /api/img/',
    'Disallow: /api/',
    'Disallow: /profile',
    'Disallow: /auth/',
    'Disallow: /embed/',
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

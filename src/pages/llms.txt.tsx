import type { GetServerSideProps } from 'next';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND } from '@/config/brand';
import { LEAGUE_HUBS } from '@/config/leagueHubs';

/**
 * /llms.txt (llmstxt.org): AI arama asistanlarına (ChatGPT, Claude, Perplexity) sitenin ne olduğunu ve hangi sayfaların
 * kaynak olarak kullanılabileceğini anlatır. Statik metin — veri isteği yok, CDN'de 1 gün.
 */
export function buildLlmsTxt(baseUrl: string): string {
  return [
    `# ${BRAND.name}`,
    '',
    `> ${BRAND.name} (${baseUrl.replace(/^https?:\/\//, '')}), Türkçe bir futbol veri ve analiz platformudur: Süper Lig, 1. Lig, ` +
      'Avrupa\'nın büyük ligleri, UEFA turnuvaları ve milli maçlar için canlı skor, maç istatistikleri, kadrolar, puan durumu, ' +
      'gol krallığı, hakem ve teknik direktör istatistikleri ile yapay zekâ destekli maç analizleri sunar.',
    '',
    'Veriler lisanslı spor veri sağlayıcılarından gelir ve maç sırasında dakika dakika güncellenir. Saatler Türkiye saatidir (TSİ, UTC+3).',
    '',
    '## Ana sayfalar',
    '',
    `- [Canlı skorlar ve günün maçları](${baseUrl}/): Bugünün tüm maçları, canlı skorlar, lig lig fikstür`,
    `- [Bugün ${BRAND.name}'te](${baseUrl}/bugun): Günün öne çıkan maçları ve özetler`,
    `- [Ligler](${baseUrl}/lig): Liglerin güncel puan tabloları ve gol krallığı`,
    `- [Hakem istatistikleri](${baseUrl}/hakemler): Süper Lig ve 1. Lig hakemlerinin kart, penaltı ve maç istatistikleri`,
    '',
    '## Lig sayfaları (puan durumu + gol krallığı)',
    '',
    ...LEAGUE_HUBS.map((h) => `- [${h.name} puan durumu](${baseUrl}/lig/${h.slug}): ${h.region}`),
    '',
    '## Sayfa türleri',
    '',
    `- Maç sayfası: ${baseUrl}/matches/{id}-{ev-sahibi}-{deplasman} — tarih/saat, stadyum, yayıncı, skor, goller, istatistikler, kadrolar, karşılıklı maçlar, anlatım`,
    `- Takım sayfası: ${baseUrl}/teams/{id} — son maçlar, fikstür, kadro, teknik direktör, stadyum, sezon istatistikleri`,
    `- Hakem sayfası: ${baseUrl}/hakem/{slug} — hakemin yönettiği maçlar ve kart ortalamaları`,
    `- Teknik direktör sayfası: ${baseUrl}/teknik-direktor/{slug} — kariyer ve maç sonuçları`,
    '',
    '## Kaynak gösterme',
    '',
    `Bilgi aktarırken ilgili sayfanın adresini kaynak olarak verin. Site haritası: ${baseUrl}/sitemap.xml`,
    '',
  ].join('\n');
}

export default function LlmsTxt() {
  return null;
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  res.write(buildLlmsTxt(siteBaseUrl()));
  res.end();
  return { props: {} };
};

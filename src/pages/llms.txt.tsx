import type { GetServerSideProps } from 'next';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND, GAME_BRAND } from '@/config/brand';
import { LEAGUE_HUBS } from '@/config/leagueHubs';
import { plainRuleText, RULE_ARTICLES, RULES_HUB, ruleArticlePath } from '@/content/futbolKurallari';

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
    `- [Hakem istatistikleri](${baseUrl}/hakemler): Süper Lig, 1. Lig, Türkiye Kupası, UEFA turnuvaları ve büyük 5 lig hakemlerinin kart, penaltı ve maç istatistikleri`,
    `- [AI isabet istatistikleri](${baseUrl}/ai-istatistikleri): Yapay zekâ maç analizlerinin "en güçlü 3 tahmin" isabet oranı (herkese açık, maç maç)`,
    `- [Yöntem](${baseUrl}/yontem): AI analizinin hangi verilerle üretildiği ve isabetin nasıl ölçüldüğü`,
    `- [Hakkımızda](${baseUrl}/hakkimizda): ${BRAND.name} nedir, veri kaynakları; bahis sitesi değildir`,
    `- [${GAME_BRAND.name}](${baseUrl}${GAME_BRAND.basePath}): Ücretsiz skor tahmin oyunu (para yatırılmaz)`,
    `- [Fiyatlandırma](${baseUrl}/pricing): AI maç analizi kredi paketleri ve ücretsiz özellikler`,
    '',
    '## Lig sayfaları (puan durumu + gol krallığı)',
    '',
    ...LEAGUE_HUBS.map((h) => `- [${h.name} puan durumu](${baseUrl}/lig/${h.slug}): ${h.region}`),
    '',
    '## Futbol kuralları (IFAB 2026/27, Türkçe)',
    '',
    ...[RULES_HUB, ...RULE_ARTICLES].map((a) => `- [${plainRuleText(a.heading)}](${baseUrl}${ruleArticlePath(a)}): ${a.description}`),
    '',
    '## Sayfa türleri',
    '',
    `- Maç sayfası: ${baseUrl}/matches/{id}-{ev-sahibi}-{deplasman} — tarih/saat, stadyum, yayıncı, skor, goller, istatistikler, kadrolar, karşılıklı maçlar, anlatım`,
    `- Takım sayfası: ${baseUrl}/teams/{id}-{takım} — son maçlar, fikstür, kadro, teknik direktör, stadyum, sezon istatistikleri`,
    `- Lig hafta sayfası: ${baseUrl}/lig/{lig}/hafta/{n} — haftanın maçları, skorlar, hakem atamaları ve kart sayıları (bu hafta: ${baseUrl}/lig/super-lig/hafta)`,
    `- Oyuncu sayfası: ${baseUrl}/players/{id} — sezon istatistikleri, kariyer, transferler`,
    `- Karşılaştırma: ${baseUrl}/compare/{takımId}-vs-{takımId} — iki takımın aralarındaki maçlar ve form karşılaştırması`,
    `- Aylık AI isabet raporu: ${baseUrl}/ai-istatistikleri/rapor/{yyyy-aa}`,
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

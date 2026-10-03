/**
 * Kilitli AI analizi bölümünün CSS sınıfı — maç sayfasının ücretli içerik işaretlemesi (JSON-LD `hasPart.cssSelector`)
 * ile `LockedPreview`'daki öğe AYNI sınıfı kullanmalı (Google seçicinin sayfadaki öğeyle eşleşmesini ister).
 */
export const LOCKED_SECTION_CLASS = 'ai-analysis-locked';

/**
 * Google'ın ücretli / abonelik içerik işaretlemesi (isAccessibleForFree + hasPart): AI analizinin tamamı kilitli.
 * Yalnız maç BİTMEDEN (bitince analiz herkese açık, karar 1) ve analiz varken eklenir. Googlebot kullanıcıyla aynı
 * içeriği (önizleme + kilitli başlıklar) görür; esnek örnekleme yok.
 */
export function analysisPaywallJsonLd(input: { homeTeamName: string; awayTeamName: string; url: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${input.homeTeamName} – ${input.awayTeamName} AI maç analizi`,
    url: input.url,
    publisher: { '@type': 'Organization', name: 'Ofsayt Yok' },
    isAccessibleForFree: false,
    hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: `.${LOCKED_SECTION_CLASS}` },
  };
}

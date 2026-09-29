/**
 * Maç id'si eski sağlayıcıyla (livescore-api.com) karışamayacak kadar büyük mü?
 *
 * 2026-09-29/30 ölçümleri:
 * - Eski livescore id'leri (DB: MatchAnalysis/MatchTrivia): 680.669–1.861.826.
 * - Güncel Sportmonks fixture'ları ≥19.1M; AMA plan eski UEFA sezonlarına da erişiyor ve onların
 *   id'leri çakışıyor: GS Şampiyonlar Ligi 2006/2012–2015 → 1.058.578–1.060.561, 2018 → ~10,45M,
 *   2009 → ~11,8M (id'ler kronolojik değil). H2H listeleri bunlara link veriyor (GS–Real 2013 = 1058753).
 *
 * Bu yüzden eşiğin altı "belirsiz bölge": salt id'den karar verilmez — `/matches/[slug]` SSR'ı
 * DB'deki saklı içerik + tek `fixtures/{id}` isteği + URL slug karşılaştırmasıyla ayırt eder.
 * Eşiğin üstü kesin Sportmonks.
 *
 * Sağlayıcı değişirse (ör. API-Football id'leri eski livescore id'leriyle aynı büyüklükte) bu
 * kontrol sağlayıcıya göre yeniden tanımlanmalı.
 */
export const UNAMBIGUOUS_SPORTMONKS_MIN_ID = 10_000_000;

export function isUnambiguousSportmonksId(id: string | number | null | undefined): boolean {
  const s = String(id ?? '').trim();
  if (!/^\d{1,12}$/.test(s)) return false;
  return Number(s) >= UNAMBIGUOUS_SPORTMONKS_MIN_ID;
}

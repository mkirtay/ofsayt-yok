/**
 * Bahis dili denetimi — AdSense kumar politikası: sitenin metinleri ve AI çıktısı istatistik / olasılık dilinde kalır.
 * Testler (arayüz metinleri, prompt), AI servisi (üretilen analizde geçerse kayda düşer) ve eski kayıt taraması
 * (docs SQL'i aynı listeyi yansıtır) bu listeyi kullanır.
 *
 * "oran" tek başına yasak değil: "galibiyet oranı" / "isabet oranı" istatistik. Yalnız bahis anlamındaki kalıplar.
 * "iddia" da tek başına Türkçe ("iddia etmek"); yalnız "iddia pazarı / iddia analisti". `[iİ]`: JS /i büyük İ'yi eşlemez.
 */
export const GAMBLING_TERM_PATTERNS: ReadonlyArray<{ term: string; re: RegExp }> = [
  { term: 'bahis', re: /bahis/i },
  { term: 'iddaa', re: /[iİ]ddaa/i },
  { term: 'iddia pazarı', re: /[iİ]ddia (pazar|analist)/i },
  { term: 'kupon', re: /kupon/i },
  { term: 'banko', re: /\bbanko\b/i },
  { term: 'value', re: /\bvalue\b/i },
  { term: 'oran (bahis)', re: /\b(bahis |maç sonucu |açılış |güncel )?oranlar(ı|ın)?\b|oran(ı|lar)? (düş|yüksel)|\boranı? \d/i },
  { term: 'piyasa', re: /piyasa/i },
  { term: 'para akışı', re: /para akış/i },
  { term: 'bet (en)', re: /\bbet(s|ting)?\b|bookmaker|\bodds\b|\bstake\b/i },
];

/** Metinde geçen bahis terimleri (boşsa temiz). */
export function findGamblingTerms(text: string): string[] {
  return GAMBLING_TERM_PATTERNS.filter(({ re }) => re.test(text)).map(({ term }) => term);
}

/**
 * Bahis dili denetimi — AdSense kumar politikası: sitenin metinleri ve AI çıktısı istatistik / olasılık dilinde kalır.
 * Testler (arayüz metinleri, prompt), AI servisi (üretilen analizde geçerse kayda düşer) ve eski kayıt taraması
 * (docs SQL'i aynı listeyi yansıtır) bu listeyi kullanır.
 *
 * "oran" tek başına yasak değil: "galibiyet oranı" / "isabet oranı" istatistik. Yalnız bahis anlamındaki kalıplar
 * (gerçek veride "Deplasmanda galibiyet oranları düşük" cümlesi yanlışlıkla siliniyordu).
 * "iddia" da tek başına Türkçe ("iddia etmek"); yalnız "iddia pazarı / iddia analisti". `[iİ]`: JS /i büyük İ'yi eşlemez.
 */
export const GAMBLING_TERM_PATTERNS: ReadonlyArray<{ term: string; re: RegExp }> = [
  // "bahis" ses düşmesiyle çekimlenir (bahsi, bahse, bahsin…); "bahsetmek" (söz etmek) yakalanmasın diye çekimler açık.
  { term: 'bahis', re: /bahis|\bbahs(i|e|in|ini|ine|inde|ten)\b/i },
  { term: 'iddaa', re: /[iİ]ddaa/i },
  { term: 'iddia pazarı', re: /[iİ]ddia (pazar|analist)/i },
  { term: 'kupon', re: /kupon/i },
  { term: 'banko', re: /\bbanko\b/i },
  { term: 'value', re: /\bvalue\b/i },
  // Bahis oranı kalıpları: nitelikli ("maç sonucu oranları"), hareket fiili ("oranlar düşüyor"), sayı ("oranı 1.85").
  // "galibiyet oranları düşük" (istatistik, sıfat) yakalanmaz.
  {
    term: 'oran (bahis)',
    re: /(maç sonucu|açılış|güncel|kapanış) oran|oran(ı|lar|ları)? (düşüyor|düştü|düşecek|yükseliyor|yükseldi|yükselecek)|\boranı? \d/i,
  },
  { term: 'piyasa', re: /piyasa/i },
  { term: 'para akışı', re: /para akış/i },
  { term: 'bet (en)', re: /\bbet(s|ting)?\b|bookmaker|\bodds\b|\bstake\b/i },
  // Pazar jargonu ("2.5 üst", "KG var", "1X2", "MS 1"). \b Türkçe harflerde çalışmadığı için harf sınırı \p{L} ile.
  {
    term: 'pazar jargonu',
    re: /(^|[^\p{L}\p{N}])(kg (var|yok)|(üst|alt) ?\d[.,]5|\d[.,]5 (üst|alt)|1x2|ms ?[12x]|çifte şans)(?![\p{L}\p{N}])/iu,
  },
];

/** Metinde geçen bahis terimleri (boşsa temiz). */
export function findGamblingTerms(text: string): string[] {
  return GAMBLING_TERM_PATTERNS.filter(({ re }) => re.test(text)).map(({ term }) => term);
}

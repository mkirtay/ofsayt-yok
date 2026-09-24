/**
 * Oyuncu maç reytingi (Sportmonks `RATING` 118, 0–10, iki ondalık) renk skalası — TEK KAYNAK.
 * Web ve mobil aynı eşikleri kullanır; renkler `src/styles/_tokens.scss` içindeki `--rating-*` tokenlarından.
 *
 *   ≥ 8.0      excellent  koyu yeşil
 *   7.0 – 7.99 good       yeşil
 *   6.5 – 6.99 fair       sarı-yeşil
 *   6.0 – 6.49 poor       turuncu
 *   < 6.0      bad        kırmızı
 *   yok/null   none       nötr gri
 *
 * Ekranda tek ondalığa YUVARLANMIŞ değer gösterilir (SofaScore/FotMob ile aynı sayılar: 7.68 → "7.7") ve renk de bu
 * yuvarlanmış değerden hesaplanır (5.99 → "6.0" turuncu) — görünen sayı ile renk her zaman aynı bandı söyler.
 * Ortalamalar (sezon, grafik) da aynı kural: tek ondalık, yuvarlanmış.
 */
export type RatingTone = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'none';

/** Azalan alt sınırlar; ilk eşleşen bant. `bad` alt sınırı yok. */
export const RATING_BANDS: ReadonlyArray<{ tone: Exclude<RatingTone, 'none'>; min: number }> = [
  { tone: 'excellent', min: 8.0 },
  { tone: 'good', min: 7.0 },
  { tone: 'fair', min: 6.5 },
  { tone: 'poor', min: 6.0 },
  { tone: 'bad', min: Number.NEGATIVE_INFINITY },
];

/** Geçerli reyting mi (sayı, sonlu, > 0 — Sportmonks eksik veride 0 gönderebiliyor). */
export function isValidRating(rating: unknown): rating is number {
  return typeof rating === 'number' && Number.isFinite(rating) && rating > 0;
}

/**
 * Tek ondalığa yuvarlanmış sayı. Önce yüzdeliğe yuvarlanır (API iki ondalık verir; `5.95 * 10 = 59.4999…` gibi float
 * hatası "5.9" yazmasın), sonra ondalığa.
 */
export function roundRating(rating: number): number {
  return Math.round(Math.round(rating * 100) / 10) / 10;
}

/** Bant, ekranda görünen (yuvarlanmış) değerden: 5.99 → 6.0 → poor. */
export function ratingTone(rating: number | null | undefined): RatingTone {
  if (!isValidRating(rating)) return 'none';
  const shown = roundRating(rating);
  return RATING_BANDS.find((b) => shown >= b.min)!.tone;
}

/** Tek ondalık, yuvarlanmış ("7.68" → "7.7"); geçersizse `null`. */
export function formatRating(rating: number | null | undefined): string | null {
  if (!isValidRating(rating)) return null;
  return roundRating(rating).toFixed(1);
}

/** CSS değişkenleri — zemin + üstündeki metin (kontrast tokenlarda belgeli). */
export const RATING_TONE_VARS: Record<RatingTone, { bg: string; fg: string }> = {
  excellent: { bg: 'var(--rating-excellent)', fg: 'var(--on-rating-excellent)' },
  good: { bg: 'var(--rating-good)', fg: 'var(--on-rating-good)' },
  fair: { bg: 'var(--rating-fair)', fg: 'var(--on-rating-fair)' },
  poor: { bg: 'var(--rating-poor)', fg: 'var(--on-rating-poor)' },
  bad: { bg: 'var(--rating-bad)', fg: 'var(--on-rating-bad)' },
  none: { bg: 'var(--rating-none)', fg: 'var(--on-rating-none)' },
};

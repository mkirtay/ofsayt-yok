import { MAX_SERIES_SCORE } from './sim';

/**
 * Paylaşım bağlantısındaki skor (`/frikik?s=850`): yalnız olası bir skor (0–1250, 50'nin katı) kabul edilir → paylaşım
 * görseli adres uzayı 26 değerle sınırlı (önbellek kırılamaz). Doğrulanmış skor DEĞİL (bağlantıyı herkes yazabilir);
 * sıralama skorları ayrıca sunucuda hesaplanır.
 */
export function parseShareScore(raw: unknown): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !/^\d{1,4}$/.test(v)) return null;
  const n = Number(v);
  return n <= MAX_SERIES_SCORE && n % 50 === 0 ? n : null;
}

export function sharePath(score: number): string {
  return `/frikik?s=${score}`;
}

export function shareImagePath(score: number | null): string {
  return score == null ? '/api/og/frikik' : `/api/og/frikik?s=${score}`;
}

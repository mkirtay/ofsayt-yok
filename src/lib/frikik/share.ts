import { MAX_SERIES_SCORE, levelPoints, POINTS } from './sim';

/** Paylaşılan sonuç: seri (`level` null, 0–1250) ya da seviye koşusu (`level` ≥ 1, puan 25'in katı). */
export type ShareInfo = { score: number; level: number | null };

export const MAX_SHARE_LEVEL = 999;

/** Seviye koşusunda `level`. seviyeye ulaşınca en çok kazanılabilecek puan (her seviyede 250 × çarpan). */
export function maxLevelTotal(level: number): number {
  let n = 0;
  for (let k = 1; k <= level; k++) n += levelPoints(POINTS.goal + POINTS.viaPost + POINTS.corner, k);
  return n;
}

const int = (raw: unknown, max: number): number | null => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (typeof v !== 'string' || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n <= max ? n : null;
};

/**
 * Paylaşım bağlantısındaki skor (`/frikik?s=850`): yalnız olası bir skor (0–1250, 50'nin katı) kabul edilir → paylaşım
 * görseli adres uzayı 26 değerle sınırlı (önbellek kırılamaz). Doğrulanmış skor DEĞİL (bağlantıyı herkes yazabilir);
 * sıralama skorları ayrıca sunucuda hesaplanır.
 */
export function parseShareScore(raw: unknown): number | null {
  const n = int(raw, MAX_SERIES_SCORE);
  return n != null && n % 50 === 0 ? n : null;
}

/**
 * `?l=<seviye>&s=<puan>` (seviye modu) ya da `?s=<puan>` (seri). Seviye 1–999; puan 25'in katı ve o seviyeye kadar
 * kazanılabilecek en çok puanı aşmaz (adres uzayı sınırlı kalır).
 */
export function parseShare(query: { l?: unknown; s?: unknown }): ShareInfo | null {
  if (query.l == null) {
    const score = parseShareScore(query.s);
    return score == null ? null : { score, level: null };
  }
  const level = int(query.l, MAX_SHARE_LEVEL);
  const score = int(query.s, 1_000_000);
  if (level == null || level < 1 || score == null || score % 25 !== 0 || score > maxLevelTotal(level)) return null;
  return { score, level };
}

export function sharePath(score: number, level: number | null = null): string {
  return level == null ? `/frikik?s=${score}` : `/frikik?l=${level}&s=${score}`;
}

export function shareImagePath(info: ShareInfo | null): string {
  if (!info) return '/api/og/frikik';
  return info.level == null ? `/api/og/frikik?s=${info.score}` : `/api/og/frikik?l=${info.level}&s=${info.score}`;
}

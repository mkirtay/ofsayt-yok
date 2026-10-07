import { levelPoints, POINTS } from './sim';

/** Paylaşılan sonuç: seviye koşusu (ulaşılan seviye + toplam puan, 25'in katı). */
export type ShareInfo = { score: number; level: number };

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
 * `?l=<seviye>&s=<puan>` paylaşım bağlantısı. Seviye 1–999; puan 25'in katı ve o seviyeye kadar kazanılabilecek en
 * çok puanı aşmaz (paylaşım görseli adres uzayı sınırlı kalır: önbellek kırılamaz). Doğrulanmış skor DEĞİL (bağlantıyı
 * herkes yazabilir); sıralama skorları ayrıca sunucuda hesaplanır. Eski `?s=` (kaldırılan 5 vuruş modu) bağlantıları
 * sessizce yok sayılır.
 */
export function parseShare(query: { l?: unknown; s?: unknown }): ShareInfo | null {
  const level = int(query.l, MAX_SHARE_LEVEL);
  const score = int(query.s, 1_000_000);
  if (level == null || level < 1 || score == null || score % 25 !== 0 || score > maxLevelTotal(level)) return null;
  return { score, level };
}

export function sharePath(level: number, score: number): string {
  return `/frikik?l=${level}&s=${score}`;
}

export function shareImagePath(info: ShareInfo | null): string {
  return info ? `/api/og/frikik?l=${info.level}&s=${info.score}` : '/api/og/frikik';
}

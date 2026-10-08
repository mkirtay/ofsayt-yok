/**
 * Gerçek cihaz testi için koşu dışa aktarımı: cihazın kendi simülasyon sonuçları (vuruş türü / puan) + sunucuya giden
 * girdiler. `scripts/frikik-cross-engine/verify.mts` Node'da yeniden oynatıp karşılaştırır. Kişisel veri yok
 * (yalnız tarayıcı UA dizesi, cihaz/motor tespiti için).
 */
import { levelPoints, type ShotInput, type ShotResult } from './sim';

export type ExportedRun = {
  day: string;
  seed: number;
  simVersion: number;
  ua: string;
  shots: ShotInput[];
  results: { level: number; kind: ShotResult['kind']; points: number; viaPost: boolean; corner: boolean }[];
  level: number;
  total: number;
};

export function buildExportedRun(
  day: string,
  seed: number,
  simVersion: number,
  shots: ShotInput[],
  results: ShotResult[],
  level: number,
  total: number,
  ua: string,
): ExportedRun {
  // Seviye: her gol sonrası +1 (scoreLevelRun ile aynı sayım).
  let lvl = 1;
  const out = results.map((r) => {
    const row = { level: lvl, kind: r.kind, points: levelPoints(r.points, lvl), viaPost: r.viaPost, corner: r.corner };
    if (r.kind === 'goal') lvl++;
    return row;
  });
  return { day, seed, simVersion, ua, shots, results: out, level, total };
}

/** `?debug=1` ya da localStorage `oy_frikik_debug=1` → bitiş kartında "Koşuyu kopyala". */
export function debugExportEnabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('debug') === '1') return true;
    return localStorage.getItem('oy_frikik_debug') === '1';
  } catch {
    return false;
  }
}

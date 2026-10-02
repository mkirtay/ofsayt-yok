/**
 * Sürüklenebilir Kural Köşesi düğmesinin konum mantığı (DOM'dan bağımsız, birim testli).
 *
 * - Sürüklerken iki eksende serbest; bırakınca x en yakın kenara (sol / sağ) yapışır — hızlı yatay fırlatmada
 *   fırlatma yönü kazanır. Hareket `transform: translate` ile. Kenar boşlukları simetrik (CSS'teki sağ boşluk).
 * - y sınırları: alt sınır düğmenin CSS'teki varsayılan yeri (mobilde alt menünün üstü, masaüstünde ekran altı
 *   − 24 px); üst sınır header + yapışık üst alan + 8 px.
 * - Konum `{ side, y }` (y = ekran yüksekliğine oran) olarak saklanır; eski kayıt (düz oran) "right" sayılır.
 *   Döndürme / yeniden boyutlandırmada taraf korunur, y sınır içinde kalır.
 * - 6 px altı hareket dokunuştur (panel açılır), üstü sürüklemedir (panel açılmaz).
 */

/** launcher.module.scss'teki düğme boyutu. */
export const LAUNCHER_SIZE_PX = 56;
export const DRAG_THRESHOLD_PX = 6;
export const KEY_STEP_PX = 24;
export const TOP_GAP_PX = 8;
export const POSITION_KEY = 'oy_kural_kosesi_y';
/** Baloncuğun düğmenin üst/alt kenarına göre içeri payı (CSS'teki varsayılanla aynı: 22 − 16 = 6 px). */
export const BUBBLE_INSET_PX = 6;

/** Bu hızın (px/ms) üstündeki yatay fırlatmada yön, bırakılan yerden önce gelir. */
export const FLING_VELOCITY_PX_PER_MS = 0.5;
/** Fırlatma hızı bırakmadan önceki bu kadar ms'lik harekete göre ölçülür. */
export const FLING_WINDOW_MS = 80;

export type LauncherSide = 'left' | 'right';

export type LauncherBounds = {
  /** Düğmenin CSS'teki varsayılan üst kenarı (transform'suz) — aynı zamanda alt sınır. */
  defaultTop: number;
  /** En yukarı: header altı + boşluk. */
  minTop: number;
  viewportHeight: number;
  /** Yatay: CSS'teki varsayılan (sağ kenar) sol kenarı, görünüm genişliği, düğme boyu. Opsiyonel — eski çağıranlar
   * ve testler yalnız dikeyi verir. */
  defaultLeft?: number;
  viewportWidth?: number;
  size?: number;
};

/** Sağ kenar boşluğu (CSS) — sol kenarda da aynısı kullanılır (simetrik). */
export function sideMargin(bounds: LauncherBounds): number {
  const { defaultLeft = 0, viewportWidth = 0, size = LAUNCHER_SIZE_PX } = bounds;
  return Math.max(0, viewportWidth - defaultLeft - size);
}

/** Taraf → varsayılan (sağ) yere göre yatay kayma (`translateX`). Sağ: 0, sol: simetrik boşlukla sol kenar. */
export function offsetXForSide(side: LauncherSide, bounds: LauncherBounds): number {
  if (side === 'right' || bounds.defaultLeft === undefined) return 0;
  return sideMargin(bounds) - bounds.defaultLeft;
}

/** Sürüklerken yatay kayma: düğme ekrandan taşmaz (kenar boşluklarının içinde). */
export function clampOffsetX(offsetX: number, bounds: LauncherBounds): number {
  if (bounds.defaultLeft === undefined) return 0;
  return Math.min(0, Math.max(offsetXForSide('left', bounds), offsetX));
}

/**
 * Bırakınca hangi kenar: hızlı yatay fırlatmada fırlatma yönü, değilse düğme merkezinin ekranın hangi yarısında
 * olduğu.
 */
export function snapSide(centerX: number, viewportWidth: number, velocityX = 0): LauncherSide {
  if (Math.abs(velocityX) >= FLING_VELOCITY_PX_PER_MS) return velocityX < 0 ? 'left' : 'right';
  return centerX < viewportWidth / 2 ? 'left' : 'right';
}

export type PointerSample = { t: number; x: number };

/** Son `FLING_WINDOW_MS` içindeki yatay hız (px/ms); yeterli örnek yoksa 0. */
export function releaseVelocityX(samples: PointerSample[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i];
    if (last.t - samples[i].t >= FLING_WINDOW_MS) break;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** ← / → → taraf; diğer tuşlar null. */
export function keySide(key: string): LauncherSide | null {
  if (key === 'ArrowLeft') return 'left';
  if (key === 'ArrowRight') return 'right';
  return null;
}

/** Hedef üst kenarı sınırlar içine alır. Ekran çok kısaysa (min > varsayılan) varsayılan yerde kalır. */
export function clampTop(top: number, bounds: LauncherBounds): number {
  if (bounds.minTop >= bounds.defaultTop) return bounds.defaultTop;
  return Math.min(bounds.defaultTop, Math.max(bounds.minTop, top));
}

/** Hedef üst kenar → varsayılan yere göre kayma (`translateY`, ≤ 0). */
export function offsetForTop(top: number, bounds: LauncherBounds): number {
  return clampTop(top, bounds) - bounds.defaultTop;
}

export function isDragMovement(dy: number, dx = 0): boolean {
  return Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
}

/** ↑ / ↓ → px adımı; diğer tuşlar null. */
export function keyStep(key: string): number | null {
  if (key === 'ArrowUp') return -KEY_STEP_PX;
  if (key === 'ArrowDown') return KEY_STEP_PX;
  return null;
}

export type SavedLauncherPosition = { side: LauncherSide; ratio: number };

const validRatio = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;

/**
 * Kayıtlı konum ya da null (depolama yok / bozuk → varsayılan sağ alt). Biçimler: `{"side":"left","y":0.45}`
 * ya da eski düz oran `"0.4581"` (taraf yok → "right").
 */
export function readSavedPosition(storage: Storage | null): SavedLauncherPosition | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(POSITION_KEY);
    if (raw === null) return null;
    const legacy = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(legacy)) return validRatio(legacy) ? { side: 'right', ratio: legacy } : null;
    const parsed = JSON.parse(raw) as { side?: unknown; y?: unknown };
    if (!validRatio(parsed?.y)) return null;
    return { side: parsed.side === 'left' ? 'left' : 'right', ratio: parsed.y };
  } catch {
    return null;
  }
}

/** Kayıtlı oran (0–1) ya da null — `readSavedPosition`'ın dikey kısmı. */
export function readSavedRatio(storage: Storage | null): number | null {
  return readSavedPosition(storage)?.ratio ?? null;
}

export function savePosition(storage: Storage | null, side: LauncherSide, top: number, viewportHeight: number): void {
  if (!storage || viewportHeight <= 0) return;
  try {
    storage.setItem(POSITION_KEY, JSON.stringify({ side, y: Number((top / viewportHeight).toFixed(4)) }));
  } catch {
    // Kota / gizli mod: konum yalnız bu ziyarette kalır.
  }
}

/** Oran → bu ekrandaki kayma; oran yoksa varsayılan yer (0). */
export function offsetFromRatio(ratio: number | null, bounds: LauncherBounds): number {
  if (ratio === null) return 0;
  return offsetForTop(ratio * bounds.viewportHeight, bounds);
}

export type BubblePosition = { top: number; bottom?: undefined } | { bottom: number; top?: undefined };

/**
 * Baloncuk düğmenin solunda, düğmeyle birlikte hareket eder. Düğme ekranın üst yarısındaysa üst kenarlar hizalı
 * (aşağı doğru açılır), alt yarısındaysa alt kenarlar hizalı (yukarı açılır). Ekran dışına taşmaz.
 */
export function bubblePosition(top: number, size: number, viewportHeight: number): BubblePosition {
  if (top + size / 2 < viewportHeight / 2) {
    return { top: Math.max(BUBBLE_INSET_PX, top + BUBBLE_INSET_PX) };
  }
  return { bottom: Math.max(BUBBLE_INSET_PX, viewportHeight - (top + size) + BUBBLE_INSET_PX) };
}

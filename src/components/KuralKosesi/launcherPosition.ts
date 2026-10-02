/**
 * Sürüklenebilir Kural Köşesi düğmesinin konum mantığı (DOM'dan bağımsız, birim testli).
 *
 * - Yalnız dikey: x sağ kenarda sabit, `translateY` ile kayar. Alt sınır düğmenin CSS'teki varsayılan yeri
 *   (mobilde alt menünün üstü, masaüstünde ekran altı − 24 px); üst sınır header'ın altı + 8 px.
 * - Konum, ekran yüksekliğine ORAN olarak saklanır; döndürme / yeniden boyutlandırmada sınırlar içinde kalır.
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

export type LauncherBounds = {
  /** Düğmenin CSS'teki varsayılan üst kenarı (transform'suz) — aynı zamanda alt sınır. */
  defaultTop: number;
  /** En yukarı: header altı + boşluk. */
  minTop: number;
  viewportHeight: number;
};

/** Hedef üst kenarı sınırlar içine alır. Ekran çok kısaysa (min > varsayılan) varsayılan yerde kalır. */
export function clampTop(top: number, bounds: LauncherBounds): number {
  if (bounds.minTop >= bounds.defaultTop) return bounds.defaultTop;
  return Math.min(bounds.defaultTop, Math.max(bounds.minTop, top));
}

/** Hedef üst kenar → varsayılan yere göre kayma (`translateY`, ≤ 0). */
export function offsetForTop(top: number, bounds: LauncherBounds): number {
  return clampTop(top, bounds) - bounds.defaultTop;
}

export function isDragMovement(dy: number): boolean {
  return Math.abs(dy) >= DRAG_THRESHOLD_PX;
}

/** ↑ / ↓ → px adımı; diğer tuşlar null. */
export function keyStep(key: string): number | null {
  if (key === 'ArrowUp') return -KEY_STEP_PX;
  if (key === 'ArrowDown') return KEY_STEP_PX;
  return null;
}

/** Kayıtlı oran (0–1) ya da null — depolama yoksa / bozuksa varsayılan yer. */
export function readSavedRatio(storage: Storage | null): number | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(POSITION_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
  } catch {
    return null;
  }
}

export function saveRatio(storage: Storage | null, top: number, viewportHeight: number): void {
  if (!storage || viewportHeight <= 0) return;
  try {
    storage.setItem(POSITION_KEY, (top / viewportHeight).toFixed(4));
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

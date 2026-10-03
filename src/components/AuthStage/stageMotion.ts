/**
 * Sahne topunun hareketi — DOM / three.js'ten bağımsız (birim testli). Kütüphane yok.
 *
 * - Dönüş: sürüklerken işaretçiyle döner; bırakınca açısal hız ataletle sürer, yavaşça boştaki hafif dönüşe iner.
 * - Fırlatma: hızlı bırakılırsa top düzlemde (z = 0) uçar, sahne kenarlarından seker, sürtünmeyle yavaşlar ve zayıf
 *   bir yayla merkeze geri gelir.
 * Birimler: konum / hız dünya birimi (top yarıçapı 1), açısal hız rad/sn (x: yatay eksen, y: dikey eksen çevresinde).
 */

export type Vec2 = { x: number; y: number };
export type BallMotion = {
  pos: Vec2;
  vel: Vec2;
  /** x: ekran yatay ekseni çevresinde (yukarı / aşağı yuvarlanma), y: dikey eksen çevresinde (sağa / sola). */
  spin: Vec2;
};
export type Bounds = { halfW: number; halfH: number };

/** Boştaki dönüş (rad/sn, dikey eksen çevresinde). */
export const IDLE_SPIN = 0.35;
/** Açısal hızın boştaki dönüşe yaklaşma hızı (1/sn). */
export const SPIN_DAMPING = 1.1;
/** Doğrusal sürtünme (1/sn) ve merkeze çeken yay (1/sn²). */
export const LINEAR_DAMPING = 1.3;
export const SPRING = 2.2;
export const RESTITUTION = 0.72;
/** Bu hızdan (px/sn) hızlı bırakılan top fırlatılır; daha yavaşı yalnız döner. */
export const THROW_PX_PER_SEC = 900;
export const MAX_SPIN = 14;
export const MAX_THROW_SPEED = 14;
/** Sürüklerken piksel başına dönüş (rad). */
export const DRAG_RAD_PER_PX = 0.012;
export const RELEASE_WINDOW_MS = 90;
const MAX_DT = 1 / 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function restingMotion(): BallMotion {
  return { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, spin: { x: 0, y: IDLE_SPIN } };
}

/**
 * Bir adım (sürüklenmiyorken). Fırlatılan top kenardan seker; yay + sürtünme onu kritik altı sönümle merkeze getirir.
 * @param ballRadius top yarıçapı (kenara çarpma için)
 */
export function stepMotion(m: BallMotion, dtSec: number, bounds: Bounds, ballRadius = 1): BallMotion {
  const dt = clamp(dtSec, 0, MAX_DT);
  const lin = Math.exp(-LINEAR_DAMPING * dt);
  let vx = (m.vel.x - SPRING * m.pos.x * dt) * lin;
  let vy = (m.vel.y - SPRING * m.pos.y * dt) * lin;
  let x = m.pos.x + vx * dt;
  let y = m.pos.y + vy * dt;
  const maxX = Math.max(0, bounds.halfW - ballRadius);
  const maxY = Math.max(0, bounds.halfH - ballRadius);
  if (x > maxX) [x, vx] = [maxX, -Math.abs(vx) * RESTITUTION];
  if (x < -maxX) [x, vx] = [-maxX, Math.abs(vx) * RESTITUTION];
  if (y > maxY) [y, vy] = [maxY, -Math.abs(vy) * RESTITUTION];
  if (y < -maxY) [y, vy] = [-maxY, Math.abs(vy) * RESTITUTION];
  // Neredeyse durduysa tam merkeze otur (sonsuz küçük titreşim olmasın).
  if (Math.hypot(x, y) < 1e-3 && Math.hypot(vx, vy) < 1e-2) [x, y, vx, vy] = [0, 0, 0, 0];

  // Açısal hız boştaki dönüşe üstel yaklaşır.
  const k = 1 - Math.exp(-SPIN_DAMPING * dt);
  const spin = { x: m.spin.x + (0 - m.spin.x) * k, y: m.spin.y + (IDLE_SPIN - m.spin.y) * k };
  return { pos: { x, y }, vel: { x: vx, y: vy }, spin };
}

export type PointerSample = { t: number; x: number; y: number };

/** Son `RELEASE_WINDOW_MS` içindeki işaretçi hızı (px/sn); yeterli örnek yoksa 0. */
export function pointerVelocity(samples: PointerSample[]): Vec2 {
  if (samples.length < 2) return { x: 0, y: 0 };
  const last = samples[samples.length - 1]!;
  let first = samples[0]!;
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i]!;
    if (last.t - first.t >= RELEASE_WINDOW_MS) break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

/**
 * Bırakma: açısal hız işaretçi hızından (ekran x → dikey eksen, ekran y → yatay eksen); hızlıysa fırlatma hızı da.
 * @param worldPerPx z = 0 düzleminde bir pikselin dünya birimi
 */
export function releaseMotion(m: BallMotion, pointerPxPerSec: Vec2, worldPerPx: number): BallMotion {
  const spin = {
    x: clamp(pointerPxPerSec.y * DRAG_RAD_PER_PX, -MAX_SPIN, MAX_SPIN),
    y: clamp(pointerPxPerSec.x * DRAG_RAD_PER_PX, -MAX_SPIN, MAX_SPIN),
  };
  const speedPx = Math.hypot(pointerPxPerSec.x, pointerPxPerSec.y);
  if (speedPx < THROW_PX_PER_SEC) return { ...m, spin };
  let vx = pointerPxPerSec.x * worldPerPx;
  let vy = -pointerPxPerSec.y * worldPerPx; // ekran y aşağı, dünya y yukarı
  const s = Math.hypot(vx, vy);
  if (s > MAX_THROW_SPEED) [vx, vy] = [(vx / s) * MAX_THROW_SPEED, (vy / s) * MAX_THROW_SPEED];
  return { ...m, vel: { x: vx, y: vy }, spin };
}

/** Sürükleme sırasında piksel farkından dönüş açıları (rad). */
export function dragRotation(dxPx: number, dyPx: number): Vec2 {
  return { x: dyPx * DRAG_RAD_PER_PX, y: dxPx * DRAG_RAD_PER_PX };
}

/** Paralaks: imlecin sahnedeki konumu (-1..1) → kameranın hedef kayması (dünya birimi). Dışarıdaysa 0. */
export function parallaxTarget(nx: number | null, ny: number | null, strength: number): Vec2 {
  if (nx == null || ny == null) return { x: 0, y: 0 };
  return { x: clamp(nx, -1, 1) * strength, y: clamp(-ny, -1, 1) * strength * 0.6 };
}

/** Kameranın hedefe üstel yaklaşması (kare hızından bağımsız). */
export function approach(current: number, target: number, rate: number, dtSec: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * clamp(dtSec, 0, MAX_DT)));
}

/** Perspektif kamerada z = 0 düzleminin yarı boyutları (dünya birimi). */
export function planeBounds(fovDeg: number, distance: number, aspect: number): Bounds {
  const halfH = Math.tan((fovDeg * Math.PI) / 360) * distance;
  return { halfW: halfH * aspect, halfH };
}

/**
 * Topa basılacak logolar: `pinned` her zaman (ör. Süper Lig), kalanlar havuzdan karışık (rand enjekte → testlenir).
 * Tekrar yok; havuz yetmezse olduğu kadar.
 */
export function pickLogoIds(pool: readonly number[], count: number, pinned: readonly number[], rand: () => number = Math.random): number[] {
  const out = pinned.filter((id) => pool.includes(id)).slice(0, count);
  const rest = pool.filter((id) => !out.includes(id));
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...out, ...rest].slice(0, Math.max(0, count));
}

/**
 * Sahne topunun 3B fiziği — DOM / three.js'ten bağımsız (birim testli). Kütüphane yok.
 *
 * Dünya: zemin (çim) y = 0 düzlemi; saha x ekseninde (kaleler x = ±lineX'te, ağızları merkeze dönük), z derinlik.
 * - Şut: topa basılı tut, geri çek, bırak — çekme vektörünün tersi yön, uzunluğu güç (üst sınırlı); yalnız duran /
 *   çok yavaş top şutlanır.
 * - Yer çekimi: şutlanan top yay çizer, çime düşüp azalan sekmelerle zıplar, sonra yuvarlanıp sürtünmeyle durur;
 *   yuvarlanırken hızına uygun döner (ω = v / r). Top durduğu yerde kalır (merkeze dönüş yalnız gol sonrası).
 * - Sınır: sahanın çevresindeki reklam panoları görünmez duvardır (üstünden de geçilmez, tavan var); top seker.
 * - Kaleler: direk ve üst direkten gerçekçi sekme; file duvarları (yanlar, arka, çatı) topu yumuşakça tutar / iter.
 *   Gol: top kale çizgisini direklerin arasından ve üst direğin altından TAMAMEN geçince.
 * Birimler: dünya birimi (top yarıçapı `BALL_RADIUS`), saniye.
 */

import {
  advanceBall,
  applyNetDrag,
  collideGoal,
  goalSpec,
  len2,
  len3,
  nextSpin,
  rollingSpin as coreRollingSpin,
  type Ball,
  type GoalSize,
  type GoalSpec,
  type StepEvent,
  type Tuning,
  type V3,
} from '@/lib/pitchPhysics/core';

export type { Ball, GoalSize, GoalSpec, StepEvent, V3 };

/** Arcade ölçek: top sahaya göre biraz büyük (masaüstünde ~65 px görünsün, logolar seçilsin). */
export const BALL_RADIUS = 0.62;
export const GRAVITY = 16;
/** Çimden sekmede dikey hızın korunan oranı ve yatay hızın korunan oranı. */
export const GROUND_RESTITUTION = 0.58;
export const BOUNCE_FRICTION = 0.86;
/** Bu dikey hızın altında top sekmez, yuvarlanır. */
export const MIN_BOUNCE_SPEED = 0.9;
/** Yuvarlanma direnci: sabit yavaşlama (birim/sn²) + hıza orantılı sönüm (1/sn). */
export const ROLL_DECEL = 1.1;
export const ROLL_DAMPING = 0.45;
export const AIR_DRAG = 0.12;
export const POST_RESTITUTION = 0.7;
/** File topu yutar: çok az seker, çarpmada diğer hız bileşenleri de söner. */
export const NET_RESTITUTION = 0.08;
const NET_DAMP = 0.5;
/** Kale içindeki topa file sürtünmesi (1/sn): sekip dışarı yuvarlanmasın. */
const NET_DRAG = 5;
/** Panolardan / tavandan sekmede hızın korunan oranı. */
export const BOARD_RESTITUTION = 0.6;
/** Görünmez tavan: havalanan top kadrajdan çıkmasın. */
export const CEILING = 2.6;
/** Şut: tam güç için çekme mesafesi (birim); bunun altındaki güç iptal sayılır; yatay hız ve yay aralığı. */
export const MAX_PULL = 2.6;
export const MIN_SHOT_POWER = 0.08;
export const SHOT_SPEED = { min: 4, max: 16 };
export const SHOT_LIFT = { min: 1.2, max: 4.2 };
/** Bu hızın altındaki (ve yerdeki) top şutlanabilir. */
export const SHOOTABLE_SPEED = 0.8;
/** Gol sonrası top filede bu kadar kalır, sonra orta noktaya döner (sn). */
export const GOAL_RESET_SEC = 1.5;
const MAX_DT = 1 / 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function restingBall(x = 0, z = 0, r = BALL_RADIUS): Ball {
  return { pos: { x, y: r, z }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
}

/** Yuvarlanan topun açısal hızı: eksen = yukarı × hız, büyüklük |v| / r. */
export function rollingSpin(vx: number, vz: number, r = BALL_RADIUS): V3 {
  return coreRollingSpin(vx, vz, r);
}

/** Ortak fizik çekirdeğinin (lib/pitchPhysics/core.ts) bu sahnedeki ayarları. */
const TUNING: Tuning = {
  gravity: GRAVITY,
  groundRestitution: GROUND_RESTITUTION,
  bounceFriction: BOUNCE_FRICTION,
  minBounceSpeed: MIN_BOUNCE_SPEED,
  rollDecel: ROLL_DECEL,
  rollDamping: ROLL_DAMPING,
  airDrag: AIR_DRAG,
  postRestitution: POST_RESTITUTION,
  netRestitution: NET_RESTITUTION,
  netDamp: NET_DAMP,
  netDrag: NET_DRAG,
};

// ── Kaleler ───────────────────────────────────────────────────────────────────────────────────────────

/** Arcade kale: ağız ~3,7 top çapı, yükseklik ~1,5 top çapı (orta noktadan orta güçte bir şutla ulaşılır). */
export const DEFAULT_GOAL: GoalSize = { lineX: 3.6, halfW: 2.3, height: 1.9, depth: 1.45, postR: 0.08 };

/** Panoların iç yüzleri (görünmez duvar): top bu dikdörtgenin içinde kalır. */
export type Walls = { minX: number; maxX: number; minZ: number; maxZ: number };
/** Kenar çizgileri (saha çizimi ve panolar). */
export const TOUCH_Z = 5.8;

export type Arena = { goals: GoalSpec[]; walls: Walls };

/**
 * Masaüstü: iki kale, panolar kalelerin arkasında ve kenar çizgilerinin dışında. Mobil (dar bant): tek kale (sağ),
 * sol pano orta çizginin gerisinde — oynanan alanın tamamı kadrajda kalır.
 */
export function arenaFor(lite: boolean, size: GoalSize = DEFAULT_GOAL): Arena {
  const goals = goalSpecs(lite ? [1] : [-1, 1], size);
  const back = size.lineX + size.depth + 0.3;
  return { goals, walls: { minX: lite ? -2.8 : -back, maxX: back, minZ: -(TOUCH_Z + 0.45), maxZ: TOUCH_Z + 0.45 } };
}

export function goalSpecs(sides: readonly (-1 | 1)[], size: GoalSize = DEFAULT_GOAL): GoalSpec[] {
  return sides.map((side) => goalSpec(side, size));
}

/**
 * Bir fizik adımı. Hızlı topta tünelleme olmasın diye adım alt adımlara bölünür.
 * @returns yeni top ve bu adımdaki olaylar (gol / direk / file)
 */
/** Pano duvarları ve tavan: içeri doğru seker. */
function collideWalls(pos: V3, vel: V3, w: Walls, r: number) {
  if (pos.x - r < w.minX) [pos.x, vel.x] = [w.minX + r, Math.abs(vel.x) * BOARD_RESTITUTION];
  if (pos.x + r > w.maxX) [pos.x, vel.x] = [w.maxX - r, -Math.abs(vel.x) * BOARD_RESTITUTION];
  if (pos.z - r < w.minZ) [pos.z, vel.z] = [w.minZ + r, Math.abs(vel.z) * BOARD_RESTITUTION];
  if (pos.z + r > w.maxZ) [pos.z, vel.z] = [w.maxZ - r, -Math.abs(vel.z) * BOARD_RESTITUTION];
  if (pos.y + r > CEILING) [pos.y, vel.y] = [CEILING - r, -Math.abs(vel.y) * BOARD_RESTITUTION];
}

export function stepBall(
  b: Ball,
  dtSec: number,
  goals: readonly GoalSpec[],
  r = BALL_RADIUS,
  walls: Walls | null = null,
): { ball: Ball; events: StepEvent[] } {
  const dt = clamp(dtSec, 0, MAX_DT);
  const events: StepEvent[] = [];
  const pos = { ...b.pos };
  const vel = { ...b.vel };
  let spin = { ...b.spin };
  const speed = len3(vel.x, vel.y, vel.z);
  const n = Math.min(8, Math.max(1, Math.ceil((speed * dt) / (r * 0.5))));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const prev = { ...pos };
    const bounced = advanceBall(pos, vel, h, r, TUNING);
    if (walls) collideWalls(pos, vel, walls, r);
    for (const g of goals) {
      collideGoal(prev, pos, vel, g, r, events, TUNING);
      applyNetDrag(pos, vel, g, h, TUNING);
    }
    // Direk / file sekmesi topu duvarın ya da tavanın ötesine itmesin.
    if (walls) collideWalls(pos, vel, walls, r);
    spin = nextSpin(spin, pos, vel, bounced, h, r);
  }
  return { ball: { pos, vel, spin }, events };
}

// ── Şut ───────────────────────────────────────────────────────────────────────────────────────────────

/** Yerde ve (neredeyse) duran top şutlanabilir. */
export function canShoot(b: Ball, r = BALL_RADIUS): boolean {
  return b.pos.y <= r + 0.05 && len3(b.vel.x, b.vel.y, b.vel.z) < SHOOTABLE_SPEED;
}

export type Shot = { dirX: number; dirZ: number; power: number; vel: V3 };

/**
 * Geri çekme → şut: yön çekmenin tersi, güç = çekme mesafesi / MAX_PULL (en çok 1). Güç `MIN_SHOT_POWER`'ın altındaysa
 * null (iptal). Güçlü şut daha hızlı ve biraz daha havadan gider.
 * @param pullX, pullZ işaretçinin zemindeki noktası − topun konumu
 */
export function shotFromPull(pullX: number, pullZ: number): Shot | null {
  const d = len2(pullX, pullZ);
  const power = Math.min(1, d / MAX_PULL);
  if (power < MIN_SHOT_POWER || d < 1e-9) return null;
  const dirX = -pullX / d;
  const dirZ = -pullZ / d;
  const speed = SHOT_SPEED.min + (SHOT_SPEED.max - SHOT_SPEED.min) * power;
  const lift = SHOT_LIFT.min + (SHOT_LIFT.max - SHOT_LIFT.min) * power;
  return { dirX, dirZ, power, vel: { x: dirX * speed, y: lift, z: dirZ * speed } };
}

/** Yükseklikle gölge: yükseldikçe büyür ve silikleşir. h = topun zeminden yüksekliği (alt noktası). */
export function shadowFor(h: number, r = BALL_RADIUS): { scale: number; opacity: number } {
  const k = Math.max(0, h);
  return { scale: r * 2.6 * (1 + k * 0.35), opacity: 0.55 / (1 + k * 0.9) };
}

// ── Görünüm yardımcıları ──────────────────────────────────────────────────────────────────────────────

/** Paralaks: imlecin sahnedeki konumu (-1..1) → kameranın hedef kayması (dünya birimi). Dışarıdaysa 0. */
export function parallaxTarget(nx: number | null, ny: number | null, strength: number): { x: number; y: number } {
  if (nx == null || ny == null) return { x: 0, y: 0 };
  return { x: clamp(nx, -1, 1) * strength, y: clamp(-ny, -1, 1) * strength * 0.6 };
}

/** Üstel yaklaşma (kare hızından bağımsız). */
export function approach(current: number, target: number, rate: number, dtSec: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * clamp(dtSec, 0, MAX_DT)));
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

/** Tema geçişi: 0 gece (koyu tema) … 1 gündüz (açık tema). */
export function mixColor(a: number, b: number, t: number): number {
  const u = clamp(t, 0, 1);
  const ch = (c: number, sh: number) => (c >> sh) & 0xff;
  const m = (sh: number) => Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * u);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export function mix(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

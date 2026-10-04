/**
 * Sahne topunun 3B fiziği — DOM / three.js'ten bağımsız (birim testli). Kütüphane yok.
 *
 * Dünya: zemin (çim) y = 0 düzlemi; saha x ekseninde (kaleler x = ±lineX'te, ağızları merkeze dönük), z derinlik.
 * - Yer çekimi: fırlatılan top yay çizer, çime düşüp azalan sekmelerle zıplar, sonra yuvarlanıp sürtünmeyle durur;
 *   yuvarlanırken hızına uygun döner (ω = v / r). Top durduğu yerde kalır (merkeze dönüş yalnız gol sonrası ya da
 *   uzun süre görünür alan dışında kalınca — o karar sahnede).
 * - Kaleler: direk ve üst direkten gerçekçi sekme; file duvarları (yanlar, arka, çatı) topu yumuşakça tutar / iter.
 *   Gol: top kale çizgisini direklerin arasından ve üst direğin altından TAMAMEN geçince.
 * Birimler: dünya birimi (top yarıçapı `BALL_RADIUS`), saniye.
 */

export type V3 = { x: number; y: number; z: number };
/** spin: açısal hız vektörü (eksen × rad/sn). */
export type Ball = { pos: V3; vel: V3; spin: V3 };

export const BALL_RADIUS = 0.36;
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
export const MAX_THROW_SPEED = 15;
/** Fırlatmada yatay hız başına yukarı hız (yay) ve üst sınırı; bu hızın altı "bırakma" (yay yok). */
export const LOFT = 0.26;
export const MAX_LOFT = 4.5;
export const DROP_SPEED = 1.5;
export const RELEASE_WINDOW_MS = 90;
/** Gol sonrası top filede bu kadar kalır; görünür alan dışında bu kadar kalan top ortaya döner (sn). */
export const GOAL_RESET_SEC = 1.5;
export const OFFSCREEN_RESET_SEC = 10;
const MAX_DT = 1 / 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function restingBall(x = 0, z = 0, r = BALL_RADIUS): Ball {
  return { pos: { x, y: r, z }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
}

/** Yuvarlanan topun açısal hızı: eksen = yukarı × hız, büyüklük |v| / r. */
export function rollingSpin(vx: number, vz: number, r = BALL_RADIUS): V3 {
  return { x: vz / r, y: 0, z: -vx / r };
}

// ── Kaleler ───────────────────────────────────────────────────────────────────────────────────────────

export type GoalSpec = {
  /** -1 sol (x < 0), 1 sağ */
  side: -1 | 1;
  /** Kale çizgisi (direklerin x'i) ve file arkası. */
  lineX: number;
  backX: number;
  /** Direkler z = ±halfW'de; üst direk `height`'ta, file arkası `backHeight`'a iner. */
  halfW: number;
  height: number;
  backHeight: number;
  postR: number;
};

export type GoalSize = { lineX: number; halfW: number; height: number; depth: number; postR: number };

/** Oyun için geniş kale: ağız ~6 top çapı, yükseklik ~2,4 top çapı (normal bir fırlatmayla ulaşılır). */
export const DEFAULT_GOAL: GoalSize = { lineX: 4.9, halfW: 2.2, height: 1.7, depth: 1.1, postR: 0.06 };

export function goalSpecs(sides: readonly (-1 | 1)[], size: GoalSize = DEFAULT_GOAL): GoalSpec[] {
  return sides.map((side) => ({
    side,
    lineX: side * size.lineX,
    backX: side * (size.lineX + size.depth),
    halfW: size.halfW,
    height: size.height,
    backHeight: size.height * 0.82,
    postR: size.postR,
  }));
}

export type StepEvent =
  | { type: 'goal'; side: -1 | 1 }
  | { type: 'post'; side: -1 | 1 }
  /** File içten çarpma (dalga için hız ve nokta). */
  | { type: 'net'; side: -1 | 1; speed: number; y: number; z: number };

/** Daire (2B) çarpışması: merkezden itip normal bileşeni yansıtır. Çarptıysa true. */
function bounceCircle(
  p: { a: number; b: number },
  v: { a: number; b: number },
  ca: number,
  cb: number,
  min: number,
  e: number,
): boolean {
  const da = p.a - ca;
  const db = p.b - cb;
  const d = Math.hypot(da, db);
  if (d >= min || d < 1e-9) return false;
  const na = da / d;
  const nb = db / d;
  const vn = v.a * na + v.b * nb;
  if (vn < 0) {
    v.a -= (1 + e) * vn * na;
    v.b -= (1 + e) * vn * nb;
  }
  p.a = ca + na * min;
  p.b = cb + nb * min;
  return true;
}

function collideGoal(prev: V3, pos: V3, vel: V3, g: GoalSpec, r: number, events: StepEvent[]) {
  const depth = Math.abs(g.backX - g.lineX);
  const minPost = r + g.postR;
  // Direkler (dikey silindir: xz düzleminde daire)
  if (pos.y - r < g.height) {
    for (const z0 of [-g.halfW, g.halfW]) {
      const p = { a: pos.x, b: pos.z };
      const v = { a: vel.x, b: vel.z };
      if (bounceCircle(p, v, g.lineX, z0, minPost, POST_RESTITUTION)) {
        [pos.x, pos.z, vel.x, vel.z] = [p.a, p.b, v.a, v.b];
        events.push({ type: 'post', side: g.side });
      }
    }
  }
  // Üst direk (z boyunca silindir: xy düzleminde daire)
  if (Math.abs(pos.z) <= g.halfW) {
    const p = { a: pos.x, b: pos.y };
    const v = { a: vel.x, b: vel.y };
    if (bounceCircle(p, v, g.lineX, g.height, minPost, POST_RESTITUTION)) {
      [pos.x, pos.y, vel.x, vel.y] = [p.a, p.b, v.a, v.b];
      events.push({ type: 'post', side: g.side });
    }
  }

  const outPrev = (prev.x - g.lineX) * g.side;
  const out = (pos.x - g.lineX) * g.side;
  const roofAt = (o: number) => g.height + (g.backHeight - g.height) * clamp(o / depth, 0, 1);

  // File arkası (x = backX)
  if (Math.abs(pos.z) < g.halfW && pos.y - r < g.backHeight) {
    const relPrev = (prev.x - g.backX) * g.side; // < 0: içeride
    const rel = (pos.x - g.backX) * g.side;
    if (relPrev <= 0 && rel > -r) {
      const speed = vel.x * g.side;
      pos.x = g.backX - g.side * r;
      vel.x = -g.side * Math.abs(vel.x) * NET_RESTITUTION;
      vel.y *= NET_DAMP;
      vel.z *= NET_DAMP;
      if (speed > 0.3) events.push({ type: 'net', side: g.side, speed, y: pos.y, z: pos.z });
    } else if (relPrev > 0 && rel < r) {
      pos.x = g.backX + g.side * r;
      vel.x = g.side * Math.abs(vel.x) * NET_RESTITUTION;
    }
  }
  // Yan fileler (z = ±halfW), kale çizgisi ile file arkası arasında
  if (out > 0 && out < depth + r && pos.y - r < roofAt(out)) {
    for (const zw of [-g.halfW, g.halfW]) {
      if (Math.abs(pos.z - zw) >= r) continue;
      const s = Math.sign(prev.z - zw) || -Math.sign(zw);
      const inside = Math.abs(prev.z) < g.halfW;
      if (inside) events.push({ type: 'net', side: g.side, speed: Math.abs(vel.z), y: pos.y, z: zw });
      pos.z = zw + s * r;
      vel.z = s * Math.abs(vel.z) * NET_RESTITUTION;
      if (inside) vel.x *= NET_DAMP;
    }
  }
  // Çatı (kale çizgisinden arkaya hafif inen)
  if (out > 0 && out < depth && Math.abs(pos.z) < g.halfW) {
    const roof = roofAt(out);
    if (Math.abs(pos.y - roof) < r) {
      const s = prev.y >= roofAt(outPrev) ? 1 : -1;
      pos.y = roof + s * r;
      vel.y = s * Math.abs(vel.y) * NET_RESTITUTION;
    }
  }
  // Gol: top çizgiyi tamamen geçti (merkez çizgiden r kadar içeride), direklerin arasında, üst direğin altında.
  if (outPrev <= r && out > r && Math.abs(pos.z) < g.halfW && pos.y < g.height) {
    events.push({ type: 'goal', side: g.side });
  }
}

/**
 * Bir fizik adımı. Hızlı topta tünelleme olmasın diye adım alt adımlara bölünür.
 * @returns yeni top ve bu adımdaki olaylar (gol / direk / file)
 */
export function stepBall(b: Ball, dtSec: number, goals: readonly GoalSpec[], r = BALL_RADIUS): { ball: Ball; events: StepEvent[] } {
  const dt = clamp(dtSec, 0, MAX_DT);
  const events: StepEvent[] = [];
  const pos = { ...b.pos };
  const vel = { ...b.vel };
  let spin = { ...b.spin };
  const speed = Math.hypot(vel.x, vel.y, vel.z);
  const n = Math.min(8, Math.max(1, Math.ceil((speed * dt) / (r * 0.5))));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const prev = { ...pos };
    const grounded = pos.y <= r + 1e-6 && Math.abs(vel.y) < 1e-6;
    if (grounded) {
      const s = Math.hypot(vel.x, vel.z);
      if (s > 0) {
        const ns = Math.max(0, s - (ROLL_DECEL + ROLL_DAMPING * s) * h);
        vel.x *= ns / s;
        vel.z *= ns / s;
      }
    } else {
      vel.y -= GRAVITY * h;
      const k = Math.exp(-AIR_DRAG * h);
      vel.x *= k;
      vel.y *= k;
      vel.z *= k;
    }
    pos.x += vel.x * h;
    pos.y += vel.y * h;
    pos.z += vel.z * h;
    let bounced = false;
    if (pos.y < r) {
      pos.y = r;
      if (-vel.y > MIN_BOUNCE_SPEED) {
        vel.y = -vel.y * GROUND_RESTITUTION;
        vel.x *= BOUNCE_FRICTION;
        vel.z *= BOUNCE_FRICTION;
        bounced = true;
      } else {
        vel.y = 0;
      }
    }
    for (const g of goals) {
      collideGoal(prev, pos, vel, g, r, events);
      if ((pos.x - g.lineX) * g.side > 0 && Math.abs(pos.z) < g.halfW && pos.y < g.height) {
        const k = Math.exp(-NET_DRAG * h);
        vel.x *= k;
        vel.z *= k;
      }
    }
    // Dönüş: yerdeyken tam yuvarlanma; havada yavaşça söner; sekmede yuvarlanmaya yaklaşır.
    const roll = rollingSpin(vel.x, vel.z, r);
    if (pos.y <= r + 1e-6 && vel.y === 0) spin = roll;
    else if (bounced) spin = { x: spin.x + (roll.x - spin.x) * 0.6, y: spin.y * 0.5, z: spin.z + (roll.z - spin.z) * 0.6 };
    else {
      const k = Math.exp(-0.3 * h);
      spin = { x: spin.x * k, y: spin.y * k, z: spin.z * k };
    }
  }
  return { ball: { pos, vel, spin }, events };
}

// ── Fırlatma ──────────────────────────────────────────────────────────────────────────────────────────

/** Sürüklerken topun zemindeki (x, z) konum örnekleri. */
export type DragSample = { t: number; x: number; z: number };

/**
 * Bırakma hızı: son `RELEASE_WINDOW_MS` içindeki hareketten (yön + güç). Hızlı bırakılan top yay çizer (yukarı hız
 * yatay hızla orantılı); yavaşı olduğu yere bırakılır.
 */
export function throwVelocity(samples: readonly DragSample[]): V3 {
  if (samples.length < 2) return { x: 0, y: 0, z: 0 };
  const last = samples[samples.length - 1]!;
  let first = samples[0]!;
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i]!;
    if (last.t - first.t >= RELEASE_WINDOW_MS) break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0, z: 0 };
  let vx = (last.x - first.x) / dt;
  let vz = (last.z - first.z) / dt;
  const s = Math.hypot(vx, vz);
  if (s < DROP_SPEED) return { x: 0, y: 0, z: 0 };
  if (s > MAX_THROW_SPEED) [vx, vz] = [(vx / s) * MAX_THROW_SPEED, (vz / s) * MAX_THROW_SPEED];
  return { x: vx, y: Math.min(MAX_LOFT, LOFT * Math.min(s, MAX_THROW_SPEED)), z: vz };
}

/** Görünür alan dışında geçen süre: görünürse sıfırlanır. */
export function offscreenTime(prev: number, visible: boolean, dtSec: number): number {
  return visible ? 0 : prev + Math.max(0, dtSec);
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

/**
 * Giriş / kayıt arka planındaki saha ve fırlatılabilir top — DOM'dan bağımsız geometri ve fizik (birim testli).
 *
 * - Saha kabı doldurur (kenarda pay); geniş kapta yatay (kaleler solda/sağda), dar kapta dikey (üstte/altta).
 *   Hesaplar "boy" (kaleden kaleye) / "en" eksenlerinde yapılır, çizimde yöne göre x/y'ye eşlenir.
 * - Top: sürtünmeyle yavaşlar, saha çizgilerinden seker; kale ağzından geçip kale çizgisini aşarsa gol.
 * Kütüphane yok; adım başına sabit süreli Euler (dt kırpılır), yalnız transform ile çizilir.
 */

export type Orientation = 'landscape' | 'portrait';

export type PitchGeometry = {
  width: number;
  height: number;
  orientation: Orientation;
  /** Saha dikdörtgeni (kenar çizgileri). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Kale ağzının yarı genişliği ve kale derinliği (çizginin dışında). */
  goalHalf: number;
  goalDepth: number;
  ballRadius: number;
};

export type Ball = { x: number; y: number; vx: number; vy: number };
/** 'start': yatayda sol / dikeyde üst kale; 'end': sağ / alt. */
export type GoalSide = 'start' | 'end';

/** Sürtünme katsayısı (1/sn): hız her saniye e^-k ile çarpılır. */
export const FRICTION_PER_SEC = 0.9;
/** Çizgiden sekmede hızın korunan oranı. */
export const RESTITUTION = 0.78;
/** Bu hızın (px/sn) altı durmuş sayılır. */
export const REST_SPEED = 6;
export const MAX_SPEED = 2600;
/** Bırakma hızı son bu kadar ms'lik harekete göre. */
export const RELEASE_WINDOW_MS = 90;
const MAX_DT = 1 / 30;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function pitchGeometry(width: number, height: number): PitchGeometry {
  const orientation: Orientation = width >= height ? 'landscape' : 'portrait';
  const margin = Math.max(18, Math.min(width, height) * 0.05);
  const x0 = margin;
  const y0 = margin;
  const x1 = Math.max(x0 + 1, width - margin);
  const y1 = Math.max(y0 + 1, height - margin);
  const across = orientation === 'landscape' ? y1 - y0 : x1 - x0;
  return {
    width,
    height,
    orientation,
    x0,
    y0,
    x1,
    y1,
    // Gerçek oran (7,32 / 68 ≈ %10,8) oynanamayacak kadar dar → geniş ağız.
    goalHalf: across * 0.12,
    goalDepth: Math.max(10, margin * 0.7),
    ballRadius: clamp(Math.min(width, height) * 0.022, 9, 14),
  };
}

export function pitchCenter(g: PitchGeometry): { x: number; y: number } {
  return { x: (g.x0 + g.x1) / 2, y: (g.y0 + g.y1) / 2 };
}

/** Kale ağzı içinde mi (en ekseninde, topun tamamı geçebilecek kadar). */
function inMouth(across: number, center: number, g: PitchGeometry): boolean {
  return Math.abs(across - center) <= g.goalHalf - g.ballRadius * 0.4;
}

/**
 * Bir fizik adımı. Kale çizgisini ağızdan aşan top gol olur (top olduğu yerde döner; çağıran ortaya alır).
 * @returns yeni top ve (varsa) gol tarafı
 */
export function stepBall(ball: Ball, dtSec: number, g: PitchGeometry): { ball: Ball; goal: GoalSide | null } {
  const dt = clamp(dtSec, 0, MAX_DT);
  const decay = Math.exp(-FRICTION_PER_SEC * dt);
  let { x, y, vx, vy } = ball;
  vx *= decay;
  vy *= decay;
  if (Math.hypot(vx, vy) < REST_SPEED) {
    vx = 0;
    vy = 0;
  }
  x += vx * dt;
  y += vy * dt;
  const r = g.ballRadius;
  const land = g.orientation === 'landscape';
  const cx = (g.x0 + g.x1) / 2;
  const cy = (g.y0 + g.y1) / 2;

  // Yan çizgiler (boy eksenine paralel): her zaman seker.
  if (land) {
    if (y - r < g.y0) [y, vy] = [g.y0 + r, Math.abs(vy) * RESTITUTION];
    if (y + r > g.y1) [y, vy] = [g.y1 - r, -Math.abs(vy) * RESTITUTION];
  } else {
    if (x - r < g.x0) [x, vx] = [g.x0 + r, Math.abs(vx) * RESTITUTION];
    if (x + r > g.x1) [x, vx] = [g.x1 - r, -Math.abs(vx) * RESTITUTION];
  }

  // Kale çizgileri: ağızdaysa geçer (merkez çizgiyi aşınca gol), değilse seker.
  const along = land ? x : y;
  const across = land ? y : x;
  const start = land ? g.x0 : g.y0;
  const end = land ? g.x1 : g.y1;
  const mouth = inMouth(across, land ? cy : cx, g);
  let goal: GoalSide | null = null;
  let a = along;
  let va = land ? vx : vy;
  if (mouth) {
    if (a < start) goal = 'start';
    else if (a > end) goal = 'end';
  } else {
    if (a - r < start) [a, va] = [start + r, Math.abs(va) * RESTITUTION];
    if (a + r > end) [a, va] = [end - r, -Math.abs(va) * RESTITUTION];
  }
  if (land) [x, vx] = [a, va];
  else [y, vy] = [a, va];
  return { ball: { x, y, vx, vy }, goal };
}

/** Sürüklenen topu saha içinde tutar (kale ağzına doğru da çizgiye kadar). */
export function clampToPitch(x: number, y: number, g: PitchGeometry): { x: number; y: number } {
  const r = g.ballRadius;
  return { x: clamp(x, g.x0 + r, g.x1 - r), y: clamp(y, g.y0 + r, g.y1 - r) };
}

export type PointerSample = { t: number; x: number; y: number };

/** Son `RELEASE_WINDOW_MS` içindeki hız (px/sn), `MAX_SPEED` ile sınırlı; yeterli örnek yoksa 0. */
export function releaseVelocity(samples: PointerSample[]): { vx: number; vy: number } {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const last = samples[samples.length - 1]!;
  let first = samples[0]!;
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i]!;
    if (last.t - first.t >= RELEASE_WINDOW_MS) break;
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  let vx = (last.x - first.x) / dt;
  let vy = (last.y - first.y) / dt;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) {
    vx = (vx / speed) * MAX_SPEED;
    vy = (vy / speed) * MAX_SPEED;
  }
  return { vx, vy };
}

/** Boştaki hafif kendi kendine hareket: rastgele yönde yavaş itiş (rand 0–1 enjekte edilir → testlenir). */
export function idleNudge(rand: () => number = Math.random): { vx: number; vy: number } {
  const angle = rand() * Math.PI * 2;
  const speed = 70 + rand() * 60;
  return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed };
}

export type PitchShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; goal?: true }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: boolean };

/**
 * Saha çizgileri (orta saha, orta yuvarlak, iki ceza ve kale alanı, penaltı noktaları, iki kale). Oranlar gerçek sahadan
 * (105 × 68 m) boy / en eksenlerine; orta yuvarlak elips olmasın diye kısa kenara göre.
 */
export function pitchShapes(g: PitchGeometry): PitchShape[] {
  const land = g.orientation === 'landscape';
  const L = land ? g.x1 - g.x0 : g.y1 - g.y0; // boy
  const W = land ? g.y1 - g.y0 : g.x1 - g.x0; // en
  const A0 = land ? g.x0 : g.y0;
  const C0 = land ? g.y0 : g.x0;
  // (boy, en) → (x, y)
  const P = (along: number, across: number) => (land ? { x: along, y: across } : { x: across, y: along });
  const rect = (a: number, c: number, la: number, wc: number): PitchShape => {
    const p = P(a, c);
    return land ? { kind: 'rect', x: p.x, y: p.y, w: la, h: wc } : { kind: 'rect', x: p.x, y: p.y, w: wc, h: la };
  };
  const midC = C0 + W / 2;
  const shapes: PitchShape[] = [rect(A0, C0, L, W)];
  const ml1 = P(A0 + L / 2, C0);
  const ml2 = P(A0 + L / 2, C0 + W);
  shapes.push({ kind: 'line', x1: ml1.x, y1: ml1.y, x2: ml2.x, y2: ml2.y });
  const center = P(A0 + L / 2, midC);
  shapes.push({ kind: 'circle', cx: center.x, cy: center.y, r: Math.min(L, W) * 0.14 });
  shapes.push({ kind: 'circle', cx: center.x, cy: center.y, r: 2.5, fill: true });
  const boxDepth = L * 0.157;
  const boxHalf = W * 0.296;
  const smallDepth = L * 0.052;
  const smallHalf = W * 0.135;
  const spot = L * 0.105;
  for (const end of [0, 1] as const) {
    const from = end === 0 ? A0 : A0 + L;
    const dir = end === 0 ? 1 : -1;
    shapes.push(rect(dir > 0 ? from : from - boxDepth, midC - boxHalf, boxDepth, boxHalf * 2));
    shapes.push(rect(dir > 0 ? from : from - smallDepth, midC - smallHalf, smallDepth, smallHalf * 2));
    const s = P(from + dir * spot, midC);
    shapes.push({ kind: 'circle', cx: s.x, cy: s.y, r: 2.5, fill: true });
    // Kale: çizginin dışında
    shapes.push({ ...rect(dir > 0 ? from - g.goalDepth : from, midC - g.goalHalf, g.goalDepth, g.goalHalf * 2), goal: true } as PitchShape);
  }
  return shapes;
}

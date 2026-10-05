/**
 * /frikik — serbest vuruş oyununun BELİRLENİMCİ simülasyonu. İstemci (animasyon) ve sunucu (skor doğrulama) AYNI kodu
 * çalıştırır: sunucu seriyi tohumdan (seed) üretir, istemciden yalnız vuruş girdilerini alır ve skoru kendisi hesaplar.
 *
 * Belirlenimcilik kuralları (bkz. sim.test.ts kaynak taraması):
 * - Sabit adım (TICK = 1/120 sn, adım başına 2 alt adım); kare hızından bağımsız.
 * - Yalnız + − × ÷, Math.sqrt ve tam sayı işlemleri; sin / cos / exp / pow / hypot / random YOK.
 * - Girdiler tam sayı (yön bileşenleri, güç, falso, bırakma tick'i) → istemci ve sunucu aynı sayılardan başlar.
 *
 * Dünya (metre ölçeğinde, top arcade boyutta): kale çizgisi x = 0, kale ağzı −x'e bakar, top x < 0'da; z yanal.
 * Ortak fizik: lib/pitchPhysics/core.ts (zemin, direk, file, gol tespiti).
 */
import {
  advanceBall,
  applyNetDrag,
  bounceCircle,
  collideGoal,
  decay,
  goalSpec,
  len2,
  nextSpin,
  type GoalSpec,
  type StepEvent,
  type Tuning,
  type V3,
} from '@/lib/pitchPhysics/core';

export const TICK = 1 / 120;
const SUBSTEPS = 2;
const H = TICK / SUBSTEPS;
/** Bir vuruş en çok bu kadar sürer (7 sn); bırakma tick'i en çok 10 dk. */
export const MAX_SHOT_TICKS = 840;
export const MAX_RELEASE_TICK = 72_000;
export const SHOTS_PER_SERIES = 5;

export const BALL_R = 0.22;
export const GOAL: GoalSpec = goalSpec(1, { lineX: 0, halfW: 3.66, height: 2.44, depth: 2, postR: 0.06 });

const TUNING: Tuning = {
  gravity: 14,
  groundRestitution: 0.55,
  bounceFriction: 0.8,
  minBounceSpeed: 1.2,
  rollDecel: 2.5,
  rollDamping: 0.6,
  airDrag: 0.05,
  postRestitution: 0.6,
  netRestitution: 0.08,
  netDamp: 0.5,
  netDrag: 5,
};

/** Baraj figürü ve kaleci (dikey silindir). */
export const FIGURE = { r: 0.26, height: 1.75, spacing: 0.56, restitution: 0.3 };
export const KEEPER = { r: 0.85, height: 2.08, x: -0.75, restitution: 0.25 };
export const WALL_DISTANCE = 9.15;
/** Şut: güç 0–1 → yatay hız (m/sn); dikey hız = LOFT × yatay. Falso: yanal ivme = falso × CURVE_K × hız. */
export const SHOT_SPEED = { min: 9, max: 30 };
export const LOFT = 0.34;
const CURVE_K = 0.45;
const CURVE_DECAY = 0.4;
/** "Doksan": top çizgiyi üst köşeden geçti (direğe ≤ 1,1 m, üst direğe ≤ 0,95 m). */
export const CORNER = { side: 1.1, top: 0.95 };
export const POINTS = { goal: 100, viaPost: 50, corner: 100 };
export const MAX_SERIES_SCORE = SHOTS_PER_SERIES * (POINTS.goal + POINTS.viaPost + POINTS.corner);

// ── Tohumlu tur üretimi ───────────────────────────────────────────────────────────────────────────────

/** mulberry32: 32 bit tam sayı işlemleri → her motorda aynı dizi. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Round = {
  /** Topun konumu (zeminde). */
  ball: { x: number; z: number };
  /** Baraj figürlerinin merkezleri. */
  wall: { x: number; z: number }[];
  /** Kaleci: kale çizgisinin önünde z ekseninde üçgen dalgayla gidip gelir. */
  keeper: { amp: number; period: number; phase: number };
};

/** Serinin `index`. turu (0 tabanlı). Mesafe 16–24 m, açı sınırlı; 3–5 kişilik baraj yakın direği kapatır. */
export function makeRound(seed: number, index: number): Round {
  const r = rng((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const dist = 16 + Math.floor(r() * 17) * 0.5;
  const k = Math.floor((dist * 0.45) / 0.5);
  const z = (Math.floor(r() * (2 * k + 1)) - k) * 0.5;
  const ball = { x: -dist, z };
  const count = 3 + Math.floor(r() * 3);
  const sideRand = r();
  const side = z > 0 ? 1 : z < 0 ? -1 : sideRand < 0.5 ? -1 : 1;
  const targetZ = side * GOAL.halfW * (0.15 + 0.5 * r());
  // Baraj: top → hedef doğrultusunda 9,15 m, doğrultuya dik sıra.
  const dx = -ball.x;
  const dz = targetZ - ball.z;
  const d = len2(dx, dz);
  const fx = dx / d;
  const fz = dz / d;
  const cx = ball.x + fx * WALL_DISTANCE;
  const cz = ball.z + fz * WALL_DISTANCE;
  const wall: Round['wall'] = [];
  for (let i = 0; i < count; i++) {
    const o = (i - (count - 1) / 2) * FIGURE.spacing;
    wall.push({ x: cx - fz * o, z: cz + fx * o });
  }
  const amp = 1.2 + r() * 1.4;
  const period = 230 + Math.floor(r() * 200);
  const phase = Math.floor(r() * period);
  return { ball, wall, keeper: { amp, period, phase } };
}

/** Kalecinin `tick` anındaki z'si (üçgen dalga, −amp…amp). */
export function keeperZ(round: Round, tick: number): number {
  const { amp, period, phase } = round.keeper;
  const u = ((tick + phase) % period) / period;
  return amp * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u);
}

/** Nişan tabanı: F = toptan kale ortasına birim vektör, R = F'nin sağı (kameranın arkasından bakınca ekran sağı). */
export function aimBasis(round: Round): { fx: number; fz: number; rx: number; rz: number } {
  const dx = -round.ball.x;
  const dz = -round.ball.z;
  const d = len2(dx, dz);
  const fx = dx / d;
  const fz = dz / d;
  return { fx, fz, rx: -fz, rz: fx };
}

// ── Vuruş girdisi ─────────────────────────────────────────────────────────────────────────────────────

/**
 * İstemciden gelen TEK şey. Hepsi tam sayı:
 * - `f`, `s`: nişan yönünün ileri (kaleye) ve sağa bileşenleri (oran önemli; f ≥ 1)
 * - `power` 0–1000, `curve` −1000…1000 (pozitif: sağa falso), `tick`: turun başından bırakma anına kadar geçen tick
 */
export type ShotInput = { f: number; s: number; power: number; curve: number; tick: number };

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Geçerli girdi ya da null (alan eksik / tam sayı değil / aralık dışı). */
export function parseShotInput(raw: unknown): ShotInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isInt(o.f, 1, 4000) || !isInt(o.s, -4000, 4000) || !isInt(o.power, 0, 1000) || !isInt(o.curve, -1000, 1000) || !isInt(o.tick, 0, MAX_RELEASE_TICK)) {
    return null;
  }
  return { f: o.f, s: o.s, power: o.power, curve: o.curve, tick: o.tick };
}

// ── Vuruş simülasyonu ─────────────────────────────────────────────────────────────────────────────────

export type ShotKind = 'goal' | 'saved' | 'wall' | 'post' | 'miss';
export type ShotResult = { kind: ShotKind; points: number; viaPost: boolean; corner: boolean };

export type ShotState = {
  round: Round;
  /** Bırakma anı (kaleci fazı) ve vuruştan beri geçen tick. */
  releaseTick: number;
  tick: number;
  pos: V3;
  vel: V3;
  spin: V3;
  curve: number;
  touchedWall: boolean;
  touchedKeeper: boolean;
  touchedPost: boolean;
  /** Karar verilince dolar; sonraki adımlar yalnız görsel (file, yuvarlanma) içindir, sonucu değiştirmez. */
  result: ShotResult | null;
  /** Son adımın olayları (istemci: file dalgası, ses yerine efekt). */
  events: StepEvent[];
};

export function startShot(round: Round, input: ShotInput): ShotState {
  const b = aimBasis(round);
  const ax = b.fx * input.f + b.rx * input.s;
  const az = b.fz * input.f + b.rz * input.s;
  const a = len2(ax, az);
  const p = input.power / 1000;
  const vh = SHOT_SPEED.min + (SHOT_SPEED.max - SHOT_SPEED.min) * p;
  return {
    round,
    releaseTick: input.tick,
    tick: 0,
    pos: { x: round.ball.x, y: BALL_R, z: round.ball.z },
    vel: { x: (ax / a) * vh, y: LOFT * vh, z: (az / a) * vh },
    spin: { x: 0, y: -(input.curve / 1000) * 14, z: 0 },
    curve: input.curve / 1000,
    touchedWall: false,
    touchedKeeper: false,
    touchedPost: false,
    result: null,
    events: [],
  };
}

function cylinderHit(pos: V3, vel: V3, cx: number, cz: number, radius: number, height: number, e: number): boolean {
  if (pos.y - BALL_R >= height) return false;
  const p = { a: pos.x, b: pos.z };
  const v = { a: vel.x, b: vel.z };
  if (!bounceCircle(p, v, cx, cz, BALL_R + radius, e)) return false;
  pos.x = p.a;
  pos.z = p.b;
  vel.x = v.a;
  vel.z = v.b;
  return true;
}

function finish(s: ShotState, kind: ShotKind, corner = false): void {
  if (s.result) return;
  const viaPost = kind === 'goal' && s.touchedPost;
  const points = kind === 'goal' ? POINTS.goal + (viaPost ? POINTS.viaPost : 0) + (corner ? POINTS.corner : 0) : 0;
  s.result = { kind, points, viaPost, corner };
}

function missKind(s: ShotState): ShotKind {
  return s.touchedKeeper ? 'saved' : s.touchedWall ? 'wall' : s.touchedPost ? 'post' : 'miss';
}

/** Bir tick ilerletir (yerinde). Karar anında `state.result` dolar. */
export function stepShot(s: ShotState): void {
  s.events = [];
  const kz = keeperZ(s.round, s.releaseTick + s.tick);
  for (let i = 0; i < SUBSTEPS; i++) {
    const prev = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    // Falso (Magnus): havadayken yatay hıza dik ivme; zamanla söner.
    if (s.pos.y > BALL_R + 0.01 && s.curve !== 0) {
      const k = s.curve * CURVE_K * H;
      const vx = s.vel.x;
      s.vel.x += -s.vel.z * k;
      s.vel.z += vx * k;
      s.curve *= decay(CURVE_DECAY, H);
    }
    const bounced = advanceBall(s.pos, s.vel, H, BALL_R, TUNING);
    for (const f of s.round.wall) {
      if (cylinderHit(s.pos, s.vel, f.x, f.z, FIGURE.r, FIGURE.height, FIGURE.restitution)) s.touchedWall = true;
    }
    if (cylinderHit(s.pos, s.vel, KEEPER.x, kz, KEEPER.r, KEEPER.height, KEEPER.restitution)) s.touchedKeeper = true;
    const events: StepEvent[] = [];
    collideGoal(prev, s.pos, s.vel, GOAL, BALL_R, events, TUNING);
    applyNetDrag(s.pos, s.vel, GOAL, H, TUNING);
    s.spin = nextSpin(s.spin, s.pos, s.vel, bounced, H, BALL_R);
    for (const e of events) {
      s.events.push(e);
      if (e.type === 'post') s.touchedPost = true;
      if (e.type === 'goal') {
        const corner = Math.abs(s.pos.z) > GOAL.halfW - CORNER.side && s.pos.y > GOAL.height - CORNER.top;
        finish(s, 'goal', corner);
      }
    }
    // Kale çizgisini gol olmadan geçti (üstten / yandan): aut.
    if (!s.result && prev.x <= BALL_R && s.pos.x > BALL_R) finish(s, missKind(s));
  }
  s.tick++;
  if (s.result) return;
  const speed = len2(s.vel.x, s.vel.z);
  const stopped = s.pos.y <= BALL_R + 1e-6 && s.vel.y === 0 && speed < 0.05;
  const gone = s.pos.x < s.round.ball.x - 6 || s.pos.z > 34 || s.pos.z < -34;
  if (stopped || gone || s.tick >= MAX_SHOT_TICKS) finish(s, missKind(s));
}

/** Vuruşu sonuna kadar simüle eder (sunucu ve testler). */
export function simulateShot(round: Round, input: ShotInput): ShotResult {
  const s = startShot(round, input);
  while (!s.result) stepShot(s);
  return s.result;
}

export type SeriesScore = { total: number; shots: ShotResult[] };

/** Serinin skoru: tohum + 5 vuruş girdisi → sonuçlar. Sunucunun otoritesi budur. */
export function scoreSeries(seed: number, inputs: readonly ShotInput[]): SeriesScore {
  const shots = inputs.slice(0, SHOTS_PER_SERIES).map((input, i) => simulateShot(makeRound(seed, i), input));
  return { total: shots.reduce((n, s) => n + s.points, 0), shots };
}

// ── Nişan (istemci: işaretçi → girdi) ─────────────────────────────────────────────────────────────────

/**
 * Geri çekme → girdi. `pullX` / `pullY`: işaretçinin toptan ekran uzaklığı (px; aşağı çekmek pozitif y),
 * `lateralPx`: bırakma anındaki yana kaydırma (px; sağa pozitif → sağa falso). Aşağı doğru çekilmemişse null.
 */
export function aimToInput(pullX: number, pullY: number, lateralPx: number, maxPullPx: number, tick: number): ShotInput | null {
  if (!(pullY > 6)) return null;
  const d = len2(pullX, pullY);
  const power = Math.round(Math.min(1, d / maxPullPx) * 1000);
  if (power < 80) return null;
  const scale = 2000 / d;
  const dead = 6;
  const lat = Math.abs(lateralPx) <= dead ? 0 : lateralPx - (lateralPx > 0 ? dead : -dead);
  return {
    f: Math.max(1, Math.min(4000, Math.round(pullY * scale))),
    // Sağa çekmek sola nişan alır (sapan gibi).
    s: Math.max(-4000, Math.min(4000, Math.round(-pullX * scale))),
    power,
    curve: Math.max(-1000, Math.min(1000, Math.round((lat / 70) * 1000))),
    tick: Math.max(0, Math.min(MAX_RELEASE_TICK, Math.floor(tick))),
  };
}

/**
 * /frikik — serbest vuruş oyununun BELİRLENİMCİ simülasyonu. İstemci (animasyon) ve sunucu (skor doğrulama) AYNI kodu
 * çalıştırır: sunucu seriyi tohumdan (seed) üretir, istemciden yalnız vuruş girdilerini alır ve skoru kendisi hesaplar.
 *
 * Belirlenimcilik kuralları (bkz. sim.test.ts kaynak taraması):
 * - Sabit adım (TICK = 1/120 sn, adım başına 2 alt adım); kare hızından bağımsız.
 * - Yalnız + − × ÷, Math.sqrt ve tam sayı işlemleri; sin / cos / exp / pow / hypot / random YOK.
 * - Girdi tam sayı: kaydırma yolunun 12–20 örnek noktası (kale düzlemine göre cm), kaydırma süresi (ms) ve bırakma
 *   tick'i. Yön, güç ve falso bu noktalardan BURADA hesaplanır (`shotParams`) → sunucu aynı sayılardan aynı sonucu bulur.
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
/**
 * Kaleci şuta tepki verir: `react` tick sonra hedefe doğru `speed` (m/sn) ile kayar → yavaş şut kurtarılır, sert +
 * köşe şut geçer. Serinin ilk 2 vuruşu kolay (level 0: kaleci geç ve yavaş, baraj 3 kişi), sonrakiler normal.
 */
export const KEEPER_LEVELS = [
  { react: 60, speed: 2.4, periodScale: 1.4 },
  { react: 46, speed: 3.1, periodScale: 1 },
] as const;
export const EASY_ROUNDS = 2;
/** Güç bölgeleri (0–1): altı "çok güçsüz" (kaleci yetişir), üstü "aşırı güçlü" (top yükselir, isabet düşer). */
export const POWER_ZONES = { weak: 0.3, over: 0.85 };
/** Aşırı güçte dikey hıza eklenen oran (tam güçte). */
const OVERPOWER_LIFT = 0.22;
/** Nişan yardımı: güvenli bölgenin (direklerin / üst direğin biraz içi) en çok bu kadar dışındaki hedef, içeri çekilir. */
const AIM_ASSIST = { marginZ: 0.4, top: 0.42, bottom: 0.3, reach: 0.7, pull: 0.4 };
/** Şut: güç 0–1 → yatay hız (m/sn); yükseklik hedef noktadan çözülür. Falso: yanal ivme = falso × CURVE_K × hız. */
export const SHOT_SPEED = { min: 14, max: 30 };
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
  /** Kaleci: şuta kadar kale çizgisinin önünde üçgen dalgayla gidip gelir; şutta `react` tick sonra `speed` ile kayar. */
  keeper: { amp: number; period: number; phase: number; react: number; speed: number };
};

/**
 * Serinin `index`. turu (0 tabanlı). Mesafe 16–24 m, açı sınırlı; baraj yakın direği kapatır (ilk 2 turda 3 kişi,
 * sonra 3–5); kaleci ilk 2 turda daha yavaş.
 */
export function makeRound(seed: number, index: number): Round {
  const r = rng((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const dist = 16 + Math.floor(r() * 17) * 0.5;
  const k = Math.floor((dist * 0.45) / 0.5);
  const z = (Math.floor(r() * (2 * k + 1)) - k) * 0.5;
  const ball = { x: -dist, z };
  const level = KEEPER_LEVELS[index < EASY_ROUNDS ? 0 : 1];
  const countRand = r();
  const count = index < EASY_ROUNDS ? 3 : 3 + Math.floor(countRand * 3);
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
  const period = Math.floor((230 + Math.floor(r() * 200)) * level.periodScale);
  const phase = Math.floor(r() * period);
  return { ball, wall, keeper: { amp, period, phase, react: level.react, speed: level.speed } };
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

// ── Vuruş girdisi (kaydırma) ──────────────────────────────────────────────────────────────────────────

/** Kaydırma yolu örnek sayısı sınırları ve istemcinin ürettiği sayı. */
export const SWIPE_POINTS = { min: 12, max: 20, client: 16 };
/** Geçerli kaydırma: en az bu uzunlukta (m) ve bu kadar yukarı (kaleye doğru, m). */
export const SWIPE_MIN = { length: 2.5, up: 1.5 };
/** Kaydırma hızı (cm/ms, kale düzlemi ölçeğinde) → güç 0–1. */
export const SWIPE_SPEED = { min: 1, max: 4.5 };
/** Yolun kirişten en büyük sapması / kiriş uzunluğu → falso (bu oranda tam falso); altı ölü bölge. */
export const SWIPE_BULGE = { full: 0.3, dead: 0.03 };

/**
 * İstemciden gelen TEK şey. Hepsi tam sayı:
 * - `pts`: kaydırma yolunun örnekleri, KALE DÜZLEMİ koordinatında cm — [z, y]: z = kale ortasından sağa, y = kale
 *   çizgisinden yukarı (istemci ekran noktalarını kalenin ekrandaki ölçeğiyle çevirir; top bu düzlemde kalenin
 *   "altında" görünür, y < 0). İlk nokta topun üstü, son nokta hedef.
 * - `ms`: ETKİN kaydırma süresi = kiriş uzunluğu / kaydırmanın en yüksek hızı (istemci hesaplar; yavaşça nişan alıp
 *   beklemek gücü düşürmez). Simülasyon gücü yalnız `kiriş uzunluğu / ms`'ten bulur → sunucu aynen yeniden hesaplar.
 * - `tick`: turun başından bırakma anına kadar geçen tick (kalecinin o andaki konumu).
 */
export type ShotInput = { tick: number; ms: number; pts: [number, number][] };

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Geçerli girdi ya da null (alan eksik / tam sayı değil / aralık dışı / nokta sayısı uygunsuz). */
export function parseShotInput(raw: unknown): ShotInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isInt(o.tick, 0, MAX_RELEASE_TICK) || !isInt(o.ms, 30, 3000) || !Array.isArray(o.pts)) return null;
  if (o.pts.length < SWIPE_POINTS.min || o.pts.length > SWIPE_POINTS.max) return null;
  const pts: [number, number][] = [];
  for (const p of o.pts as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0], -5000, 5000) || !isInt(p[1], -5000, 3000)) return null;
    pts.push([p[0], p[1]]);
  }
  return { tick: o.tick, ms: o.ms, pts };
}

export type ShotParams = {
  /** İlk hız (m/sn). */
  vel: V3;
  /** Falso −1…1 (pozitif: sağa kıvrılır). */
  curve: number;
  power: number;
  /** Hedef noktanın z'si (kaleci buraya yönelir). */
  targetZ: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Güvenli aralığın [lo, hi] en çok `reach` dışındaki değeri kenara doğru `pull` oranında çeker; içerideyse dokunmaz. */
function assist(v: number, lo: number, hi: number): number {
  const edge = v < lo ? lo : v > hi ? hi : v;
  const off = v - edge;
  return off === 0 || Math.abs(off) > AIM_ASSIST.reach ? v : edge + off * (1 - AIM_ASSIST.pull);
}

/**
 * Kaydırma → şut. Hedef = son nokta (kale düzleminde); güç = kaydırma hızı; falso = yolun kirişe göre eğriliği (yol
 * sağa bombeliyse top sağdan çıkıp sola kıvrılır ve yine hedefe yönelir). Yükseklik, top hedef noktadan geçecek şekilde
 * çözülür. Çok kısa / kaleye doğru olmayan kaydırma → null (geçersiz vuruş).
 */
export function shotParams(round: Round, input: ShotInput): ShotParams | null {
  const n = input.pts.length;
  const fz = input.pts[0]![0] / 100;
  const fy = input.pts[0]![1] / 100;
  const lz = input.pts[n - 1]![0] / 100;
  const ly = input.pts[n - 1]![1] / 100;
  const cz = lz - fz;
  const cy = ly - fy;
  const len = len2(cz, cy);
  if (len < SWIPE_MIN.length || cy < SWIPE_MIN.up) return null;
  // Kirişten en büyük sapma (sağa pozitif)
  let dev = 0;
  for (let i = 1; i < n - 1; i++) {
    const pz = input.pts[i]![0] / 100 - fz;
    const py = input.pts[i]![1] / 100 - fy;
    const cross = (pz * cy - py * cz) / len;
    if (Math.abs(cross) > Math.abs(dev)) dev = cross;
  }
  const ratio = dev / len;
  const mag = Math.abs(ratio) <= SWIPE_BULGE.dead ? 0 : Math.min(1, (Math.abs(ratio) - SWIPE_BULGE.dead) / (SWIPE_BULGE.full - SWIPE_BULGE.dead));
  // Sağa bombe → sola kıvrılan top
  const curve = mag === 0 ? 0 : ratio > 0 ? -mag : mag;
  const speed = (len * 100) / input.ms;
  const power = clamp((speed - SWIPE_SPEED.min) / (SWIPE_SPEED.max - SWIPE_SPEED.min), 0, 1);
  // Hafif nişan yardımı: kale çerçevesinin hemen dışına / direğe düşen hedef biraz içeri çekilir.
  const targetZ = assist(clamp(lz, -10, 10), -(GOAL.halfW - AIM_ASSIST.marginZ), GOAL.halfW - AIM_ASSIST.marginZ);
  const targetY = assist(clamp(ly, 0.15, 4.2), AIM_ASSIST.bottom, GOAL.height - AIM_ASSIST.top);
  const vh = SHOT_SPEED.min + (SHOT_SPEED.max - SHOT_SPEED.min) * power;
  // Aşırı güç: top yükselir (üst direğin üstünden gidebilir).
  const lift = power > POWER_ZONES.over ? 1 + (OVERPOWER_LIFT * (power - POWER_ZONES.over)) / (1 - POWER_ZONES.over) : 1;
  const dist = len2(round.ball.x, targetZ - round.ball.z);
  const t = dist / vh;
  // Falsonun varışta yaptıracağı yanal kayma kadar ters yöne nişan (top hedefe kıvrılarak gelsin).
  const drift = 0.5 * curve * CURVE_K * dist * t * 0.8;
  const ax = -round.ball.x;
  const az = targetZ - drift - round.ball.z;
  const a = len2(ax, az);
  return {
    vel: { x: (ax / a) * vh, y: ((targetY - BALL_R) / t + 0.5 * TUNING.gravity * t) * lift, z: (az / a) * vh },
    curve,
    power,
    targetZ,
  };
}

// ── Vuruş simülasyonu ─────────────────────────────────────────────────────────────────────────────────

export type ShotKind = 'goal' | 'saved' | 'wall' | 'post' | 'miss';
export type ShotResult = { kind: ShotKind; points: number; viaPost: boolean; corner: boolean };

export type ShotState = {
  round: Round;
  /** Vuruştan beri geçen tick. */
  tick: number;
  /** Kalecinin z'si (bırakma anındaki yerinden hedefe doğru kayar) ve yöneldiği nokta. */
  keeperZ: number;
  keeperTarget: number;
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
  const p = shotParams(round, input);
  const kz = keeperZ(round, input.tick);
  const s: ShotState = {
    round,
    tick: 0,
    keeperZ: kz,
    keeperTarget: p ? clamp(p.targetZ, -(GOAL.halfW - 0.5), GOAL.halfW - 0.5) : kz,
    pos: { x: round.ball.x, y: BALL_R, z: round.ball.z },
    vel: p ? p.vel : { x: 0, y: 0, z: 0 },
    spin: { x: 0, y: p ? -p.curve * 14 : 0, z: 0 },
    curve: p ? p.curve : 0,
    touchedWall: false,
    touchedKeeper: false,
    touchedPost: false,
    result: null,
    events: [],
  };
  // Geçersiz kaydırma: vuruş sayılır, top yerinde kalır (0 puan).
  if (!p) s.result = { kind: 'miss', points: 0, viaPost: false, corner: false };
  return s;
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
  if (s.tick >= s.round.keeper.react && s.keeperZ !== s.keeperTarget) {
    const step = s.round.keeper.speed * TICK;
    const d = s.keeperTarget - s.keeperZ;
    s.keeperZ = Math.abs(d) <= step ? s.keeperTarget : s.keeperZ + (d > 0 ? step : -step);
  }
  const kz = s.keeperZ;
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

/** Önizlemenin bittiği x: kalecinin önü (önizleme kurtarışı ele vermez; kaleciye kadar gerçek yolla aynıdır). */
export const PREVIEW_END_X = KEEPER.x - KEEPER.r - BALL_R - 0.05;

/**
 * Yörünge önizlemesi: AYNI simülasyon (startShot / stepShot), top kalecinin önüne gelene ya da bir şeye takılana kadar.
 * Kaleci topa ancak dokunarak etki eder → bırakılan şut bu noktalara kadar birebir aynı yolu izler.
 * @returns her `every` tick'te bir konum; `blocked`: baraja / direğe takıldı ya da kaleye varmadan sonuçlandı
 */
export function previewPath(round: Round, input: ShotInput, every = 3): { points: V3[]; blocked: boolean } {
  const s = startShot(round, input);
  const points: V3[] = [{ ...s.pos }];
  if (s.result) return { points, blocked: true };
  while (s.tick < MAX_SHOT_TICKS) {
    stepShot(s);
    if (s.touchedWall || s.touchedPost || s.result) {
      points.push({ ...s.pos });
      return { points, blocked: true };
    }
    if (s.pos.x >= PREVIEW_END_X) break;
    if (s.tick % every === 0) points.push({ ...s.pos });
  }
  points.push({ ...s.pos });
  return { points, blocked: false };
}

export type SeriesScore = { total: number; shots: ShotResult[] };

/** Serinin skoru: tohum + 5 vuruş girdisi → sonuçlar. Sunucunun otoritesi budur. */
export function scoreSeries(seed: number, inputs: readonly ShotInput[]): SeriesScore {
  const shots = inputs.slice(0, SHOTS_PER_SERIES).map((input, i) => simulateShot(makeRound(seed, i), input));
  return { total: shots.reduce((n, s) => n + s.points, 0), shots };
}

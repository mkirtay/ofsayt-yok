/**
 * /frikik — serbest vuruş oyununun BELİRLENİMCİ simülasyonu. İstemci (animasyon) ve sunucu (skor doğrulama) AYNI kodu
 * çalıştırır: sunucu seriyi tohumdan (seed) üretir, istemciden yalnız vuruş girdilerini alır ve skoru kendisi hesaplar.
 *
 * Belirlenimcilik kuralları (bkz. sim.test.ts kaynak taraması):
 * - Sabit adım (TICK = 1/120 sn, adım başına 2 alt adım); kare hızından bağımsız.
 * - Yalnız + − × ÷, Math.sqrt ve tam sayı işlemleri; sin / cos / exp / pow / hypot / random YOK.
 * - Girdi tam sayı: geri çekme yolunun 12–20 örnek noktası ("çekme birimi": tam çekme = 1000), bırakıştaki yana
 *   kıvrım ve bırakma tick'i. Yön, güç, falso ve SAPMA bu sayılardan BURADA hesaplanır (`shotParams`); sapma da
 *   girdiden türetilen tohumla (karma + mulberry32) üretilir → aynı girdi = aynı sonuç, sunucu aynen yeniden hesaplar.
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
  { react: 44, speed: 3.3, periodScale: 1 },
] as const;
export const EASY_ROUNDS = 2;
/** Şut: güç 0–1 → yatay hız (m/sn); dikey hız = LOFT × yatay (güç yüksekliği de belirler). Falso: yanal ivme. */
export const SHOT_SPEED = { min: 9, max: 30 };
export const LOFT = 0.34;
const CURVE_K = 0.45;
const CURVE_DECAY = 0.4;
/** Çekmenin yanal bileşeninin yöne etkisi (< 1: daha az hassas nişan). */
export const AIM_SIDE_GAIN = 0.8;
/**
 * Sapma (risk / ödül): yön hatasının üst sınırı (radyan) = base + power²·byPower + titreme·byShake; yükseklik (dikey
 * hız) hatası oranı = liftBase + power²·liftByPower. Güç arttıkça isabet düşer; titrek çekme de saptırır.
 */
export const SCATTER = { base: 0.006, byPower: 0.075, byShake: 0.03, liftBase: 0.01, liftByPower: 0.1 };
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

// ── Vuruş girdisi (geri çek – bırak) ──────────────────────────────────────────────────────────────────

/** Çekme yolu örnek sayısı sınırları ve istemcinin ürettiği sayı. */
export const PULL_POINTS = { min: 12, max: 20, client: 16 };
/** Çekme birimi: tam çekme (en büyük güç) = 1000. Geçerli şut: en az bu kadar çekilmiş ve aşağı (oyuncuya) doğru. */
export const PULL = { full: 1000, min: 150, minDown: 60 };
/** Bırakıştaki yana kıvrım (çekme birimi) → falso: bu kadarı tam falso; altı ölü bölge. */
export const FLICK = { full: 420, dead: 40 };

/**
 * İstemciden gelen TEK şey. Hepsi tam sayı, "çekme birimi" cinsinden (istemci: ekran pikseli × 1000 / en büyük çekme
 * pikseli; x sağa, y aşağı = oyuncuya doğru; orijin topun ekrandaki yeri):
 * - `pts`: geri çekme yolunun örnekleri (tutuştan nişanın alındığı ana kadar; yay uzunluğuna göre eşit aralıklı).
 *   SON nokta çekme vektörüdür: yön = tersi (aşağı çekmek ileri, sağa çekmek sola nişan), uzunluğu güç.
 *   Yolun zikzakları (titreme) sapmayı büyütür.
 * - `flick`: bırakırken parmağın çekme yönüne dik kayması (sağa pozitif → top sağa falso alır).
 * - `tick`: turun başından bırakma anına kadar geçen tick (kalecinin o andaki konumu).
 * Sunucu `shotParams` ile yönü, gücü, falsoyu ve sapmayı bu sayılardan aynen yeniden hesaplar.
 */
export type ShotInput = { tick: number; flick: number; pts: [number, number][] };

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

/** Geçerli girdi ya da null (alan eksik / tam sayı değil / aralık dışı / nokta sayısı uygunsuz). */
export function parseShotInput(raw: unknown): ShotInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (!isInt(o.tick, 0, MAX_RELEASE_TICK) || !isInt(o.flick, -2000, 2000) || !Array.isArray(o.pts)) return null;
  if (o.pts.length < PULL_POINTS.min || o.pts.length > PULL_POINTS.max) return null;
  const pts: [number, number][] = [];
  for (const p of o.pts as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !isInt(p[0], -3000, 3000) || !isInt(p[1], -3000, 3000)) return null;
    pts.push([p[0], p[1]]);
  }
  return { tick: o.tick, flick: o.flick, pts };
}

export type ShotParams = {
  /** İlk hız (m/sn) — sapma dahil. */
  vel: V3;
  /** Nişan yönü (birim, yatay) — SAPMASIZ; yön oku bunu gösterir. */
  aim: { x: number; z: number };
  /** Falso −1…1 (pozitif: sağa kıvrılır). */
  curve: number;
  power: number;
  /** Çekme yolundaki titreme 0–1. */
  shake: number;
  /** Uygulanan sapma: yön (radyan, sağa pozitif) ve dikey hız çarpanı. */
  scatter: { yaw: number; lift: number };
  /** Topun kale düzlemini keseceği tahmini z (kaleci buraya yönelir). */
  targetZ: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Çekme yolundaki titreme: ardışık parçalar arasındaki geri dönüşlerin (zikzak) sayısından 0–1. */
export function pullShake(pts: readonly [number, number][]): number {
  let reversals = 0;
  for (let i = 2; i < pts.length; i++) {
    const ax = pts[i - 1]![0] - pts[i - 2]![0];
    const ay = pts[i - 1]![1] - pts[i - 2]![1];
    const bx = pts[i]![0] - pts[i - 1]![0];
    const by = pts[i]![1] - pts[i - 1]![1];
    if (ax * bx + ay * by < 0) reversals++;
  }
  return Math.min(1, reversals / 4);
}

/** Sapmanın tohumu: girdinin tam sayıları + topun yeri (aynı girdi → aynı sapma; tick dahil değil). */
function scatterSeed(round: Round, input: ShotInput): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0;
  };
  mix(Math.round(round.ball.x * 2));
  mix(Math.round(round.ball.z * 2));
  mix(input.flick);
  for (const p of input.pts) {
    mix(p[0]);
    mix(p[1]);
  }
  return h;
}

/** Sapmanın üst sınırı: yön (radyan) ve dikey hız oranı. Güç ve titremeyle büyür. */
export function scatterAmplitude(power: number, shake: number): { yaw: number; lift: number } {
  return {
    yaw: SCATTER.base + power * power * SCATTER.byPower + shake * SCATTER.byShake,
    lift: SCATTER.liftBase + power * power * SCATTER.liftByPower,
  };
}

/**
 * Geri çekme → şut. Yön çekmenin tersi, güç çekme uzunluğu (hem hız hem yükseklik), falso bırakıştaki yana kıvrım.
 * Üstüne tohumlu sapma eklenir (güç ve titremeyle büyür). Yeterince / aşağı doğru çekilmemişse null (geçersiz vuruş).
 */
export function shotParams(round: Round, input: ShotInput): ShotParams | null {
  const last = input.pts[input.pts.length - 1]!;
  const px = last[0];
  const py = last[1];
  const d = len2(px, py);
  if (d < PULL.min || py < PULL.minDown) return null;
  const power = clamp(d / PULL.full, 0, 1);
  const b = aimBasis(round);
  // Aşağı çekmek ileri, sağa çekmek sola nişan (sapan).
  const side = -px * AIM_SIDE_GAIN;
  const ax = b.fx * py + b.rx * side;
  const az = b.fz * py + b.rz * side;
  const a = len2(ax, az);
  const aim = { x: ax / a, z: az / a };
  const fl = Math.abs(input.flick) <= FLICK.dead ? 0 : (Math.abs(input.flick) - FLICK.dead) / (FLICK.full - FLICK.dead);
  const curve = fl === 0 ? 0 : input.flick > 0 ? Math.min(1, fl) : -Math.min(1, fl);
  const shake = pullShake(input.pts);
  // Tohumlu sapma: −1…1 iki sayı
  const r = rng(scatterSeed(round, input));
  const amp = scatterAmplitude(power, shake);
  const yaw = (r() * 2 - 1) * amp.yaw;
  const lift = 1 + (r() * 2 - 1) * amp.lift;
  // Küçük açı: yönü sağına doğru `yaw` kadar kaydırıp yeniden birimle (trigonometri yok).
  const dx = aim.x + -aim.z * yaw;
  const dz = aim.z + aim.x * yaw;
  const dl = len2(dx, dz);
  const vh = SHOT_SPEED.min + (SHOT_SPEED.max - SHOT_SPEED.min) * power;
  const vel = { x: (dx / dl) * vh, y: LOFT * vh * lift, z: (dz / dl) * vh };
  // Kale düzlemindeki tahmini kesişim (falsonun kayması dahil) — kalecinin yöneldiği yer.
  const t = vel.x > 0.5 ? -round.ball.x / vel.x : 0;
  const dist = len2(round.ball.x, vel.z * t);
  const targetZ = round.ball.z + vel.z * t + 0.5 * curve * CURVE_K * dist * t * 0.8;
  return { vel, aim, curve, power, shake, scatter: { yaw, lift }, targetZ };
}

/**
 * Bu turda top kale yüksekliğine ulaştıran güç aralığı (sapmasız, falsosuz, düz şut için yaklaşık): altı kaleye
 * varmadan düşer / yerden gider, üstü üst direğin üstünden gider. Güç çubuğundaki "uygun" bölge.
 */
export function powerWindow(round: Round): { weak: number; over: number } {
  const dist = len2(round.ball.x, round.ball.z);
  const toPower = (heightAtGoal: number) => {
    // y(D) = R + LOFT·D − g·D² / (2·vh²)  →  vh
    const drop = BALL_R + LOFT * dist - heightAtGoal;
    const vh = dist * Math.sqrt(TUNING.gravity / (2 * drop));
    return clamp((vh - SHOT_SPEED.min) / (SHOT_SPEED.max - SHOT_SPEED.min), 0, 1);
  };
  return { weak: toPower(0.12), over: toPower(GOAL.height - 0.2) };
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

export type SeriesScore = { total: number; shots: ShotResult[] };

/** Serinin skoru: tohum + 5 vuruş girdisi → sonuçlar. Sunucunun otoritesi budur. */
export function scoreSeries(seed: number, inputs: readonly ShotInput[]): SeriesScore {
  const shots = inputs.slice(0, SHOTS_PER_SERIES).map((input, i) => simulateShot(makeRound(seed, i), input));
  return { total: shots.reduce((n, s) => n + s.points, 0), shots };
}

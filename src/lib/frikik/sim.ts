/**
 * /frikik — serbest vuruş oyununun BELİRLENİMCİ simülasyonu. İstemci (animasyon) ve sunucu (skor doğrulama) AYNI kodu
 * çalıştırır: sunucu seriyi tohumdan (seed) üretir, istemciden yalnız vuruş girdilerini alır ve skoru kendisi hesaplar.
 *
 * Belirlenimcilik kuralları (bkz. sim.test.ts kaynak taraması):
 * - Sabit adım (TICK = 1/120 sn, adım başına 2 alt adım); kare hızından bağımsız.
 * - Yalnız + − × ÷, Math.sqrt ve tam sayı işlemleri; sin / cos / exp / pow / hypot / random YOK.
 * - Girdi tam sayı: kaydırma yolunun 12–20 örnek noktası (kale düzlemine göre cm), kaydırma süresi (ms) ve bırakma
 *   tick'i. Yön, güç, falso ve tohumlu sapma bu sayılardan BURADA hesaplanır (`shotParams`) → sunucu aynı sayılardan
 *   aynı sonucu bulur. Math.random yok: sapma tohumu girdinin ve topun yerinin özetidir (`scatterSeed`).
 *
 * Dünya (metre ölçeğinde, top arcade boyutta): kale çizgisi x = 0, kale ağzı −x'e bakar, top x < 0'da; z yanal.
 * Ortak fizik: lib/pitchPhysics/core.ts (zemin, direk, file, gol tespiti).
 *
 * İki mod, aynı vuruş girdisi:
 * - SERİ: `makeRound(seed, i)` ile 5 tur, `scoreSeries(seed, inputs)`.
 * - SEVİYE: `makeLevelRound(seed, level)` ile sonsuz seviye, 3 can, her seviye 1 vuruş; gol → sonraki seviye, kaçırma →
 *   1 can. Kaldıraçlar (mesafe, baraj, kaleci, rüzgâr, kale daralması, hareketli baraj) seviyeyle kademeli (`levelSpec`).
 *   Puan = temel puan × seviye çarpanı. Kayıt: `{ seed, shots: ShotInput[] }` (sırayla); `scoreLevelRun(seed, shots)`
 *   seviyeleri ve canları girdilerden yeniden türetir → sunucu aynı koddan aynı sonucu bulur. Günlük tohum: lib/frikik/daily.ts.
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
  /** Baraj figürlerinin merkezleri (hareketli barajda `wallOffset` sıra boyunca eklenir). */
  wall: { x: number; z: number }[];
  /** Kaleci: şuta kadar kale çizgisinin önünde üçgen dalgayla gidip gelir; şutta `react` tick sonra `speed` ile kayar. */
  keeper: { amp: number; period: number; phase: number; react: number; speed: number };
  /** Yanal rüzgâr (m/sn², +z sağa): havadaki topa sürekli ivme. 0 = rüzgârsız. */
  wind: number;
  /** Kale genişliği çarpanı (1 = tam kale; seviye modunda daralır). */
  goalScale: number;
  /** Hareketli baraj: sıra doğrultusunda üçgen dalga (m); amp 0 = sabit. */
  wallMotion: { amp: number; period: number; phase: number };
};

/** Tur üretim parametreleri (seri ve seviye modu aynı üreticiyi kullanır; RNG çağrı sırası sabittir). */
type RoundSpec = {
  /** Mesafe: `distMin` + 0…`distSteps`−1 adım × 0,5 m. */
  distMin: number;
  distSteps: number;
  /** Yanal açı: |z| ≤ mesafe × angle. */
  angle: number;
  wallMin: number;
  wallMax: number;
  keeper: { react: number; speed: number; periodScale: number };
  wind: number;
  goalScale: number;
  wallMotionAmp: number;
};

function buildRound(r: () => number, p: RoundSpec): Round {
  const dist = p.distMin + Math.floor(r() * p.distSteps) * 0.5;
  const k = Math.floor((dist * p.angle) / 0.5);
  const z = (Math.floor(r() * (2 * k + 1)) - k) * 0.5;
  const ball = { x: -dist, z };
  const countRand = r();
  const count = p.wallMin + Math.floor(countRand * (p.wallMax - p.wallMin + 1));
  const sideRand = r();
  const side = z > 0 ? 1 : z < 0 ? -1 : sideRand < 0.5 ? -1 : 1;
  const targetZ = side * GOAL.halfW * p.goalScale * (0.15 + 0.5 * r());
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
  const amp = Math.min(1.2 + r() * 1.4, GOAL.halfW * p.goalScale - KEEPER.r - 0.1);
  const period = Math.floor((230 + Math.floor(r() * 200)) * p.keeper.periodScale);
  const phase = Math.floor(r() * period);
  // Seviye kaldıraçları (seri modunda hepsi etkisiz; RNG yalnız gerekince çekilir → seri turları değişmez)
  const wind = p.wind === 0 ? 0 : (r() < 0.5 ? -1 : 1) * p.wind * (0.85 + 0.3 * r());
  const wallMotion = p.wallMotionAmp === 0 ? { amp: 0, period: 1, phase: 0 } : { amp: p.wallMotionAmp, period: 300 + Math.floor(r() * 180), phase: Math.floor(r() * 400) };
  return { ball, wall, keeper: { amp, period, phase, react: p.keeper.react, speed: p.keeper.speed }, wind, goalScale: p.goalScale, wallMotion };
}

/**
 * Serinin `index`. turu (0 tabanlı). Mesafe 16–24 m, açı sınırlı; baraj yakın direği kapatır (ilk 2 turda 3 kişi,
 * sonra 3–5); kaleci ilk 2 turda daha yavaş.
 */
export function makeRound(seed: number, index: number): Round {
  const r = rng((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0);
  const easy = index < EASY_ROUNDS;
  return buildRound(r, { distMin: 16, distSteps: 17, angle: 0.45, wallMin: 3, wallMax: easy ? 3 : 5, keeper: KEEPER_LEVELS[easy ? 0 : 1], wind: 0, goalScale: 1, wallMotionAmp: 0 });
}

// ── Seviye modu ───────────────────────────────────────────────────────────────────────────────────────

export const LIVES = 3;
/** Bir koşuda en çok bu kadar vuruş kabul edilir (sunucu sınırı). */
export const MAX_LEVEL_SHOTS = 400;
/** Kaleci kademeleri (seviye modunda `keeper` kaldıracı bu diziyi tırmanır). */
export const KEEPER_TIERS = [
  { react: 60, speed: 2.4, periodScale: 1.4 },
  { react: 52, speed: 2.8, periodScale: 1.2 },
  { react: 46, speed: 3.1, periodScale: 1 },
  { react: 40, speed: 3.5, periodScale: 0.9 },
  { react: 34, speed: 3.9, periodScale: 0.8 },
] as const;
export type Lever = 'dist' | 'wall' | 'keeper' | 'wind' | 'goal' | 'moving' | 'angle';
/**
 * Seviye n, bu listenin ilk n−1 adımını uygular (her seviyede 1 kaldıraç artar; ilk 3 seviye kolay: 1. seviye hiç,
 * 2–3. seviyeler yalnız mesafe/açı). Liste bitince `LEVER_CYCLE` üst sınıra kadar döner.
 */
export const LEVER_STEPS: readonly Lever[] = ['dist', 'angle', 'wall', 'keeper', 'wind', 'dist', 'wall', 'keeper', 'goal', 'wind', 'moving', 'dist', 'keeper', 'wind', 'goal', 'angle'];
const LEVER_CYCLE: readonly Lever[] = ['dist', 'wind', 'keeper', 'moving', 'goal', 'angle'];
export const LEVER_CAPS = { dist: 26, angle: 0.75, wall: 5, keeper: KEEPER_TIERS.length - 1, wind: 2.4, goal: 0.68, moving: 1.2 };
const LEVER_STEP = { dist: 1.5, angle: 0.1, wall: 1, keeper: 1, wind: 0.6, goal: 0.08, moving: 0.4 };

export type LevelSpec = { level: number; dist: number; angle: number; wall: number; keeper: number; wind: number; goal: number; moving: number };

/** Seviyenin kaldıraç değerleri (1 tabanlı). Belirlenimci: seviye → aynı değerler. */
export function levelSpec(level: number): LevelSpec {
  const s: LevelSpec = { level, dist: 16, angle: 0.35, wall: 3, keeper: 0, wind: 0, goal: 1, moving: 0 };
  for (let i = 0; i < level - 1; i++) {
    const lever = i < LEVER_STEPS.length ? LEVER_STEPS[i]! : LEVER_CYCLE[(i - LEVER_STEPS.length) % LEVER_CYCLE.length]!;
    if (lever === 'goal') s.goal = Math.max(LEVER_CAPS.goal, Math.round((s.goal - LEVER_STEP.goal) * 100) / 100);
    else s[lever] = Math.min(LEVER_CAPS[lever], Math.round((s[lever] + LEVER_STEP[lever]) * 100) / 100);
  }
  return s;
}

/** Seviye turu: tohum (gün ya da rastgele) + seviye → aynı tur. */
export function makeLevelRound(seed: number, level: number): Round {
  const p = levelSpec(level);
  const r = rng((Math.imul(seed >>> 0, 0x7feb352d) ^ Math.imul(level, 0x846ca68b) ^ 0x5bd1e995) >>> 0);
  return buildRound(r, {
    distMin: p.dist,
    distSteps: 5,
    angle: p.angle,
    wallMin: p.wall,
    wallMax: p.wall,
    keeper: KEEPER_TIERS[p.keeper]!,
    wind: p.wind,
    goalScale: p.goal,
    wallMotionAmp: p.moving,
  });
}

/** Seviye çarpanı: 1, 1.5, 2, … (puanlar 50'nin katı → sonuç tam sayı). */
export function levelMultiplier(level: number): number {
  return (level + 1) / 2;
}
export function levelPoints(basePoints: number, level: number): number {
  return Math.round(basePoints * levelMultiplier(level));
}

/** Barajın `tick` anındaki sıra boyunca kayması (m; üçgen dalga). */
export function wallOffset(round: Round, tick: number): number {
  const { amp, period, phase } = round.wallMotion;
  if (amp === 0) return 0;
  const u = ((tick + phase) % period) / period;
  return amp * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u);
}

/** Turun kalesi (seviye modunda daralmış). */
export function roundGoal(round: Round): GoalSpec {
  return round.goalScale === 1 ? GOAL : goalSpec(1, { lineX: 0, halfW: GOAL.halfW * round.goalScale, height: GOAL.height, depth: 2, postR: 0.06 });
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
/**
 * Falso: yolun kirişe göre ORTALAMA yanal sapması / kiriş uzunluğu (uç noktaya değil, yolun kıvrımına bakar; ortalama
 * tek bir titremeyi değil bütün yolun bombesini ölçer → kendiliğinden yumuşak). `full` oranında tam falso, `dead` altı
 * düz sayılır. Fare / dokunmatik yüzey için rahat: sinüs bombeli yolda en büyük sapma ≈ 1,57 × ortalama → kirişin
 * ~%16'sı kadar bombe tam falso verir.
 */
export const SWIPE_BULGE = { full: 0.1, dead: 0.015 };
/**
 * Gerçekçilik: tohumlu sapma. Yaw (yön, radyan ≈ küçük açı) = base + güç² × byPower + titreme × byShake; dikey hız
 * çarpanı 1 ± (liftBase + güç² × liftByPower). Sert şut ve titrek kaydırma daha çok sapar.
 */
export const SCATTER = { base: 0.004, byPower: 0.03, byShake: 0.03, liftBase: 0.01, liftByPower: 0.06 };

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
  /** İlk hız (m/sn), sapma uygulanmış. */
  vel: V3;
  /** Falso −1…1 (pozitif: sağa kıvrılır). */
  curve: number;
  power: number;
  /** Kaydırmadaki titreme 0–1 (yanal sapma artışlarının yön değiştirme sayısı). */
  shake: number;
  /** Uygulanan sapma: `yaw` yön (sağa pozitif, radyan ≈), `lift` dikey hız çarpanı. */
  scatter: { yaw: number; lift: number };
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

/** Titreme sayımında bir "dönüş" için yanal sapmanın son uç değerinden en az bu kadar (cm) geri gelmesi gerekir. */
const SHAKE_HYSTERESIS = 2;

/**
 * Kaydırmadaki titreme 0–1: ara noktaların kirişe göre yanal sapması kaç kez yön değiştirdi (histerezisli: cm'ye
 * yuvarlama kırpıntısı sayılmaz). Pürüzsüz bir bombe en çok 1 kez döner; zikzak çizen parmak daha çok. 4+ fazla dönüş =
 * tam titreme.
 */
export function swipeShake(pts: readonly [number, number][]): number {
  const n = pts.length;
  const cz = pts[n - 1]![0] - pts[0]![0];
  const cy = pts[n - 1]![1] - pts[0]![1];
  const len = len2(cz, cy);
  if (len === 0) return 0;
  let dir = 0;
  let extreme = 0;
  let turns = 0;
  for (let i = 1; i < n; i++) {
    const dev = ((pts[i]![0] - pts[0]![0]) * cy - (pts[i]![1] - pts[0]![1]) * cz) / len;
    if (dir >= 0 && dev > extreme) extreme = dev;
    else if (dir <= 0 && dev < extreme) extreme = dev;
    else if (dir >= 0 && dev < extreme - SHAKE_HYSTERESIS) {
      if (dir > 0) turns++;
      dir = -1;
      extreme = dev;
    } else if (dir <= 0 && dev > extreme + SHAKE_HYSTERESIS) {
      if (dir < 0) turns++;
      dir = 1;
      extreme = dev;
    }
    if (dir === 0 && Math.abs(dev) > SHAKE_HYSTERESIS) dir = dev > 0 ? 1 : -1;
  }
  return Math.min(1, Math.max(0, turns - 1) / 4);
}

/** Sapma genliği (yaw: yön, lift: dikey çarpan payı). Güçle kare, titremeyle doğrusal büyür. */
export function scatterAmplitude(power: number, shake: number): { yaw: number; lift: number } {
  return {
    yaw: SCATTER.base + power * power * SCATTER.byPower + shake * SCATTER.byShake,
    lift: SCATTER.liftBase + power * power * SCATTER.liftByPower,
  };
}

/** Sapma tohumu: girdi tam sayıları + topun yeri (FNV benzeri 32 bit karma) → aynı girdi her yerde aynı sapma. */
export function scatterSeed(round: Round, input: ShotInput): number {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0;
  };
  mix(Math.round(round.ball.x * 2));
  mix(Math.round(round.ball.z * 2));
  mix(input.ms);
  for (const p of input.pts) {
    mix(p[0]);
    mix(p[1]);
  }
  return h;
}

/**
 * Kaydırma → şut. Hedef = son nokta (kale düzleminde; kaydırmanın genel yönü); güç = kaydırma hızı; falso = yolun
 * kirişe göre ortalama bombesi (yol sağa bombeliyse top sağdan çıkıp sola kıvrılır ve yine hedefe yönelir). Yükseklik,
 * top hedef noktadan geçecek şekilde çözülür; sonra tohumlu sapma (güç ve titremeyle büyür) yön ve yüksekliğe eklenir.
 * Çok kısa / kaleye doğru olmayan kaydırma → null (geçersiz vuruş).
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
  // Kirişe göre ortalama yanal sapma (sağa pozitif): yolun bombesi
  let sum = 0;
  for (let i = 1; i < n - 1; i++) {
    const pz = input.pts[i]![0] / 100 - fz;
    const py = input.pts[i]![1] / 100 - fy;
    sum += (pz * cy - py * cz) / len;
  }
  const ratio = sum / (n - 2) / len;
  const mag = Math.abs(ratio) <= SWIPE_BULGE.dead ? 0 : Math.min(1, (Math.abs(ratio) - SWIPE_BULGE.dead) / (SWIPE_BULGE.full - SWIPE_BULGE.dead));
  // Sağa bombe → sola kıvrılan top
  const curve = mag === 0 ? 0 : ratio > 0 ? -mag : mag;
  const speed = (len * 100) / input.ms;
  const power = clamp((speed - SWIPE_SPEED.min) / (SWIPE_SPEED.max - SWIPE_SPEED.min), 0, 1);
  // Hafif nişan yardımı: kale çerçevesinin hemen dışına / direğe düşen hedef biraz içeri çekilir.
  const halfW = GOAL.halfW * round.goalScale;
  const targetZ = assist(clamp(lz, -10, 10), -(halfW - AIM_ASSIST.marginZ), halfW - AIM_ASSIST.marginZ);
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
  // Tohumlu sapma: yönü sağa doğru `yaw` kadar döndür (küçük açı, trigonometri yok) ve yeniden birimle; yüksekliği çarp.
  const shake = swipeShake(input.pts);
  const amp = scatterAmplitude(power, shake);
  const r = rng(scatterSeed(round, input));
  const yaw = (r() * 2 - 1) * amp.yaw;
  const liftScatter = 1 + (r() * 2 - 1) * amp.lift;
  const dx = ax + -az * yaw;
  const dz = az + ax * yaw;
  const a = len2(dx, dz);
  return {
    vel: { x: (dx / a) * vh, y: ((targetY - BALL_R) / t + 0.5 * TUNING.gravity * t) * lift * liftScatter, z: (dz / a) * vh },
    curve,
    power,
    shake,
    scatter: { yaw, lift: liftScatter },
    targetZ,
  };
}

// ── Vuruş simülasyonu ─────────────────────────────────────────────────────────────────────────────────

export type ShotKind = 'goal' | 'saved' | 'wall' | 'post' | 'miss';
export type ShotResult = { kind: ShotKind; points: number; viaPost: boolean; corner: boolean };

export type ShotState = {
  round: Round;
  goal: GoalSpec;
  /** Bırakma tick'i (hareketli baraj bu andan sürer). */
  releaseTick: number;
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
  const goal = roundGoal(round);
  const s: ShotState = {
    round,
    goal,
    releaseTick: input.tick,
    tick: 0,
    keeperZ: kz,
    keeperTarget: p ? clamp(p.targetZ, -(goal.halfW - 0.5), goal.halfW - 0.5) : kz,
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
  const wallOff = wallOffset(s.round, s.releaseTick + s.tick);
  const w = s.round.wall;
  // Sıra doğrultusu (baraj iki+ kişiyse komşu figürlerden; tek kişilikse yanal)
  const rowLen = w.length > 1 ? len2(w[1]!.x - w[0]!.x, w[1]!.z - w[0]!.z) : 1;
  const rowX = w.length > 1 ? (w[1]!.x - w[0]!.x) / rowLen : 0;
  const rowZ = w.length > 1 ? (w[1]!.z - w[0]!.z) / rowLen : 1;
  const goal = s.goal;
  for (let i = 0; i < SUBSTEPS; i++) {
    const prev = { x: s.pos.x, y: s.pos.y, z: s.pos.z };
    if (s.pos.y > BALL_R + 0.01) {
      // Falso (Magnus): havadayken yatay hıza dik ivme; zamanla söner.
      if (s.curve !== 0) {
        const k = s.curve * CURVE_K * H;
        const vx = s.vel.x;
        s.vel.x += -s.vel.z * k;
        s.vel.z += vx * k;
        s.curve *= decay(CURVE_DECAY, H);
      }
      // Yanal rüzgâr: sabit ivme
      s.vel.z += s.round.wind * H;
    }
    const bounced = advanceBall(s.pos, s.vel, H, BALL_R, TUNING);
    for (const f of w) {
      if (cylinderHit(s.pos, s.vel, f.x + rowX * wallOff, f.z + rowZ * wallOff, FIGURE.r, FIGURE.height, FIGURE.restitution)) s.touchedWall = true;
    }
    if (cylinderHit(s.pos, s.vel, KEEPER.x, kz, KEEPER.r, KEEPER.height, KEEPER.restitution)) s.touchedKeeper = true;
    const events: StepEvent[] = [];
    collideGoal(prev, s.pos, s.vel, goal, BALL_R, events, TUNING);
    applyNetDrag(s.pos, s.vel, goal, H, TUNING);
    s.spin = nextSpin(s.spin, s.pos, s.vel, bounced, H, BALL_R);
    for (const e of events) {
      s.events.push(e);
      if (e.type === 'post') s.touchedPost = true;
      if (e.type === 'goal') {
        const corner = Math.abs(s.pos.z) > goal.halfW - CORNER.side && s.pos.y > goal.height - CORNER.top;
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

/**
 * Seviye koşusu kaydı (sunucuya gidecek biçim; doğrulama bu adımda yok): `seed` turların tohumu (günlük: lib/frikik/daily.ts
 * `dailySeed(day)`, `day` TR gün numarası; serbest: rastgele, `day` null), `shots` sırayla vuruş girdileri. Seviye /
 * can / puan kayıtta YOK — `scoreLevelRun` türetir.
 */
export type LevelRunRecord = { seed: number; day: number | null; shots: ShotInput[] };
export type LevelShot = { level: number; result: ShotResult; points: number };
export type LevelRunScore = {
  /** Ulaşılan (son oynanan) seviye. */
  level: number;
  /** Geçilen seviye sayısı (gol). */
  cleared: number;
  /** Kalan can (0 = koşu bitti). */
  lives: number;
  total: number;
  shots: LevelShot[];
};

/**
 * Seviye koşusunun skoru: tohum + sıralı vuruş girdileri → seviyeler, canlar ve puan BURADA türetilir (istemci seviye
 * numarası göndermez). Canlar bitince sonraki girdiler yok sayılır. Sıralama: önce `level`, sonra `total`.
 */
export function scoreLevelRun(seed: number, inputs: readonly ShotInput[]): LevelRunScore {
  let level = 1;
  let lives = LIVES;
  let cleared = 0;
  let total = 0;
  const shots: LevelShot[] = [];
  for (const input of inputs.slice(0, MAX_LEVEL_SHOTS)) {
    if (lives === 0) break;
    const result = simulateShot(makeLevelRound(seed, level), input);
    const points = levelPoints(result.points, level);
    shots.push({ level, result, points });
    total += points;
    if (result.kind === 'goal') {
      cleared++;
      level++;
    } else lives--;
  }
  return { level, cleared, lives, total, shots };
}

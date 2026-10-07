/**
 * Kaleci hamlesinin GÖRSEL planı (fizik ve sonuç sim.ts'te; burası yalnız kök konum / poz üretir, three.js bilmez →
 * test edilebilir). Eksenler sim ile aynı: derinlik x (kale çizgisi 0, top x < 0), yan eksen z.
 *
 * Akış (tick = 1/120 sn): hazır duruş → `REACT_TICKS` sonra kısa hazırlık adımı (`PREP_TICKS`, kök hedefe doğru az
 * ilerler, çömelme) → yanal dalış: kök `prepZ`'den `rootEnd`'e ease-out ile ilerler, ayaklar yerden kopar (tepe süre
 * ortasında), gövde `tilt` kadar yana yatar, iniş `rootEnd`'de biter (ışınlanma / geri kayma yok). Sahne vuruş anında
 * sim'i bir kez ileri sarar (deterministik; sim değişmez) ve topun kaleci düzlemini kestiği z / tick ile sonucu öğrenir:
 * "kurtardı" → parmak uçları tam o anda topun yolunda; "gol" → eller topa `GOAL_SHORT` (0,5 m) kala kalır. Top kaleciye
 * hiç gelmiyorsa (baraj / aut) ya da gerek < 0,9 m ise dalış yok: küçük adım + çömelme + uzanma.
 */
import { TICK } from '@/lib/frikik/sim';

export { TICK };

/** Görsel tepki (0,1 sn) ve hazırlık adımı (0,1 sn) süreleri (tick). */
export const REACT_TICKS = 12;
export const PREP_TICKS = 12;
/** Dalışsız küçük adımın süresi; dalış süresi sınırları (tick). */
const STEP_TICKS = 24;
const DIVE_MIN = 30;
const DIVE_MAX = 46;
/** Figür boyu (m) — gövde yatışının yanal uzantısı buna göre. */
const BODY_LEN = 1.88;

/** Golde ellerin topa kaç metre kala kaldığı. */
export const GOAL_SHORT = 0.5;

export type KeeperPlanInput = {
  /** Kalecinin duruş yeri ve sim'in hedefi (ShotState.keeperTarget; yön ipucu), sim kalecisinin hızı (m/sn). */
  z0: number;
  target: number;
  speed: number;
  /** Sim sondası: top kaleci düzlemini kesti mi, nerede (z) ve ne zaman (tick); sonuç kurtarış mı. */
  crossed: boolean;
  ballZ: number;
  tCross: number;
  saved: boolean;
  /** Kale yarı genişliği (daralmış kale dahil). */
  halfW: number;
};

export type KeeperPlan = {
  dir: 1 | -1;
  dive: boolean;
  z0: number;
  prepZ: number;
  rootEnd: number;
  /** Parmak uçlarının dalış sonunda ulaştığı z (yalnız bilgi / test). */
  handsZ: number;
  /** Gövde yatışı (rad) ve o yatışın yanal uzantısı (m). */
  tilt: number;
  reach: number;
  diveStart: number;
  diveDur: number;
};

export type KeeperPose = {
  /** Kök (ayak) z'si. */
  root: number;
  lift: number;
  tilt: number;
  crouch: number;
  reach: number;
  /** Gövdenin hareket yönüne dönüşü (rad, y ekseni). */
  yaw: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);

export function planKeeperMove(i: KeeperPlanInput): KeeperPlan {
  const prepEnd = REACT_TICKS + PREP_TICKS;
  // Hedef: top kaleciye geliyorsa topun kestiği z (golde biraz kısa), gelmiyorsa sim hedefi yönünde küçük adım
  const aimZ = i.crossed ? i.ballZ : i.target;
  const dir: 1 | -1 = aimZ >= i.z0 ? 1 : -1;
  const rawHands = i.crossed ? (i.saved ? i.ballZ : i.ballZ - dir * GOAL_SHORT) : i.z0 + dir * Math.min(0.6, Math.abs(i.target - i.z0));
  const handsZ = clamp(rawHands, -(i.halfW - 0.1), i.halfW - 0.1);
  const need = Math.abs(handsZ - i.z0);
  const dive = i.crossed && need >= 0.9;
  const tEnd = Math.max(prepEnd + 8, i.tCross - 2);
  // Kök gereken mesafenin çoğunu alır (köşede ≥ 2,5 m); kalan gövde yatışıyla kapanır
  const reach = dive ? clamp(0.25 * need, 0.4, 0.85) : clamp(need * 0.5, 0.2, 0.6);
  const rootEnd = clamp(i.z0 + dir * (need - reach), -(i.halfW - 0.45), i.halfW - 0.45);
  // Yatış en az 0,65 rad (37°): dalış okunsun; eller gereken erişimi en çok ~0,3 m aşar (golde yine topa kısa kalır)
  const tilt = dive ? clamp(Math.asin(Math.min(1, reach / BODY_LEN)), 0.65, 0.95) : 0.25;
  const prepZ = i.z0 + dir * Math.min(0.15 * need, 0.35);
  const minDur = clamp(Math.round((36 * 3.1) / i.speed), DIVE_MIN, DIVE_MAX);
  const diveStart = Math.max(prepEnd, tEnd - minDur);
  const diveDur = Math.max(minDur, tEnd - diveStart);
  void TICK;
  return { dir, dive, z0: i.z0, prepZ, rootEnd, handsZ, tilt, reach, diveStart, diveDur };
}

/** Vuruştan `tick` sonra kalecinin pozu. Kök z zamanla hedefe doğru monoton ilerler; inişten sonra sabit. */
export function keeperPoseAt(k: KeeperPlan, tick: number): KeeperPose {
  if (tick < REACT_TICKS) return { root: k.z0, lift: 0, tilt: 0, crouch: 0.35, reach: 0, yaw: 0 };
  if (!k.dive) {
    // Küçük adım + çömelme + öndeki kolun uzanması; ayaklar yerde
    const p = clamp((tick - REACT_TICKS) / STEP_TICKS, 0, 1);
    const e = easeOut(p);
    return { root: k.z0 + (k.rootEnd - k.z0) * e, lift: 0, tilt: k.tilt * e, crouch: 0.35 + 0.5 * e, reach: e, yaw: 0.25 * e };
  }
  const prepEnd = REACT_TICKS + PREP_TICKS;
  if (tick < k.diveStart) {
    // Hazırlık adımı; dalış zamanı gelene kadar çömelik bekler
    const u = clamp((tick - REACT_TICKS) / PREP_TICKS, 0, 1);
    const e = easeOut(u);
    return { root: k.z0 + (k.prepZ - k.z0) * e, lift: 0, tilt: 0.1 * e, crouch: 0.35 + 0.55 * e, reach: 0.3 * e, yaw: 0.15 * e };
  }
  const p = clamp((tick - k.diveStart) / k.diveDur, 0, 1);
  const landed = tick - k.diveStart - k.diveDur;
  const e = easeOut(p);
  const s = smooth(p);
  // Havada yay: tepe süre ortasında; inişte 6 tick'lik küçük sekme, sonra yerde kalır
  const lift = p < 1 ? 0.55 * Math.sin(Math.PI * p) : landed < 6 ? 0.05 * Math.sin((Math.PI * landed) / 6) : 0;
  void prepEnd;
  return { root: k.prepZ + (k.rootEnd - k.prepZ) * e, lift, tilt: k.tilt * s, crouch: 0.9 - 0.5 * s, reach: 1, yaw: 0.6 * s };
}

/** Hazır duruş (yeni vuruş). */
export const READY_POSE: KeeperPose = { root: 0, lift: 0, tilt: 0, crouch: 0.35, reach: 0, yaw: 0 };

/** İki poz arası doğrusal geçiş (vuruş sonrası yumuşak toparlanma). */
export function mixPose(a: KeeperPose, b: KeeperPose, t: number): KeeperPose {
  const u = clamp(t, 0, 1);
  const m = (x: number, y: number) => x + (y - x) * u;
  return { root: m(a.root, b.root), lift: m(a.lift, b.lift), tilt: m(a.tilt, b.tilt), crouch: m(a.crouch, b.crouch), reach: m(a.reach, b.reach), yaw: m(a.yaw, b.yaw) };
}

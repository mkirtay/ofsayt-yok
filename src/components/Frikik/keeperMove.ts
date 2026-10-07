/**
 * Kaleci hamlesinin GÖRSEL planı (fizik ve sonuç sim.ts'te; burası yalnız kök konum / poz üretir, three.js bilmez →
 * test edilebilir). Eksenler sim ile aynı: derinlik x (kale çizgisi 0, top x < 0), yan eksen z.
 *
 * Akış (tick = 1/120 sn): hazır duruş → `REACT_TICKS` (lobda: top barajı geçince) sonra kısa hazırlık adımı (`PREP_TICKS`, kök hedefe doğru az
 * ilerler, çömelme) → yanal dalış: kök `prepZ`'den `rootEnd`'e ease-out ile ilerler, ayaklar yerden kopar (tepe süre
 * ortasında), gövde `tilt` kadar yana yatar, iniş `rootEnd`'de biter (ışınlanma / geri kayma yok). Sahne vuruş anında
 * sim'i bir kez ileri sarar (deterministik; sim değişmez) ve topun kaleci düzlemini kestiği z / tick ile sonucu öğrenir:
 * "kurtardı" → parmak uçları tam o anda topun yolunda; "gol" → eller topa `GOAL_SHORT` (0,45 m) kala kalır. Top kaleciye
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

export type KeeperPlanInput = {
  /** Kalecinin duruş yeri ve sim'in hedefi (ShotState.keeperTarget; yön ipucu), sim kalecisinin hızı (m/sn). */
  z0: number;
  target: number;
  speed: number;
  /** Sim sondası: top kaleci düzlemini kesti mi, nerede (z, y) ve ne zaman (tick); sonuç kurtarış mı. */
  crossed: boolean;
  ballZ: number;
  ballY: number;
  tCross: number;
  saved: boolean;
  /** Kale yarı genişliği (daralmış kale dahil). */
  halfW: number;
  /** Topun barajı geçtiği tick (lob: kaleci topu ancak o zaman görür); yoksa görsel tepki REACT_TICKS. */
  tSeen?: number;
};

export type KeeperPlan = {
  dir: 1 | -1;
  dive: boolean;
  /** Görsel tepkinin başladığı tick: max(REACT_TICKS, tSeen − 4). */
  react: number;
  z0: number;
  prepZ: number;
  rootEnd: number;
  /** Parmak uçlarının temas anındaki hedefi (yalnız bilgi / test). */
  handsZ: number;
  handsY: number;
  /** Gövde yatışı (rad), ellerin ayak bileğine uzaklığı (m; kollar yukarı 2,3, omuz hizası 1,3) ve yanal erişim (m). */
  tilt: number;
  handsLen: number;
  reach: number;
  /** Sıçrama tepe yüksekliği (m). */
  jump: number;
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
  /** Kollar: 0 omuz hizasında yana, 1 gövde boyunca yukarı (ellerin ayak bileğine uzaklığı 1,3 → 2,3 m). */
  armUp: number;
  /** Gövdenin hareket yönüne dönüşü (rad, y ekseni). */
  yaw: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
/** Temas anı dalışın bu oranında (havada; sonrası iniş). */
export const CONTACT_P = 0.6;
/** Ellerin ayak bileğine uzaklığı: kollar yukarı (boy 1,88 + kol) ve omuz hizasında yana. */
export const HANDS_UP = 2.3;
export const HANDS_SIDE = 1.3;
/** Golde ellerin topa en az bu kadar uzak kalması (m, y–z düzleminde). */
export const GOAL_SHORT = 0.45;

export function planKeeperMove(i: KeeperPlanInput): KeeperPlan {
  const react = Math.max(REACT_TICKS, i.tSeen != null ? i.tSeen - 4 : 0);
  const prepEnd = react + PREP_TICKS;
  // Hedef: top kaleciye geliyorsa topun kestiği (z, y); golde eller topa GOAL_SHORT kala (gövde merkezinden topa doğru)
  const aimZ = i.crossed ? i.ballZ : i.target;
  const dir: 1 | -1 = aimZ >= i.z0 ? 1 : -1;
  let handsZ: number;
  let handsY: number;
  if (!i.crossed) {
    handsZ = i.z0 + dir * Math.min(0.6, Math.abs(i.target - i.z0));
    handsY = 1.3;
  } else if (i.saved) {
    handsZ = i.ballZ;
    handsY = i.ballY;
  } else {
    const cy = 1.0;
    const dz = i.ballZ - i.z0;
    const dy = i.ballY - cy;
    const d = Math.max(0.01, Math.hypot(dz, dy));
    handsZ = i.ballZ - (dz / d) * GOAL_SHORT;
    handsY = i.ballY - (dy / d) * GOAL_SHORT;
  }
  handsZ = clamp(handsZ, -(i.halfW - 0.1), i.halfW - 0.1);
  handsY = clamp(handsY, 0.3, 2.9);
  const need = Math.abs(handsZ - i.z0);
  const dive = i.crossed && need >= 0.9;
  const tContact = Math.max(prepEnd + 8, i.tCross - 1);
  const minDur = clamp(Math.round((36 * 3.1) / i.speed), DIVE_MIN, DIVE_MAX);
  if (!dive) {
    const reach = clamp(need * 0.5, 0.2, 0.6);
    const rootEnd = clamp(i.z0 + dir * (need - reach), -(i.halfW - 0.45), i.halfW - 0.45);
    return { dir, dive, react, z0: i.z0, prepZ: i.z0, rootEnd, handsZ, handsY, tilt: 0.25, handsLen: HANDS_SIDE, reach, jump: 0, diveStart: prepEnd, diveDur: minDur };
  }
  // Gövde vektörü (ayak bileği → eller): yanal `reach` (tercih: kök mesafenin çoğunu alır) ve dikey handsY − liftC.
  // Uzunluğu kol duruşuyla 1,3 (omuz hizası) … 2,3 (kollar yukarı) arasında olmalı: sığmıyorsa alçak topta yatış artar
  // (reach büyür), yüksek topta sıçrama (liftC) artar; sıçrama 0,95 m'yi aşacaksa gövde dikleşir (reach küçülür).
  const CP = Math.sin(Math.PI * CONTACT_P);
  const reachPref = clamp(0.25 * need, 0.4, 0.85);
  let liftC = clamp(0.15 * handsY, 0.1, 0.35);
  let reach = reachPref;
  let vert = handsY - liftC;
  let handsLen = Math.hypot(reach, vert);
  if (handsLen < HANDS_SIDE) {
    reach = Math.sqrt(Math.max(0.01, HANDS_SIDE * HANDS_SIDE - vert * vert));
    handsLen = HANDS_SIDE;
  } else if (handsLen > HANDS_UP) {
    liftC = handsY - Math.sqrt(Math.max(0.01, HANDS_UP * HANDS_UP - reach * reach));
    if (liftC > 0.95 * CP) {
      liftC = 0.95 * CP;
      reach = Math.sqrt(Math.max(0.01, HANDS_UP * HANDS_UP - (handsY - liftC) * (handsY - liftC)));
    }
    vert = handsY - liftC;
    handsLen = HANDS_UP;
  }
  const tilt = clamp(Math.atan2(reach, vert), 0.2, 1.4);
  const jump = clamp(liftC / CP, 0.06, 0.95);
  const rootEnd = clamp(i.z0 + dir * Math.max(0, need - reach), -(i.halfW - 0.45), i.halfW - 0.45);
  const prepZ = i.z0 + dir * Math.min(0.15 * need, 0.35);
  // Temas dalışın CONTACT_P noktasında: başlangıç geriye hesaplanır; hazırlıktan erken başlayamaz
  const diveStart = Math.max(prepEnd, Math.round(tContact - CONTACT_P * minDur));
  const diveDur = Math.max(minDur, Math.round((tContact - diveStart) / CONTACT_P));
  void TICK;
  return { dir, dive, react, z0: i.z0, prepZ, rootEnd, handsZ, handsY, tilt, handsLen, reach, jump, diveStart, diveDur };
}

/** Vuruştan `tick` sonra kalecinin pozu. Kök z zamanla hedefe doğru monoton ilerler; temas anında hedefte, sonra sabit. */
export function keeperPoseAt(k: KeeperPlan, tick: number): KeeperPose {
  if (tick < k.react) return { root: k.z0, lift: 0, tilt: 0, crouch: 0.35, reach: 0, armUp: 0, yaw: 0 };
  if (!k.dive) {
    // Küçük adım + çömelme + öndeki kolun uzanması; ayaklar yerde
    const p = clamp((tick - k.react) / STEP_TICKS, 0, 1);
    const e = easeOut(p);
    return { root: k.z0 + (k.rootEnd - k.z0) * e, lift: 0, tilt: k.tilt * e, crouch: 0.35 + 0.5 * e, reach: e, armUp: 0, yaw: 0.25 * e };
  }
  if (tick < k.diveStart) {
    // Hazırlık adımı; dalış zamanı gelene kadar çömelik bekler
    const u = clamp((tick - k.react) / PREP_TICKS, 0, 1);
    const e = easeOut(u);
    return { root: k.z0 + (k.prepZ - k.z0) * e, lift: 0, tilt: 0.1 * e, crouch: 0.35 + 0.55 * e, reach: 0.3 * e, armUp: 0, yaw: 0.15 * e };
  }
  const p = clamp((tick - k.diveStart) / k.diveDur, 0, 1);
  const landed = tick - k.diveStart - k.diveDur;
  // Kök ve yatış temas anında (CONTACT_P) hedefe ulaşır, sonra sabit; havada yay tepe süre ortasında; inişte küçük sekme
  const e = clamp(easeOut(p) / easeOut(CONTACT_P), 0, 1);
  const s = clamp(smooth(p) / smooth(CONTACT_P), 0, 1);
  const lift = p < 1 ? k.jump * Math.sin(Math.PI * p) : landed < 6 ? 0.04 * Math.sin((Math.PI * landed) / 6) : 0;
  const armUp = (k.handsLen - HANDS_SIDE) / (HANDS_UP - HANDS_SIDE);
  return { root: k.prepZ + (k.rootEnd - k.prepZ) * e, lift, tilt: k.tilt * s, crouch: 0.9 - 0.5 * s, reach: 1, armUp, yaw: 0.6 * s };
}

/** Ellerin (parmak ucu) dünya (y, z) konumu: kök + lift + gövde boyunca `handsLen` (kaleci düzlemi x sabit). */
export function keeperHandsAt(k: KeeperPlan, tick: number): { y: number; z: number } {
  const p = keeperPoseAt(k, tick);
  const len = HANDS_SIDE + p.armUp * (HANDS_UP - HANDS_SIDE);
  return { y: p.lift + len * Math.cos(p.tilt), z: p.root + k.dir * len * Math.sin(p.tilt) };
}

/** Temas tick'i (plan): dalışın CONTACT_P noktası. */
export function contactTick(k: KeeperPlan): number {
  return Math.round(k.diveStart + CONTACT_P * k.diveDur);
}

/** Hazır duruş (yeni vuruş). */
export const READY_POSE: KeeperPose = { root: 0, lift: 0, tilt: 0, crouch: 0.35, reach: 0, armUp: 0, yaw: 0 };

/** İki poz arası doğrusal geçiş (vuruş sonrası yumuşak toparlanma). */
export function mixPose(a: KeeperPose, b: KeeperPose, t: number): KeeperPose {
  const u = clamp(t, 0, 1);
  const m = (x: number, y: number) => x + (y - x) * u;
  return { root: m(a.root, b.root), lift: m(a.lift, b.lift), tilt: m(a.tilt, b.tilt), crouch: m(a.crouch, b.crouch), reach: m(a.reach, b.reach), armUp: m(a.armUp, b.armUp), yaw: m(a.yaw, b.yaw) };
}

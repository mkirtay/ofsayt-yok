/**
 * Kaydırma (ekran) → simülasyon girdisi. YALNIZ istemcide: (yumuşatılmış) yol yay uzunluğuna göre eşit aralıklı
 * `SWIPE_POINTS.client` noktaya indirgenir ve kalenin ekrandaki ölçeğiyle kale düzlemi koordinatına (cm, tam sayı)
 * çevrilir; güç için etkin süre hesaplanır. Buradaki kayan nokta işlemleri sonucu etkilemez: sunucu yalnız üretilen tam sayıları görür ve her şeyi
 * onlardan hesaplar (sim.ts → shotParams).
 */
import { MAX_RELEASE_TICK, SWIPE_POINTS, type ShotInput } from './sim';

export type ScreenPoint = { x: number; y: number };

/** Ekran → kale düzlemi: `origin` kale çizgisi ortasının ekrandaki yeri; `pxPerM` kalenin ekrandaki yatay / dikey ölçeği. */
export type GoalFrame = { originX: number; originY: number; pxPerMX: number; pxPerMY: number };

/** Yolu yay uzunluğuna göre `count` eşit aralıklı noktaya indirger (ilk ve son nokta korunur). */
export function resamplePath(points: readonly ScreenPoint[], count: number): ScreenPoint[] {
  if (points.length === 0) return [];
  const acc = [0];
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const total = acc[acc.length - 1]!;
  const out: ScreenPoint[] = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (j < points.length - 2 && acc[j + 1]! < target) j++;
    const a = points[j]!;
    const b = points[Math.min(j + 1, points.length - 1)]!;
    const seg = acc[Math.min(j + 1, acc.length - 1)]! - acc[j]!;
    const u = seg > 0 ? Math.min(1, Math.max(0, (target - acc[j]!) / seg)) : 0;
    out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
  }
  return out;
}

/**
 * Etkin süre (ms) = kiriş (ilk → son nokta, px) / kaydırmanın en yüksek hızı (px/ms). Güç bundan çıkar: hızlı bir
 * fiskeden sonra parmağı tutup nişanı düzeltmek gücü düşürmez; hiç hızlanmayan yavaş sürükleme güçsüz şuttur.
 */
export function effectiveMs(points: readonly ScreenPoint[], peakPxPerMs: number): number {
  if (points.length < 2 || !(peakPxPerMs > 0)) return 3000;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  return Math.max(30, Math.min(3000, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / peakPxPerMs)));
}

/** Kaydırma yolu (ekran) + etkin süre → girdi (tam sayılar). Geçerliliğe (uzunluk / yön) simülasyon karar verir. */
export function swipeToInput(points: readonly ScreenPoint[], ms: number, frame: GoalFrame, tick: number): ShotInput | null {
  if (points.length < 2) return null;
  const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  const pts = resamplePath(points, SWIPE_POINTS.client).map(
    (p): [number, number] => [
      clampInt(((p.x - frame.originX) / frame.pxPerMX) * 100, -5000, 5000),
      clampInt(((frame.originY - p.y) / frame.pxPerMY) * 100, -5000, 3000),
    ],
  );
  return { tick: clampInt(Math.floor(tick), 0, MAX_RELEASE_TICK), ms: clampInt(ms, 30, 3000), pts };
}

/**
 * Parmak titremesine karşı yumuşatma: yavaş harekette ağır (α küçük), hızlı fiskede gecikmesiz (α → 1); `dead` px'ten
 * küçük oynama yok sayılır. Yan hassasiyet `gainX` (< 1: hedef parmaktan daha az kayar → ince ayar).
 */
export function smoothPoint(prev: ScreenPoint, raw: ScreenPoint, speedPxPerMs: number, dead = 3): ScreenPoint {
  const dx = raw.x - prev.x;
  const dy = raw.y - prev.y;
  if (Math.hypot(dx, dy) < dead) return prev;
  const alpha = Math.max(0.3, Math.min(1, 0.3 + speedPxPerMs * 0.9));
  return { x: prev.x + dx * alpha, y: prev.y + dy * alpha };
}

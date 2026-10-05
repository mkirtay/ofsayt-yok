/**
 * Geri çekme (ekran) → simülasyon girdisi. YALNIZ istemcide: çekme yolu yay uzunluğuna göre eşit aralıklı
 * `PULL_POINTS.client` noktaya indirgenir ve "çekme birimi"ne (tam çekme = 1000) çevrilip tam sayıya yuvarlanır.
 * Buradaki kayan nokta işlemleri sonucu etkilemez: sunucu yalnız üretilen tam sayıları görür ve yönü, gücü, falsoyu,
 * sapmayı onlardan hesaplar (sim.ts → shotParams).
 */
import { FLICK, MAX_RELEASE_TICK, PULL, PULL_POINTS, type ShotInput } from './sim';

export type ScreenPoint = { x: number; y: number };

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
 * Bırakıştaki yana kıvrım (px): `anchor` nişanın alındığı çekme noktası (topa göre), `release` parmağın bırakıldığı
 * yer; çekme yönüne dik bileşen, ekran sağı pozitif (aşağı doğru düz çekmede sağa kaydırma = pozitif).
 */
export function flickPx(anchor: ScreenPoint, release: ScreenPoint): number {
  const d = Math.hypot(anchor.x, anchor.y);
  if (d < 1) return 0;
  return (release.x - anchor.x) * (anchor.y / d) - (release.y - anchor.y) * (anchor.x / d);
}

/**
 * Çekme yolu (px, topun ekrandaki yerine göre; son nokta = nişanın alındığı çekme noktası) + yana kıvrım (px) → girdi.
 * `maxPullPx`: tam güç için çekme mesafesi. Geçerliliğe (yeterince / aşağı doğru çekilmiş mi) simülasyon karar verir.
 */
export function pullToInput(path: readonly ScreenPoint[], flick: number, maxPullPx: number, tick: number): ShotInput | null {
  if (path.length < 1 || !(maxPullPx > 0)) return null;
  const k = PULL.full / maxPullPx;
  const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  const pts = resamplePath(path, PULL_POINTS.client).map((p): [number, number] => [clampInt(p.x * k, -3000, 3000), clampInt(p.y * k, -3000, 3000)]);
  return { tick: clampInt(Math.floor(tick), 0, MAX_RELEASE_TICK), flick: clampInt(flick * k, -2000, 2000), pts };
}

/** Vuruş noktası (−1 sol … 0 orta … 1 sağ) → `flick`: topa sağdan vurmak topu SOLA kıvırır (gerçek fizik). */
export function contactToFlick(contact: number): number {
  const v = Math.round(Math.max(-1, Math.min(1, contact)) * FLICK.full);
  return v === 0 ? 0 : -v;
}

/** Vuruş noktasını adımla kaydırır (klavye / tekerlek), −1…1 içinde tutar. */
export function adjustContact(contact: number, delta: number): number {
  return Math.max(-1, Math.min(1, Math.round((contact + delta) * 100) / 100));
}

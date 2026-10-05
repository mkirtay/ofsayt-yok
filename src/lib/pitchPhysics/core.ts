/**
 * Top fiziğinin ORTAK çekirdeği — giriş sahnesi (components/AuthStage) ve /frikik oyunu (lib/frikik) kullanır.
 * DOM / three.js'ten bağımsız. Dünya: zemin y = 0; kale ağzı x ekseninde (`side` yönüne bakan çizgi x = lineX), z yanal.
 *
 * BELİRLENİMCİLİK: /frikik skorunu sunucu aynı kodla yeniden hesaplar → burada yalnız + − × ÷ ve Math.sqrt kullanılır
 * (IEEE'de kesin tanımlı). Math.exp / sin / cos / pow / hypot YOK (motorlar arasında son basamak farkı olabilir);
 * üstel sönüm yerine `decay(k, h) = 1 / (1 + k·h)`. Bkz. core.test.ts (kaynak taraması).
 */

export type V3 = { x: number; y: number; z: number };
/** spin: açısal hız vektörü (eksen × rad/sn). */
export type Ball = { pos: V3; vel: V3; spin: V3 };

export type GoalSpec = {
  /** -1: ağız +x'e bakar (kale x < 0'da), 1: ağız −x'e bakar */
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

export function goalSpec(side: -1 | 1, size: GoalSize): GoalSpec {
  return {
    side,
    lineX: side * size.lineX,
    backX: side * (size.lineX + size.depth),
    halfW: size.halfW,
    height: size.height,
    backHeight: size.height * 0.82,
    postR: size.postR,
  };
}

/** Fizik ayarları (sahneye göre değişir: arcade giriş sahnesi / frikik). */
export type Tuning = {
  gravity: number;
  /** Çimden sekmede dikey / yatay hızın korunan oranı; bu dikey hızın altında top sekmez, yuvarlanır. */
  groundRestitution: number;
  bounceFriction: number;
  minBounceSpeed: number;
  /** Yuvarlanma direnci: sabit yavaşlama (birim/sn²) + hıza orantılı sönüm (1/sn). */
  rollDecel: number;
  rollDamping: number;
  /** Hava direnci (1/sn). */
  airDrag: number;
  postRestitution: number;
  /** File topu yutar: çok az seker, çarpmada diğer hız bileşenleri de söner; içerideki topa sürtünme (1/sn). */
  netRestitution: number;
  netDamp: number;
  netDrag: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const len2 = (a: number, b: number) => Math.sqrt(a * a + b * b);
export const len3 = (a: number, b: number, c: number) => Math.sqrt(a * a + b * b + c * c);
/** Üstel sönümün belirlenimci karşılığı: hız bu çarpanla çarpılır. */
export const decay = (k: number, h: number) => 1 / (1 + k * h);

/** Yuvarlanan topun açısal hızı: eksen = yukarı × hız, büyüklük |v| / r. */
export function rollingSpin(vx: number, vz: number, r: number): V3 {
  return { x: vz / r, y: 0, z: -vx / r };
}

export type StepEvent =
  | { type: 'goal'; side: -1 | 1 }
  | { type: 'post'; side: -1 | 1 }
  /** File içten çarpma (dalga için hız ve nokta). */
  | { type: 'net'; side: -1 | 1; speed: number; y: number; z: number };

/** Daire (2B) çarpışması: merkezden itip normal bileşeni yansıtır. Çarptıysa true. */
export function bounceCircle(
  p: { a: number; b: number },
  v: { a: number; b: number },
  ca: number,
  cb: number,
  min: number,
  e: number,
): boolean {
  const da = p.a - ca;
  const db = p.b - cb;
  const d = len2(da, db);
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

/** Kale: direkler, üst direk, file (arka / yan / çatı) ve gol tespiti. `pos` / `vel` yerinde güncellenir. */
export function collideGoal(prev: V3, pos: V3, vel: V3, g: GoalSpec, r: number, events: StepEvent[], t: Tuning) {
  const depth = Math.abs(g.backX - g.lineX);
  const minPost = r + g.postR;
  // Direkler (dikey silindir: xz düzleminde daire)
  if (pos.y - r < g.height) {
    for (const z0 of [-g.halfW, g.halfW]) {
      const p = { a: pos.x, b: pos.z };
      const v = { a: vel.x, b: vel.z };
      if (bounceCircle(p, v, g.lineX, z0, minPost, t.postRestitution)) {
        [pos.x, pos.z, vel.x, vel.z] = [p.a, p.b, v.a, v.b];
        events.push({ type: 'post', side: g.side });
      }
    }
  }
  // Üst direk (z boyunca silindir: xy düzleminde daire)
  if (Math.abs(pos.z) <= g.halfW) {
    const p = { a: pos.x, b: pos.y };
    const v = { a: vel.x, b: vel.y };
    if (bounceCircle(p, v, g.lineX, g.height, minPost, t.postRestitution)) {
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
      vel.x = -g.side * Math.abs(vel.x) * t.netRestitution;
      vel.y *= t.netDamp;
      vel.z *= t.netDamp;
      if (speed > 0.3) events.push({ type: 'net', side: g.side, speed, y: pos.y, z: pos.z });
    } else if (relPrev > 0 && rel < r) {
      pos.x = g.backX + g.side * r;
      vel.x = g.side * Math.abs(vel.x) * t.netRestitution;
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
      vel.z = s * Math.abs(vel.z) * t.netRestitution;
      if (inside) vel.x *= t.netDamp;
    }
  }
  // Çatı (kale çizgisinden arkaya hafif inen)
  if (out > 0 && out < depth && Math.abs(pos.z) < g.halfW) {
    const roof = roofAt(out);
    if (Math.abs(pos.y - roof) < r) {
      const s = prev.y >= roofAt(outPrev) ? 1 : -1;
      pos.y = roof + s * r;
      vel.y = s * Math.abs(vel.y) * t.netRestitution;
    }
  }
  // Gol: top çizgiyi tamamen geçti (merkez çizgiden r kadar içeride), direklerin arasında, üst direğin altında.
  if (outPrev <= r && out > r && Math.abs(pos.z) < g.halfW && pos.y < g.height) {
    events.push({ type: 'goal', side: g.side });
  }
}

/**
 * Tek alt adım: yer çekimi + hava direnci (havadayken) ya da yuvarlanma direnci (yerdeyken), konum, zemin sekmesi.
 * `pos` / `vel` yerinde güncellenir. @returns bu adımda çimden sekti mi
 */
export function advanceBall(pos: V3, vel: V3, h: number, r: number, t: Tuning): boolean {
  const grounded = pos.y <= r + 1e-6 && Math.abs(vel.y) < 1e-6;
  if (grounded) {
    const s = len2(vel.x, vel.z);
    if (s > 0) {
      const ns = Math.max(0, s - (t.rollDecel + t.rollDamping * s) * h);
      vel.x *= ns / s;
      vel.z *= ns / s;
    }
  } else {
    vel.y -= t.gravity * h;
    const k = decay(t.airDrag, h);
    vel.x *= k;
    vel.y *= k;
    vel.z *= k;
  }
  pos.x += vel.x * h;
  pos.y += vel.y * h;
  pos.z += vel.z * h;
  if (pos.y >= r) return false;
  pos.y = r;
  if (-vel.y > t.minBounceSpeed) {
    vel.y = -vel.y * t.groundRestitution;
    vel.x *= t.bounceFriction;
    vel.z *= t.bounceFriction;
    return true;
  }
  vel.y = 0;
  return false;
}

/** Kale içindeki topa file sürtünmesi (sekip dışarı yuvarlanmasın). */
export function applyNetDrag(pos: V3, vel: V3, g: GoalSpec, h: number, t: Tuning): void {
  if ((pos.x - g.lineX) * g.side > 0 && Math.abs(pos.z) < g.halfW && pos.y < g.height) {
    const k = decay(t.netDrag, h);
    vel.x *= k;
    vel.z *= k;
  }
}

/** Dönüş: yerdeyken tam yuvarlanma; sekmede yuvarlanmaya yaklaşır; havada yavaşça söner. */
export function nextSpin(spin: V3, pos: V3, vel: V3, bounced: boolean, h: number, r: number): V3 {
  const roll = rollingSpin(vel.x, vel.z, r);
  if (pos.y <= r + 1e-6 && vel.y === 0) return roll;
  if (bounced) return { x: spin.x + (roll.x - spin.x) * 0.6, y: spin.y * 0.5, z: spin.z + (roll.z - spin.z) * 0.6 };
  const k = decay(0.3, h);
  return { x: spin.x * k, y: spin.y * k, z: spin.z * k };
}

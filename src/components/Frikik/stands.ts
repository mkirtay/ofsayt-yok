/**
 * Kale arkası tribün: kademeli basamaklar + ön duvar + korkuluklar + projektör direkleri (tek birleşik geometri, köşe
 * renkleri → 1 draw call; lamba başları ayrı emissive malzeme → +1), içinde düşük poligonlu taraftarlar (gövde + baş tek
 * geometri, InstancedMesh + instanceColor → 1 draw call; forma / atkı renk çeşitliliği tohumlu) ve birkaç bayrak /
 * pankart (birleşik, köşe renkli → 1 draw call). Gölge yok. Taraftarlar durağan; golde ucuz zıplama (yalnız kutlama
 * süresince matrisler güncellenir). Her zaman tam tribün; `setDensity` yalnız sahnenin FPS güvenlik ağı için.
 *
 * Tribün geometrisi: ön duvar x = 12 (y 0–2,6; üstünde LED şeridi adBoards'ta), basamaklar x = 12,8'den geriye
 * `ROWS` sıra (derinlik 0,85 m, yükseklik 0,5 m), z −32…32.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from 'three';

export const STAND = { x: 12, wallH: 2.6, rowDepth: 0.85, rowH: 0.5, rows: 14, halfZ: 32 };

/** Taraftar ayağının y'si (basamak üstü) ve x'i, `row` sırası için. */
export function rowPos(row: number): { x: number; y: number } {
  return { x: STAND.x + 0.8 + row * STAND.rowDepth + STAND.rowDepth * 0.55, y: STAND.wallH + row * STAND.rowH };
}

export type Stands = {
  group: Group;
  /** Gol kutlaması: taraftarlar ~1,6 sn zıplar. */
  celebrate: () => void;
  /** Her kare (dt sn): yalnız kutlama sırasında iş yapar. */
  update: (dt: number) => void;
  /** Tema (gündüz / gece): tribün ve lamba parlaklığı. */
  setDay: (day: boolean) => void;
  /** Çizilen taraftar oranı (0–1): FPS güvenlik ağı yarıya indirir. */
  setDensity: (f: number) => void;
  dispose: () => void;
};

/** Basit tohumlu rastgele (görsel çeşitlilik; fizikle ilgisi yok). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Kutu ekler (dünya konumunda), köşe rengiyle; birleşik geometri için ham diziler. */
function pushBox(pos: number[], col: number[], idx: number[], cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Color) {
  const b = pos.length / 3;
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  for (const [x, y, z] of corners) {
    pos.push(cx + x!, cy + y!, cz + z!);
    col.push(color.r, color.g, color.b);
  }
  // 12 üçgen (6 yüz)
  const f = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  for (const t of f) idx.push(b + t[0]!, b + t[1]!, b + t[2]!);
}

function mergedMesh(pos: number[], col: number[], idx: number[], material: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new Mesh(geo, material);
}

export function buildStands(opts: { seed?: number }): Stands {
  const group = new Group();
  const disposables: { dispose: () => void }[] = [];
  const rnd = lcg(opts.seed ?? 7);

  // ── Tribün gövdesi: ön duvar, basamaklar, korkuluklar, projektör direkleri ────────────────────────
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const concrete = new Color(0x3a4150);
  const concreteDark = new Color(0x2b3140);
  const rail = new Color(0xc9d2de);
  const pole = new Color(0x8a94a3);
  pushBox(pos, col, idx, STAND.x + 0.4, STAND.wallH / 2, 0, 0.8, STAND.wallH, STAND.halfZ * 2, concreteDark);
  for (let r = 0; r < STAND.rows; r++) {
    const x = STAND.x + 0.8 + r * STAND.rowDepth + STAND.rowDepth / 2;
    const top = STAND.wallH + r * STAND.rowH;
    pushBox(pos, col, idx, x, top - STAND.rowH / 2, 0, STAND.rowDepth, STAND.rowH, STAND.halfZ * 2, r % 2 ? concrete : concreteDark);
    // Korkuluk: her 4 sırada bir ince boru + dikmeler
    if (r % 4 === 1) {
      pushBox(pos, col, idx, x - STAND.rowDepth / 2 + 0.05, top + 0.95, 0, 0.06, 0.06, STAND.halfZ * 2, rail);
      for (let z = -STAND.halfZ + 1; z <= STAND.halfZ - 1; z += 4) pushBox(pos, col, idx, x - STAND.rowDepth / 2 + 0.05, top + 0.48, z, 0.05, 0.96, 0.05, rail);
    }
  }
  // Ön korkuluk (duvar üstü, LED şeridinin üstünde)
  pushBox(pos, col, idx, STAND.x + 0.75, STAND.wallH + 1.05, 0, 0.06, 0.06, STAND.halfZ * 2, rail);
  // Projektör direkleri: iki yanda
  const lampHeads: { x: number; y: number; z: number }[] = [];
  for (const z of [-26, 26]) {
    const back = rowPos(STAND.rows - 1);
    pushBox(pos, col, idx, back.x + 1.2, (back.y + 14) / 2, z, 0.5, 14 - back.y, 0.5, pole);
    lampHeads.push({ x: back.x + 1.2, y: 14.2, z });
  }
  const bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.05 });
  disposables.push(bodyMat);
  const body = mergedMesh(pos, col, idx, bodyMat);
  disposables.push(body.geometry);
  group.add(body);
  // Lamba başları (emissive, ayrı malzeme)
  const lampGeo = new BoxGeometry(1.6, 0.9, 3.2);
  const lampMat = new MeshBasicMaterial({ color: 0xfff4d6 });
  disposables.push(lampGeo, lampMat);
  for (const h of lampHeads) {
    const m = new Mesh(lampGeo, lampMat);
    m.position.set(h.x, h.y, h.z);
    m.rotation.z = 0.35;
    group.add(m);
  }

  // ── Bayraklar / pankartlar (birleşik, köşe renkli) ───────────────────────────────────────────────
  const fpos: number[] = [];
  const fcol: number[] = [];
  const fidx: number[] = [];
  const flagColors = [0x00a76f, 0xffc83d, 0xe5322d, 0xffffff, 0x1f5fd6];
  for (let i = 0; i < 7; i++) {
    // Afiş slotlarının (|z| < 12, adBoards) dışında: bayraklar panoların önüne gelmez
    const row = 2 + Math.floor(rnd() * (STAND.rows - 4));
    const side = i % 2 ? 1 : -1;
    const z = side * (13 + rnd() * (STAND.halfZ - 16));
    const p = rowPos(row);
    const w = 1.6 + rnd() * 1.6;
    const h = 1.0 + rnd() * 0.8;
    const c = new Color(flagColors[Math.floor(rnd() * flagColors.length)]!);
    // Direk + bez (bez hafif eğik, iki renk şerit)
    pushBox(fpos, fcol, fidx, p.x, p.y + 1.6, z, 0.06, 3.2, 0.06, new Color(0xd9dee6));
    pushBox(fpos, fcol, fidx, p.x - 0.02, p.y + 2.6, z + w / 2 + 0.05, 0.04, h, w, c);
    pushBox(fpos, fcol, fidx, p.x - 0.04, p.y + 2.6, z + w / 2 + 0.05, 0.02, h * 0.34, w, new Color(flagColors[(i + 2) % flagColors.length]!));
  }
  const flagMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const flags = mergedMesh(fpos, fcol, fidx, flagMat);
  disposables.push(flagMat, flags.geometry);
  group.add(flags);

  // ── Taraftarlar: gövde (silindir) + baş (küre) tek geometri, InstancedMesh ───────────────────────
  const torso = new CylinderGeometry(0.19, 0.22, 0.95, 7);
  torso.translate(0, 0.475, 0);
  const head = new SphereGeometry(0.14, 6, 5);
  head.translate(0, 1.1, 0);
  const fanGeo = mergeSimple(torso, head);
  torso.dispose();
  head.dispose();
  const fanMat = new MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
  disposables.push(fanGeo, fanMat);
  const perRow = 64;
  const rowsUsed = STAND.rows;
  const count = perRow * rowsUsed;
  const fans = new InstancedMesh(fanGeo, fanMat, count);
  fans.instanceMatrix.setUsage(DynamicDrawUsage);
  const kits = [0x00a76f, 0x007b55, 0xffc83d, 0xffffff, 0xe5322d, 0x1f5fd6, 0x2a2f3a, 0xf3dcc0, 0x8d5a3b];
  const dummy = new Object3D();
  const basePos: { x: number; y: number; z: number; s: number }[] = [];
  const color = new Color();
  let n = 0;
  for (let r = 0; r < rowsUsed; r++) {
    const p = rowPos(r);
    for (let i = 0; i < perRow; i++) {
      const z = -STAND.halfZ + 1 + ((STAND.halfZ * 2 - 2) * (i + 0.5)) / perRow + (rnd() - 0.5) * 0.5;
      const s = 0.9 + rnd() * 0.25;
      basePos.push({ x: p.x + (rnd() - 0.5) * 0.3, y: p.y, z, s });
      dummy.position.set(basePos[n]!.x, p.y, z);
      dummy.scale.setScalar(s);
      dummy.rotation.y = -Math.PI / 2 + (rnd() - 0.5) * 0.4;
      dummy.updateMatrix();
      fans.setMatrixAt(n, dummy.matrix);
      // Forma / atkı: ev takımı renkleri ağırlıklı, aralarda ten / nötr
      color.setHex(kits[Math.floor(rnd() * kits.length)]!);
      if (rnd() < 0.15) color.offsetHSL(0, 0, -0.15);
      fans.setColorAt(n, color);
      n++;
    }
  }
  fans.instanceMatrix.needsUpdate = true;
  if (fans.instanceColor) fans.instanceColor.needsUpdate = true;
  fans.frustumCulled = false;
  group.add(fans);

  // ── Kutlama: ucuz zıplama (yalnız süresince matris güncellemesi) ──────────────────────────────────
  let party = 0;
  const mat4 = new Matrix4();
  const setFans = (t: number) => {
    for (let i = 0; i < count; i++) {
      const b = basePos[i]!;
      const jump = t > 0 ? Math.max(0, Math.sin(t * 9 + i * 0.7)) * 0.35 * Math.min(1, t * 3) * Math.min(1, Math.max(0, 1.6 - t) * 2) : 0;
      fans.getMatrixAt(i, mat4);
      mat4.elements[13] = b.y + jump;
      fans.setMatrixAt(i, mat4);
    }
    fans.instanceMatrix.needsUpdate = true;
  };

  return {
    group,
    celebrate() {
      party = 0.0001;
    },
    update(dt) {
      if (party <= 0) return;
      party += dt;
      if (party >= 1.7) {
        party = 0;
        setFans(0);
        return;
      }
      setFans(party);
    },
    setDensity(f) {
      fans.count = Math.max(1, Math.floor(count * Math.min(1, Math.max(0, f))));
    },
    setDay(day) {
      lampMat.color.setHex(day ? 0xdfe6ee : 0xfff4d6);
      bodyMat.color.setHex(day ? 0xffffff : 0x9aa3b2);
      fanMat.color.setHex(day ? 0xffffff : 0xb8c0cc);
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** İki indeksli geometriyi (yalnız position + normal) tek geometride birleştirir (BufferGeometryUtils'siz, küçük). */
function mergeSimple(a: BufferGeometry, b: BufferGeometry): BufferGeometry {
  const pa = a.getAttribute('position');
  const pb = b.getAttribute('position');
  const na = a.getAttribute('normal');
  const nb = b.getAttribute('normal');
  const pos = new Float32Array((pa.count + pb.count) * 3);
  const nor = new Float32Array((pa.count + pb.count) * 3);
  pos.set(pa.array as Float32Array, 0);
  pos.set(pb.array as Float32Array, pa.count * 3);
  nor.set(na.array as Float32Array, 0);
  nor.set(nb.array as Float32Array, pa.count * 3);
  const ia = a.getIndex()!;
  const ib = b.getIndex()!;
  const idx = new Uint16Array(ia.count + ib.count);
  for (let i = 0; i < ia.count; i++) idx[i] = ia.getX(i);
  for (let i = 0; i < ib.count; i++) idx[ia.count + i] = ib.getX(i) + pa.count;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  return g;
}

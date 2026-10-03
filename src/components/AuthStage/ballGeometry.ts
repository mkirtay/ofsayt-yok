/**
 * Futbol topu geometrisi — kesik ikosahedron (12 beşgen + 20 altıgen panel), DOM / three.js'ten bağımsız (birim testli).
 *
 * İkosahedronun her kenarı üçe bölünür (60 köşe); her ikosahedron köşesinin çevresi beşgen, her yüzü altıgen olur.
 * Paneller küreye izdüşürülür (hafif şişkin, aralarında dikiş boşluğu); çizim tarafı (stageScene.ts) bunları
 * BufferGeometry'ye çevirir. Yüzler dışarıdan bakınca saat yönünün tersine sıralıdır.
 */

export type Vec3 = [number, number, number];
export type BallFace = { kind: 'pentagon' | 'hexagon'; vertices: Vec3[] };

const PHI = (1 + Math.sqrt(5)) / 2;

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, scale(sub(b, a), t));
const centroid = (vs: Vec3[]): Vec3 => scale(vs.reduce(add, [0, 0, 0] as Vec3), 1 / vs.length);

function icosahedron(): { vertices: Vec3[]; faces: [number, number, number][] } {
  const vertices: Vec3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-PHI, PHI]) {
      vertices.push([0, a, b], [a, b, 0], [b, 0, a]);
    }
  }
  // Kenar uzunluğu 2: birbirine 2 uzaklıktaki üçlüler yüz.
  const isEdge = (i: number, j: number) => Math.abs(length(sub(vertices[i]!, vertices[j]!)) - 2) < 1e-6;
  const faces: [number, number, number][] = [];
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      for (let k = j + 1; k < 12; k++) {
        if (isEdge(i, j) && isEdge(j, k) && isEdge(i, k)) faces.push([i, j, k]);
      }
    }
  }
  return { vertices, faces };
}

/** Dışarıdan bakınca saat yönünün tersine (normal dışa) olacak şekilde sıralar. */
function orientOutward(vs: Vec3[]): Vec3[] {
  const c = centroid(vs);
  const n = cross(sub(vs[1]!, vs[0]!), sub(vs[2]!, vs[0]!));
  return dot(n, c) < 0 ? [...vs].reverse() : vs;
}

/** Birim küreye oturan 32 panel (beşgenler önce). */
export function truncatedIcosahedron(): BallFace[] {
  const { vertices: V, faces: F } = icosahedron();
  const at = (i: number, j: number) => normalize(lerp(V[i]!, V[j]!, 1 / 3));
  const faces: BallFace[] = [];

  for (let v = 0; v < 12; v++) {
    const axis = normalize(V[v]!);
    const neighbors = V.map((_, i) => i).filter((i) => i !== v && Math.abs(length(sub(V[i]!, V[v]!)) - 2) < 1e-6);
    // Komşuları köşe ekseni çevresinde açıya göre sırala.
    const ref = normalize(sub(V[neighbors[0]!]!, scale(axis, dot(V[neighbors[0]!]!, axis))));
    const ref2 = cross(axis, ref);
    const pts = neighbors
      .map((n) => {
        const p = at(v, n);
        return { p, angle: Math.atan2(dot(p, ref2), dot(p, ref)) };
      })
      .sort((a, b) => a.angle - b.angle)
      .map((x) => x.p);
    faces.push({ kind: 'pentagon', vertices: orientOutward(pts) });
  }

  for (const [a, b, c] of F) {
    const pts = [at(a, b), at(b, a), at(b, c), at(c, b), at(c, a), at(a, c)];
    faces.push({ kind: 'hexagon', vertices: orientOutward(pts) });
  }
  return faces;
}

export type PanelMesh = {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
};

export type PanelOptions = {
  radius: number;
  /** Panel, merkezine doğru bu oranda küçülür → aralarda dikiş boşluğu (iç küre görünür). */
  inset: number;
  /** Her yelpaze üçgeninin alt bölme sayısı (küreye oturması için). */
  subdivisions: number;
  /** Panel ortası kenarlarına göre bu oranda dışarı şişer. */
  puff: number;
};

/**
 * Tek panelin üçgen ağı: merkezden yelpaze, her üçgen `subdivisions` ile bölünüp küreye izdüşürülür. UV: panel
 * düzleminde, çevrel çember [0,1] karesine (logo dokusu ortada).
 */
export function panelMesh(face: BallFace, opts: PanelOptions): PanelMesh {
  const { radius, inset, subdivisions: n, puff } = opts;
  const c = centroid(face.vertices);
  const normal = normalize(c);
  const corners = face.vertices.map((v) => lerp(c, v, inset));
  const circum = length(sub(corners[0]!, c));
  const u = normalize(sub(corners[0]!, c));
  const w = cross(normal, u);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const pushPoint = (p: Vec3) => {
    const d = sub(p, c);
    const radial = Math.min(1, length(d) / circum);
    const r = radius * (1 + puff * (1 - radial * radial));
    const s = normalize(p);
    positions.push(s[0] * r, s[1] * r, s[2] * r);
    normals.push(s[0], s[1], s[2]);
    uvs.push(0.5 + (0.5 * dot(d, u)) / circum, 0.5 + (0.5 * dot(d, w)) / circum);
    return positions.length / 3 - 1;
  };

  for (let k = 0; k < corners.length; k++) {
    const a = corners[k]!;
    const b = corners[(k + 1) % corners.length]!;
    // Üçgen (c, a, b) içinde barisentrik ızgara: satır i (0..n), satırda i+1 nokta.
    const rows: number[][] = [];
    for (let i = 0; i <= n; i++) {
      const row: number[] = [];
      for (let j = 0; j <= i; j++) {
        const pa = i === 0 ? 0 : (i - j) / n;
        const pb = i === 0 ? 0 : j / n;
        const p = add(add(scale(c, 1 - pa - pb), scale(a, pa)), scale(b, pb));
        row.push(pushPoint(p));
      }
      rows.push(row);
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        indices.push(rows[i]![j]!, rows[i + 1]![j]!, rows[i + 1]![j + 1]!);
        if (j < i) indices.push(rows[i]![j]!, rows[i + 1]![j + 1]!, rows[i]![j + 1]!);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint16Array(indices),
  };
}

/** Panel merkezinin birim yönü (ör. logo panellerini topun üzerine dengeli dağıtmak için). */
export function faceDirection(face: BallFace): Vec3 {
  return normalize(centroid(face.vertices));
}

/**
 * Logo taşıyacak altıgenler: birbirinden olabildiğince uzak `count` altıgen (en uzak nokta örneklemesi) → logolar
 * topun her yanına dağılır, yan yana yığılmaz. Belirlenimci (ilk seçim sabit).
 */
export function pickSpreadHexagons(faces: BallFace[], count: number): number[] {
  const hex = faces.map((f, i) => ({ i, d: faceDirection(f), hex: f.kind === 'hexagon' })).filter((x) => x.hex);
  if (count <= 0 || hex.length === 0) return [];
  const chosen = [hex[0]!];
  while (chosen.length < Math.min(count, hex.length)) {
    let best = hex[0]!;
    let bestScore = -Infinity;
    for (const h of hex) {
      if (chosen.includes(h)) continue;
      // En yakın seçili panele açısal uzaklık (büyük = iyi).
      const score = Math.min(...chosen.map((c) => -dot(c.d, h.d)));
      if (score > bestScore) {
        bestScore = score;
        best = h;
      }
    }
    chosen.push(best);
  }
  return chosen.map((c) => c.i);
}

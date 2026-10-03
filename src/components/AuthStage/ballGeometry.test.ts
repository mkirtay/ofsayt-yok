import { describe, expect, it } from 'vitest';
import { faceDirection, panelMesh, pickSpreadHexagons, truncatedIcosahedron } from './ballGeometry';

const len = (v: number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);

describe('kesik ikosahedron', () => {
  const faces = truncatedIcosahedron();

  it('12 beşgen + 20 altıgen, 60 ayrı köşe, 90 kenar', () => {
    expect(faces.filter((f) => f.kind === 'pentagon' && f.vertices.length === 5)).toHaveLength(12);
    expect(faces.filter((f) => f.kind === 'hexagon' && f.vertices.length === 6)).toHaveLength(20);
    const key = (v: number[]) => v.map((x) => x.toFixed(5)).join(',');
    const verts = new Set(faces.flatMap((f) => f.vertices.map(key)));
    expect(verts.size).toBe(60);
    const edges = new Set(
      faces.flatMap((f) => f.vertices.map((v, i) => [key(v), key(f.vertices[(i + 1) % f.vertices.length]!)].sort().join('|'))),
    );
    expect(edges.size).toBe(90);
  });

  it('köşeler birim kürede, yüzler dışa dönük (saat yönünün tersine)', () => {
    for (const f of faces) {
      for (const v of f.vertices) expect(len(v)).toBeCloseTo(1, 6);
      const [a, b, c] = f.vertices as unknown as [number[], number[], number[]];
      const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const ac = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const n = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!];
      const d = faceDirection(f);
      expect(n[0]! * d[0] + n[1]! * d[1] + n[2]! * d[2]).toBeGreaterThan(0);
    }
  });

  it('panel ağı: küreye oturur (şişkinlik payı içinde), UV [0,1], dizinler geçerli', () => {
    const m = panelMesh(faces[13]!, { radius: 2, inset: 0.95, subdivisions: 4, puff: 0.03 });
    const count = m.positions.length / 3;
    expect(count).toBe(6 * 15); // 6 yelpaze × (n+1)(n+2)/2
    for (let i = 0; i < count; i++) {
      const r = len([m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!]);
      expect(r).toBeGreaterThanOrEqual(2 - 1e-6);
      expect(r).toBeLessThanOrEqual(2 * 1.03 + 1e-6);
    }
    for (const uv of m.uvs) {
      expect(uv).toBeGreaterThanOrEqual(-1e-6);
      expect(uv).toBeLessThanOrEqual(1 + 1e-6);
    }
    expect(m.indices.length).toBe(6 * 16 * 3); // yelpaze başına n² üçgen
    expect(Math.max(...m.indices)).toBeLessThan(count);
  });

  it('logo altıgenleri: istenen sayıda, tekrarsız, yalnız altıgen ve dağınık', () => {
    const picked = pickSpreadHexagons(faces, 12);
    expect(new Set(picked).size).toBe(12);
    for (const i of picked) expect(faces[i]!.kind).toBe('hexagon');
    // Seçimler yayılır: ilk altısında hiçbir ikili komşu altıgen değil (komşuların yön çarpımı √5/3 ≈ 0,745).
    const dirs = picked.slice(0, 6).map((i) => faceDirection(faces[i]!));
    for (let a = 0; a < dirs.length; a++) {
      for (let b = a + 1; b < dirs.length; b++) {
        const dot = dirs[a]![0] * dirs[b]![0] + dirs[a]![1] * dirs[b]![1] + dirs[a]![2] * dirs[b]![2];
        expect(dot).toBeLessThan(0.7);
      }
    }
    expect(pickSpreadHexagons(faces, 0)).toEqual([]);
    expect(pickSpreadHexagons(faces, 40)).toHaveLength(20);
  });
});

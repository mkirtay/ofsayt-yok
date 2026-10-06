/**
 * Frikik figürleri (yalnız görsel; fizik sim.ts'teki silindirlerdir): insan oranlı baraj oyuncusu (kollar göğüste
 * kavuşturulmuş, bacak / gövde / baş ayrı) ve kaleci (hazır duruş: dizler kırık, gövde önde, kollar yanda açık; vuruşta
 * tahminine doğru dalış animasyonu). Düşük poligon: her figür ~10 mesh, paylaşılan geometri ve malzemeler.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material } from 'three';

export type FigureColors = { kit: number; shorts: number; skin: number; hair: number; socks: number };

export type Figure = {
  group: Group;
  /** Kaleci dalışı için oynatılan parçalar. */
  body: Group;
  armL: Group;
  armR: Group;
  legL: Group;
  legR: Group;
};

/** Paylaşılan geometriler (bir kez üretilir, `geos` listesine eklenir). */
type Shared = {
  leg: CylinderGeometry;
  arm: CylinderGeometry;
  forearm: CylinderGeometry;
  torso: CylinderGeometry;
  shorts: BoxGeometry;
  head: SphereGeometry;
  hair: SphereGeometry;
  boot: BoxGeometry;
  glove: SphereGeometry;
};

export function makeShared(geos: BufferGeometry[]): Shared {
  const s: Shared = {
    leg: new CylinderGeometry(0.06, 0.075, 0.78, 10),
    arm: new CylinderGeometry(0.045, 0.055, 0.3, 8),
    forearm: new CylinderGeometry(0.04, 0.05, 0.3, 8),
    torso: new CylinderGeometry(0.22, 0.17, 0.56, 14),
    shorts: new BoxGeometry(0.26, 0.24, 0.38),
    head: new SphereGeometry(0.115, 14, 10),
    hair: new SphereGeometry(0.12, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    boot: new BoxGeometry(0.22, 0.09, 0.11),
    glove: new SphereGeometry(0.075, 10, 8),
  };
  geos.push(...Object.values(s));
  return s;
}

/**
 * Figür önü −x'e bakar (toptan gelen şuta karşı). Yükseklik ~1,78 m (baraj) / ~1,9 m (kaleci). `group` yerde (y = 0).
 * `height` fiziksel silindir yüksekliğiyle uyumlu olsun diye ölçeklenir.
 */
export function makeFigure(shared: Shared, colors: FigureColors, keeper: boolean, mats: Material[], height: number): Figure {
  const group = new Group();
  const body = new Group();
  group.add(body);
  const mat = (color: number, roughness = 0.6) => {
    const m = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    mats.push(m);
    return m;
  };
  const kit = mat(colors.kit);
  const shorts = mat(colors.shorts);
  const skin = mat(colors.skin, 0.5);
  const hair = mat(colors.hair, 0.7);
  const socks = mat(colors.socks);
  const dark = mat(0x151a22, 0.5);
  const add = (parent: Group, geo: BufferGeometry, m: Material, x: number, y: number, z: number) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  // Bacaklar: kalça eklemi grupları (y 0,86), silindir aşağı sarkar; botlar
  const leg = (z: number) => {
    const g = new Group();
    g.position.set(0, 0.86, z);
    add(g, shared.leg, socks, 0, -0.39, 0);
    add(g, shared.boot, dark, -0.04, -0.82, 0);
    body.add(g);
    return g;
  };
  const legL = leg(-0.11);
  const legR = leg(0.11);
  // Şort, gövde (göğüs geniş, bel dar; omuz genişliği için z'de biraz geniş), baş + saç
  add(body, shared.shorts, shorts, 0, 0.92, 0);
  const torso = add(body, shared.torso, kit, 0, 1.3, 0);
  torso.scale.set(0.72, 1, 1.15);
  add(body, shared.head, skin, 0, 1.72, 0);
  const hairMesh = add(body, shared.hair, hair, 0, 1.735, 0);
  hairMesh.rotation.x = -0.25;
  // Kollar: omuz eklemi grupları (y 1,5, z ±0,25); üst kol + ön kol + el
  const arm = (z: number, sign: number) => {
    const g = new Group();
    g.position.set(0, 1.5, z);
    add(g, shared.arm, kit, 0, -0.15, 0);
    const fore = new Group();
    fore.position.set(0, -0.3, 0);
    add(fore, shared.forearm, skin, 0, -0.15, 0);
    add(fore, keeper ? shared.glove : shared.head, keeper ? mat(colors.socks, 0.4) : skin, 0, -0.32, 0).scale.setScalar(keeper ? 1 : 0.45);
    g.add(fore);
    if (keeper) {
      // Hazır duruş: üst kol yana-öne açık, ön kol öne kırık, avuçlar ileri
      g.rotation.set(0.35, 0, sign * 0.55);
      fore.rotation.x = -1.1;
    } else {
      // Kavuşturulmuş kollar: üst kol hafif öne, ön kol göğüs önünde yatay
      g.rotation.set(0.5, 0, sign * 0.1);
      fore.rotation.set(-1.75, 0, sign * -1.25);
    }
    body.add(g);
    return g;
  };
  const armL = arm(-0.25, -1);
  const armR = arm(0.25, 1);
  if (keeper) {
    // Dizler kırık, gövde öne eğik
    legL.rotation.x = legR.rotation.x = -0.15;
    body.rotation.x = -0.18;
    body.position.y = -0.03;
  }
  group.scale.setScalar(height / 1.8);
  return { group, body, armL, armR, legL, legR };
}

/**
 * Kaleci dalışı: `p` 0→1 (vuruştan sonra), `dir` −1 / +1 (sola / sağa, dünya z). Gövde yana yatar, kollar o yöne
 * uzanır, bacaklar açılır; `p` 1'de poz tutulur. `p` 0 hazır duruşa döner.
 */
export function poseKeeperDive(f: Figure, p: number, dir: number): void {
  const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
  f.body.rotation.set(-0.18 - 0.25 * e, 0, dir * 1.15 * e);
  f.body.position.y = -0.03 + 0.12 * Math.sin(Math.PI * Math.min(1, p * 1.2));
  const lead = dir > 0 ? f.armR : f.armL;
  const trail = dir > 0 ? f.armL : f.armR;
  lead.rotation.set(0.35 - 0.6 * e, 0, dir * (0.55 + 2.2 * e));
  trail.rotation.set(0.35 + 0.3 * e, 0, -dir * (0.55 - 0.9 * e));
  f.legL.rotation.set(-0.15 - 0.3 * e, 0, -0.35 * e);
  f.legR.rotation.set(-0.15 - 0.3 * e, 0, 0.35 * e);
}

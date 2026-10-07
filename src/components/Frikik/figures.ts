/**
 * Frikik figürleri (yalnız görsel; fizik sim.ts'teki silindirlerdir): insan oranlı baraj oyuncusu (kollar göğüste
 * kavuşturulmuş, bacak / gövde / baş ayrı) ve kaleci (hazır duruş: dizler kırık, gövde önde, kollar yanda açık; vuruşta
 * `setKeeperPose` ile yan adım / uzanma / dalış). Düşük poligon: her figür ~10 mesh, paylaşılan geometri ve malzemeler.
 *
 * Eksenler: figür önü −x. Euler sırası XYZ (önce Z, sonra Y, sonra X uygulanır). Gövde / uzuv için: rotation.z =
 * öne-arkaya (pozitif: öne / −x), rotation.x = yana (pozitif: baş / uzuv +z'ye).
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, type BufferGeometry, type Material } from 'three';

export type FigureColors = { kit: number; shorts: number; skin: number; hair: number; socks: number; glove?: number };

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
    glove: new SphereGeometry(0.11, 12, 9),
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
    add(fore, keeper ? shared.glove : shared.head, keeper ? mat(colors.glove ?? 0xff7a1a, 0.45) : skin, 0, -0.3, 0).scale.setScalar(keeper ? 1 : 0.45);
    g.add(fore);
    if (!keeper) {
      // Kavuşturulmuş kollar: üst kol öne, ön kol göğüs önünde yatay (önce −x'e çevrilir, sonra y ekseninde yana süpürülür)
      g.rotation.set(0, 0, -0.5);
      fore.rotation.set(0, -sign * 1.2, -1.57);
    }
    body.add(g);
    return g;
  };
  const armL = arm(-0.25, -1);
  const armR = arm(0.25, 1);
  const fig = { group, body, armL, armR, legL, legR };
  if (keeper) setKeeperPose(fig, { crouch: 0.35, tilt: 0, lift: 0, dir: 1, reach: 0 });
  group.scale.setScalar(height / 1.8);
  return fig;
}

export type KeeperPose = {
  /** Çömelme 0–1 (dizler kırık, gövde önde, alçalır). */
  crouch: number;
  /** Yana yatış (rad, 0 = dik; 1,3 ≈ yerde uzanmış). Gövde ayak bileğinden döner. */
  tilt: number;
  /** Yerden yükselme (m, figür ölçeğinde): dalış havadayken > 0, inince 0. */
  lift: number;
  /** Hamle yönü (dünya z): −1 sol, +1 sağ. */
  dir: number;
  /** Öndeki kolun yana uzanması 0–1 (0: hazır duruş, 1: tam uzanmış). */
  reach: number;
  /** Dalışta kollar: 0 omuz hizasında (gövdeye dik), 1 gövde boyunca yukarı. Verilmezse 1. */
  armUp?: number;
};

/** Kaleci pozu: hazır duruş (crouch .35), yan adım + uzanma (reach), dalış (tilt + lift). Ayaklar grup orijininde. */
export function setKeeperPose(f: Figure, p: KeeperPose): void {
  const dir = p.dir >= 0 ? 1 : -1;
  // Gövde: öne eğim (çömelmeyle artar) + yana yatış; çömelirken alçalır
  f.body.rotation.set(dir * p.tilt, 0, 0.12 + 0.3 * p.crouch);
  f.body.position.y = p.lift - 0.14 * p.crouch - 0.02;
  // Bacaklar: dizler kırık (geriye), çömelince açık; dalışta hafif bükülü ve kapalı
  const spread = 0.12 + 0.3 * p.crouch;
  f.legL.rotation.set(spread * (1 - p.tilt / 1.3), 0, 0.25 + 0.35 * p.crouch);
  f.legR.rotation.set(-spread * (1 - p.tilt / 1.3), 0, 0.25 + 0.35 * p.crouch);
  // Kollar: hazırda yana-öne açık, ön kol öne kırık; uzanmada öndeki kol yana yukarı; dalışta iki kol gövde boyunca
  // "yukarı" (gövde yattığı için dünyada dalış yönüne) uzanır
  const lead = dir > 0 ? f.armR : f.armL;
  const trail = dir > 0 ? f.armL : f.armR;
  const t = Math.min(1, p.tilt / 1.3);
  // Dalışta kol açısı: armUp 0 → gövdeye dik (π/2), 1 → gövde boyunca yukarı (0,92π)
  const up = p.armUp ?? 1;
  const diveLead = Math.PI * 0.5 + (Math.PI * 0.92 - Math.PI * 0.5) * up;
  const diveTrail = Math.PI * 0.45 + (Math.PI * 0.72 - Math.PI * 0.45) * up;
  const leadSide = 0.55 + 1.6 * p.reach + (diveLead - 0.55 - 1.6 * p.reach) * t;
  const trailSide = 0.55 - 0.35 * p.reach + (diveTrail - 0.55 + 0.35 * p.reach) * t;
  lead.rotation.set(-dir * Math.min(leadSide, Math.PI * 0.92), 0, -0.35 * (1 - t));
  trail.rotation.set(dir * trailSide, 0, -0.35 * (1 - t));
  const leadFore = lead.children[1] as Group;
  const trailFore = trail.children[1] as Group;
  leadFore.rotation.set(0, 0, -1.0 * (1 - p.reach) * (1 - t) - 0.05);
  trailFore.rotation.set(0, 0, -1.0 * (1 - t) - 0.05);
}

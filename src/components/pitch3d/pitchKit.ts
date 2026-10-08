/**
 * three.js saha yapı taşları — giriş sahnesi (components/AuthStage) ve /frikik oyunu (components/Frikik) ortak kullanır:
 * dokular (çim, parıltı, gölge, pano), malzemeler (huzme, kenar parlaması), top (kesik ikosahedron + lig logoları),
 * kale (direkler + file + dalga), nişan oku. Yalnız dinamik import edilen sahne modüllerinden içe aktarılır →
 * three.js ilk yüke ve diğer sayfalara girmez.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  OneFactor,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  RepeatWrapping,
  ShaderMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SrcAlphaFactor,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
  ZeroFactor,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GoalSpec, V3 } from '@/lib/pitchPhysics/core';
import { panelMesh, pickSpreadHexagons, truncatedIcosahedron, type PanelMesh } from './ballGeometry';
import { originalLogoSrc } from '@/utils/logoUrl';

/**
 * Işık (huzme, hale, partikül, kenar parlaması): yalnız renk eklenir, tuvalin alfası değişmez. Tuval saydam ve CSS
 * zeminin üstünde: hazır AdditiveBlending alfayı da artırdığından açık (gündüz) zeminde ışık KARARTIYORDU.
 */
export const LIGHT_BLEND = {
  blending: CustomBlending,
  blendSrc: SrcAlphaFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

export function mergePanels(meshes: PanelMesh[]): BufferGeometry {
  const vCount = meshes.reduce((n, m) => n + m.positions.length / 3, 0);
  const iCount = meshes.reduce((n, m) => n + m.indices.length, 0);
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const indices = new Uint32Array(iCount);
  let v = 0;
  let i = 0;
  for (const m of meshes) {
    positions.set(m.positions, v * 3);
    normals.set(m.normals, v * 3);
    uvs.set(m.uvs, v * 2);
    for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k]! + v;
    v += m.positions.length / 3;
    i += m.indices.length;
  }
  return toGeometry(positions, normals, uvs, indices);
}

export function toGeometry(positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(new BufferAttribute(indices, 1));
  return g;
}

export function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Yumuşak ışık noktası (partikül, lamba, hale). */
export function glowTexture(inner: string, outer: string): CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, inner);
    g.addColorStop(0.35, outer);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Bulut: üst üste binen yumuşak beyaz daireler. */
export function cloudTexture(): CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    for (const [x, y, r] of [
      [0.3, 0.6, 0.15],
      [0.48, 0.5, 0.2],
      [0.67, 0.58, 0.15],
      [0.4, 0.66, 0.14],
      [0.58, 0.67, 0.14],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Kenar parlaması: bakış açısına dik kenarlarda artan, eklemeli renk (fresnel). */
export function rimMaterial(color: number, power: number, intensity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uPower: { value: power }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), uPower) * uIntensity;
        gl_FragColor = vec4(uColor * f, f);
      }`,
    transparent: true,
    depthWrite: false,
    ...LIGHT_BLEND,
  });
}

/** Projektör huzmesi: lambada parlak, uzaklaştıkça ve kenarlarda sönen açık koni. */
export function beamMaterial(color: number, intensity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vAlong = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying float vAlong;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
        float a = uIntensity * pow(vAlong, 1.25) * edge;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    ...LIGHT_BLEND,
  });
}

/** Logo dokusu: panel beyazı + ortada logo (oranı korunur). */
export function drawLogo(img: HTMLImageElement): CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(0, 0, s, s);
    // Küçük topta da seçilsin: logo panelin iç çemberine yakın (altıgen iç çemberi kare kenarının ~%87'si).
    const box = s * 0.64;
    const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
  });
}
/** Çim karosu: iki biçme şeridi (açık / koyu) + ince ot dokusu. Kenarlar sarar (RepeatWrapping). */
export function grassTexture(size: number): CanvasTexture {
  const tex = canvasTexture(size, (ctx, s) => {
    ctx.fillStyle = '#367f33';
    ctx.fillRect(0, 0, s / 2, s);
    ctx.fillStyle = '#2d6f2b';
    ctx.fillRect(s / 2, 0, s / 2, s);
    // Ot dokusu: kısa, hafif eğik çizgiler (sarmalı: kenara taşan çizgi karşı kenarda da çizilir).
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const strokes = Math.round(s * s * 0.012);
    for (let i = 0; i < strokes; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const len = 2 + rnd() * (s / 96);
      const light = rnd() > 0.5;
      ctx.strokeStyle = light ? `rgba(120,190,100,${0.18 + rnd() * 0.2})` : `rgba(20,70,25,${0.15 + rnd() * 0.2})`;
      ctx.lineWidth = 1;
      for (const [ox, oy] of [
        [0, 0],
        [-s, 0],
        [0, -s],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + (rnd() - 0.5) * 2, y + oy - len);
        ctx.stroke();
      }
    }
  });
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  return tex;
}

/** Zemin saydamlığı: yakında opak, uzak kenara doğru gökyüzüne silinir (v = 1 uzak kenar). */
export function groundAlphaTexture(): CanvasTexture {
  const tex = canvasTexture(64, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#000');
    g.addColorStop(0.3, '#fff');
    g.addColorStop(1, '#fff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
  tex.colorSpace = NoColorSpace;
  return tex;
}

/** Yumuşak gölge lekesi. */
export function shadowTexture(): CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/** Reklam panosu: marka yeşili zemin, "OFSAYT YOK" yazısı, sarı vurgu şeridi (yatayda tekrar eder). */
export function boardTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#00b578');
    g.addColorStop(1, '#00704c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 128);
    ctx.fillStyle = '#ffc83d';
    ctx.fillRect(0, 112, 1024, 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 900 64px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('OFSAYT YOK', 256, 58);
    ctx.fillText('OFSAYT YOK', 768, 58);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const x of [0, 512, 1024]) ctx.fillRect(x - 3, 30, 6, 56);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  return tex;
}

/** Nişan oku (zemin düzleminde, +x yönünde): gövde boyu `setLength` ile değişir, uç sabit boyutta. */
export function makeArrow(mat: Material) {
  const width = 0.22;
  const headLen = 0.5;
  const headW = 0.62;
  const shaftGeo = new PlaneGeometry(1, width);
  shaftGeo.translate(0.5, 0, 0);
  const head = new Shape();
  head.moveTo(0, -headW / 2);
  head.lineTo(headLen, 0);
  head.lineTo(0, headW / 2);
  head.closePath();
  const headGeo = new ShapeGeometry(head);
  const flat = new Group();
  flat.rotation.x = -Math.PI / 2;
  const shaft = new Mesh(shaftGeo, mat);
  const tip = new Mesh(headGeo, mat);
  flat.add(shaft, tip);
  const group = new Group();
  group.add(flat);
  group.visible = false;
  for (const m of [shaft, tip]) m.renderOrder = 3;
  return {
    group,
    geometries: [shaftGeo, headGeo],
    /** start: topun merkezinden uzaklık; len: gövde boyu */
    set(start: number, len: number) {
      shaft.position.x = start;
      shaft.scale.x = Math.max(0.01, len);
      tip.position.x = start + len;
    },
  };
}

export type GoalView = {
  spec: GoalSpec;
  group: Group;
  geometries: BufferGeometry[];
  net: BufferGeometry;
  /** Filenin dalgasız köşeleri (dalga bunun üstüne yazılır). */
  base: Float32Array;
  ripple: { t: number; at: V3; dir: V3; amp: number } | null;
};

/**
 * Çimin üstünde 3D kale: iki direk (z = ±halfW), üst direk, arka çerçeve, file (arka, iki yan, arkaya inen çatı).
 * File çizgileri kısa parçalara bölünür → dalga yumuşak görünür.
 */
export function buildGoal(spec: GoalSpec, postMat: Material, netMat: LineBasicMaterial): GoalView {
  const { lineX, backX, halfW, height, backHeight, postR } = spec;
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const postGeo = new CylinderGeometry(postR, postR, height, 12);
  postGeo.translate(0, height / 2, 0);
  const barGeo = new CylinderGeometry(postR, postR, halfW * 2 + postR * 2, 12);
  const backGeo = new CylinderGeometry(postR * 0.5, postR * 0.5, backHeight, 8);
  backGeo.translate(0, backHeight / 2, 0);
  geometries.push(postGeo, barGeo, backGeo);
  for (const z of [-halfW, halfW]) {
    const post = new Mesh(postGeo, postMat);
    post.position.set(lineX, 0, z);
    const back = new Mesh(backGeo, postMat);
    back.position.set(backX, 0, z);
    group.add(post, back);
  }
  const bar = new Mesh(barGeo, postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(lineX, height, 0);
  group.add(bar);

  const step = 0.14;
  const pts: number[] = [];
  type P = (u: number, v: number) => [number, number, number];
  const grid = (f: P, lenU: number, lenV: number) => {
    const nu = Math.max(2, Math.ceil(lenU / step));
    const nv = Math.max(2, Math.ceil(lenV / step));
    const line = (at: (t: number) => [number, number, number], n: number) => {
      for (let k = 0; k < n; k++) pts.push(...at(k / n), ...at((k + 1) / n));
    };
    for (let i = 0; i <= nu; i++) line((t) => f(i / nu, t), nv);
    for (let j = 0; j <= nv; j++) line((t) => f(t, j / nv), nu);
  };
  const depth = Math.abs(backX - lineX);
  const roofAt = (u: number) => height + (backHeight - height) * u;
  grid((u, v) => [backX, backHeight * v, -halfW + 2 * halfW * u], 2 * halfW, backHeight);
  for (const z of [-halfW, halfW]) grid((u, v) => [lineX + (backX - lineX) * u, roofAt(u) * v, z], depth, height);
  grid((u, v) => [lineX + (backX - lineX) * u, roofAt(u), -halfW + 2 * halfW * v], depth, 2 * halfW);
  const base = new Float32Array(pts);
  const net = new BufferGeometry();
  net.setAttribute('position', new BufferAttribute(new Float32Array(base), 3));
  geometries.push(net);
  const lines = new LineSegments(net, netMat);
  lines.renderOrder = 1;
  group.add(lines);
  return { spec, group, geometries, net, base, ripple: null };
}

/** File dalgası: çarpma noktası çevresinde çarpma yönünde sönümlü salınım. */
export function rippleNet(v: GoalView, dt: number) {
  const r = v.ripple;
  if (!r) return;
  r.t += dt;
  const attr = v.net.attributes.position as BufferAttribute;
  const out = attr.array as Float32Array;
  const done = r.t > 1.6;
  const wave = done ? 0 : r.amp * Math.sin(r.t * 14) * Math.exp(-r.t * 3);
  for (let i = 0; i < v.base.length; i += 3) {
    const x = v.base[i]!;
    const y = v.base[i + 1]!;
    const z = v.base[i + 2]!;
    const w = wave * Math.exp(-((x - r.at.x) ** 2 + (y - r.at.y) ** 2 + (z - r.at.z) ** 2) / 0.7);
    out[i] = x + r.dir.x * w;
    out[i + 1] = y + r.dir.y * w;
    out[i + 2] = z + r.dir.z * w;
  }
  attr.needsUpdate = true;
  if (done) v.ripple = null;
}


/** Oda ortamı yansıması (top kaplaması ve direkler için; malzemeye doğrudan verilir). Çağıran dispose eder. */
export function createEnvTexture(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const tex = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return tex;
}

export type BallView = {
  /** Konum / ölçek buna; dönüş `spin`'e uygulanır (kenar parlaması görüş açısına bağlı, dönmez). */
  group: Group;
  spin: Group;
  logoMaterials: (MeshPhysicalMaterial | MeshStandardMaterial)[];
  rimMat: ShaderMaterial;
  dispose: () => void;
};

/**
 * Birim yarıçaplı top: 12 beşgen marka yeşili, 20 altıgen beyaz; `logoCount` dağınık altıgen logo paneli (dokusu
 * `loadBallLogos` ile gelir). Mobilde (`lite`) ucuz standart malzeme; masaüstünde parlak kaplama + ortam yansıması.
 */
export function buildBall(opts: { lite: boolean; envTex: Texture | null; logoCount: number }): BallView {
  const { lite, envTex, logoCount } = opts;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const group = new Group();
  const spin = new Group();
  group.add(spin);
  const faces = truncatedIcosahedron();
  const panelOpts = { radius: 1, inset: 0.955, subdivisions: lite ? 3 : 5, puff: 0.03 };
  const logoFaces = new Set(pickSpreadHexagons(faces, logoCount));
  const physical = (color: number, extra: { roughness?: number; clearcoat?: number } = {}) =>
    track(
      lite
        ? new MeshStandardMaterial({ color, roughness: extra.roughness ?? 0.35, metalness: 0.05 })
        : new MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, envMap: envTex, envMapIntensity: 0.6, ...extra }),
    );
  spin.add(
    new Mesh(track(mergePanels(faces.filter((f, i) => f.kind === 'hexagon' && !logoFaces.has(i)).map((f) => panelMesh(f, panelOpts)))), physical(0xf4f6f8)),
    new Mesh(track(mergePanels(faces.filter((f) => f.kind === 'pentagon').map((f) => panelMesh(f, panelOpts)))), physical(0x005c3d)),
    new Mesh(track(new SphereGeometry(0.985, 40, 28)), physical(0x0b1511, { roughness: 0.85, clearcoat: 0 })),
  );
  const logoMaterials: (MeshPhysicalMaterial | MeshStandardMaterial)[] = [];
  for (const i of logoFaces) {
    const m = panelMesh(faces[i]!, panelOpts);
    const mat = physical(0xf4f6f8);
    logoMaterials.push(mat);
    spin.add(new Mesh(track(toGeometry(m.positions, m.normals, m.uvs, m.indices)), mat));
  }
  const rimMat = track(rimMaterial(0x5cf2c0, 2.4, 0.45));
  group.add(new Mesh(track(new SphereGeometry(1.03, 40, 28)), rimMat));
  return {
    group,
    spin,
    logoMaterials,
    rimMat,
    dispose() {
      for (const m of logoMaterials) m.map?.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Logo panellerinin dokularını yükler (aynı köken → doku CORS'a takılmaz; yüklenemeyen panel düz beyaz kalır).
 * `onLoad`: döngü duruyorsa çağıran yeniden çizsin.
 */
export function loadBallLogos(
  ball: BallView,
  urls: readonly string[],
  opts: { maxAnisotropy: number; isDisposed: () => boolean; onLoad: () => void },
): void {
  urls.forEach((url, k) => {
    const mat = ball.logoMaterials[k];
    if (!mat) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (opts.isDisposed() || !img.naturalWidth) return;
      try {
        const tex = drawLogo(img);
        tex.anisotropy = Math.min(4, opts.maxAnisotropy);
        mat.map = tex;
        mat.needsUpdate = true;
        opts.onLoad();
      } catch {
        // kirli tuval / bozuk görsel: panel düz kalır
      }
    };
    // Küçük sürüm ucu hata verirse (ör. sharp yüklenemedi) bir kez Sportmonks orijinali (CDN'de CORS *).
    img.onerror = () => {
      const original = originalLogoSrc(url);
      if (original && !opts.isDisposed()) {
        img.onerror = null;
        img.src = original;
      }
    };
    img.src = url;
  });
}

/** Gol konfetisi: kısa parçacık patlaması (yalnız görsel; Math.random serbest). */
export function makeConfetti(count: number, size: number, colors: readonly number[]) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    c.setHex(colors[i % colors.length]!);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  const mat = new PointsMaterial({ size, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false });
  const points = new Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  const DURATION = 1.6;
  let t = -1;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  return {
    points,
    /** `dirX`: parçacıkların savrulacağı x yönü (kaleden sahaya doğru). */
    burst(at: V3, dirX: number) {
      for (let i = 0; i < count; i++) {
        pos.set([at.x, at.y, at.z + rand(-0.6, 0.6)], i * 3);
        vel.set([dirX * rand(0.8, 4.5), rand(3, 8), rand(-2.5, 2.5)], i * 3);
      }
      t = 0;
      points.visible = true;
    },
    step(dt: number) {
      if (t < 0) return;
      t += dt;
      const drag = 1 / (1 + 0.9 * dt);
      for (let i = 0; i < count * 3; i += 3) {
        vel[i + 1]! -= 9 * dt;
        for (let k = 0; k < 3; k++) {
          vel[i + k]! *= drag;
          pos[i + k]! += vel[i + k]! * dt;
        }
      }
      geo.attributes.position!.needsUpdate = true;
      mat.opacity = t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / (DURATION - 0.9));
      if (t >= DURATION) {
        t = -1;
        points.visible = false;
      }
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}

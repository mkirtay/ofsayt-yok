/**
 * Giriş / kayıt sahnesi (three.js). Yalnız `AuthStage` dinamik olarak yükler → three.js bu iki sayfanın sonradan
 * gelen parçasında kalır, ilk yüke ve diğer sayfalara girmez.
 *
 * Sahne: kamera sahaya ~30° yukarıdan bakar. Dokulu çim (biçme şeritleri), perspektifli saha çizgileri, sahanın iki
 * ucunda derin fileli kaleler (mobilde tek); uzak çim gökyüzüne doğru silinir. Top çimin üstünde durur, altında
 * yüksekliğe göre değişen yumuşak gölge. Tema: koyu temada gece (projektör huzmeleri, sis, ışık partikülleri), açık
 * temada gündüz (güneş, yumuşak huzmeler, bulutlar); değişince renkler yeniden kurulmadan yumuşakça geçer.
 * Etkileşim (stageMotion.ts): topu tut-sürükle-bırak → yön ve güç işaretçi hareketinden; top yay çizer, sekip
 * yuvarlanır, durduğu yerde kalır. Gol: file dalgası + "GOL!" + konfeti, 1,5 sn sonra top başlama noktasına; 10 sn
 * görünür alan dışında kalan top da döner. Fareyle hafif paralaks.
 *
 * Hareketi azalt: tek kare çizilir, döngü ve etkileşim yok. Sekme gizliyken / sahne ekran dışındayken döngü durur.
 * `dispose()` bütün GPU kaynaklarını bırakır ve eklediği öğeleri kaldırır.
 */
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CustomBlending,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  OneFactor,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SrcAlphaFactor,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
  ZeroFactor,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { logoSrc } from '@/utils/logoUrl';
import { panelMesh, pickSpreadHexagons, truncatedIcosahedron, type PanelMesh } from './ballGeometry';
import {
  BALL_RADIUS,
  DEFAULT_GOAL,
  GOAL_RESET_SEC,
  OFFSCREEN_RESET_SEC,
  approach,
  goalSpecs,
  mix,
  mixColor,
  offscreenTime,
  parallaxTarget,
  pickLogoIds,
  restingBall,
  rollingSpin,
  shadowFor,
  stepBall,
  throwVelocity,
  type Ball,
  type DragSample,
  type GoalSpec,
  type V3,
} from './stageMotion';

export type StageOptions = {
  /** prefers-reduced-motion: tek kare, etkileşim yok. */
  reduced: boolean;
  /** Mobil: tek kale, kamera daha yakın; daha az partikül / logo / huzme, düşük pixelRatio, ortam yansıması yok. */
  lite: boolean;
  /** Eklenen öğelerin sınıfları (CSS modülü çağıranda). */
  canvasClassName: string;
  handleClassName: string;
  goalClassName: string;
  /** Gol yazısı (dile göre: "GOL!" / "GOAL!"). */
  goalLabel: string;
};

export type StageHandle = { dispose: () => void };

/** Süper Lig her zaman topta; kalan logolar 34 ligden karışık. */
const PINNED_LEAGUE_IDS = [600];
const FOV = 35;
/** Kameranın yere bakış açısı (derece) ve baktığı yükseklik. */
const TILT_DEG = 30;
const TARGET_Y = 0.35;
const POP_SEC = 0.35;
const CONFETTI_SEC = 1.6;
/** Tutulan top bu kadar havaya kalkar (bırakınca düşüp seker). */
const LIFT = 0.4;
/** Çim düzlemi: yakın kenar z, uzak kenar z (uzakta gökyüzüne silinir). */
const GROUND_NEAR_Z = 14;
const GROUND_FAR_Z = -16;
/** Saha çizgileri: kale çizgileri ±lineX, kenar çizgileri ±TOUCH_Z. */
const TOUCH_Z = 4.6;
const LINES_HALF_X = DEFAULT_GOAL.lineX + 0.7;
const LINES_HALF_Z = TOUCH_Z + 0.6;

const BRAND_GREEN = 0x00a76f;
const NIGHT_FOG = 0x060a14;
const DAY_FOG = 0xd3e8f2;
const CONFETTI_COLORS = [0x00a76f, 0x2fe3a0, 0xffffff, 0xffc83d, 0x007b55];

/**
 * Işık (huzme, hale, partikül, kenar parlaması): yalnız renk eklenir, tuvalin alfası değişmez. Tuval saydam ve CSS
 * zeminin üstünde: hazır AdditiveBlending alfayı da artırdığından açık (gündüz) zeminde ışık KARARTIYORDU.
 */
const LIGHT_BLEND = {
  blending: CustomBlending,
  blendSrc: SrcAlphaFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
} as const;

function mergePanels(meshes: PanelMesh[]): BufferGeometry {
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

function toGeometry(positions: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array | Uint32Array) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(positions, 3));
  g.setAttribute('normal', new BufferAttribute(normals, 3));
  g.setAttribute('uv', new BufferAttribute(uvs, 2));
  g.setIndex(new BufferAttribute(indices, 1));
  return g;
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
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
function glowTexture(inner: string, outer: string): CanvasTexture {
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
function cloudTexture(): CanvasTexture {
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
function rimMaterial(color: number, power: number, intensity: number): ShaderMaterial {
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
function beamMaterial(color: number, intensity: number): ShaderMaterial {
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
function drawLogo(img: HTMLImageElement): CanvasTexture {
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
function grassTexture(size: number): CanvasTexture {
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

/** Saha çizgileri (saydam zemin üstüne beyaz): kale / kenar / orta çizgi, orta yuvarlak, ceza ve kale alanları. */
function pitchLinesTexture(size: number): CanvasTexture {
  return canvasTexture(size, (ctx, s) => {
    const k = s / (2 * LINES_HALF_X); // px / birim (kare doku: z ekseni de aynı ölçek, aşağıda sıkıştırılır)
    const kz = s / (2 * LINES_HALF_Z);
    const X = (x: number) => (x + LINES_HALF_X) * k;
    const Z = (z: number) => (z + LINES_HALF_Z) * kz;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, 0.055 * k);
    const L = DEFAULT_GOAL.lineX;
    const rect = (x0: number, z0: number, x1: number, z1: number) => ctx.strokeRect(X(x0), Z(z0), X(x1) - X(x0), Z(z1) - Z(z0));
    rect(-L, -TOUCH_Z, L, TOUCH_Z);
    ctx.beginPath();
    ctx.moveTo(X(0), Z(-TOUCH_Z));
    ctx.lineTo(X(0), Z(TOUCH_Z));
    ctx.stroke();
    const ellipse = (cx: number, cz: number, r: number, a0 = 0, a1 = Math.PI * 2) => {
      ctx.beginPath();
      ctx.ellipse(X(cx), Z(cz), r * k, r * kz, 0, a0, a1);
      ctx.stroke();
    };
    ellipse(0, 0, 1.3);
    const dot = (x: number, z: number) => {
      ctx.beginPath();
      ctx.ellipse(X(x), Z(z), 0.07 * k, 0.07 * kz, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    };
    dot(0, 0);
    for (const side of [-1, 1]) {
      const gx = side * L;
      rect(Math.min(gx, gx - side * 1.9), -3.9, Math.max(gx, gx - side * 1.9), 3.9);
      rect(Math.min(gx, gx - side * 0.7), -2.9, Math.max(gx, gx - side * 0.7), 2.9);
      dot(gx - side * 1.35, 0);
      // Ceza yayı: ceza alanının dışında kalan kısım
      const a = Math.acos(0.55 / 1.1);
      const start = side > 0 ? Math.PI - a : -a;
      ellipse(gx - side * 1.35, 0, 1.1, start, start + 2 * a);
    }
  });
}

/** Zemin saydamlığı: yakında opak, uzak kenara doğru gökyüzüne silinir (v = 1 uzak kenar). */
function groundAlphaTexture(): CanvasTexture {
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
function shadowTexture(): CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

type GoalView = {
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
function buildGoal(spec: GoalSpec, postMat: Material, netMat: LineBasicMaterial): GoalView {
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
function rippleNet(v: GoalView, dt: number) {
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

export function mountStage(host: HTMLElement, opts: StageOptions): StageHandle {
  const { reduced, lite } = opts;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  let disposed = false;
  const R = BALL_RADIUS;

  // Mobil bant küçük: MSAA ucuz, kapalıyken çizgiler tırtıklı → her iki düzende açık.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = opts.canvasClassName;
  host.appendChild(canvas);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const handle = document.createElement('div');
  handle.className = opts.handleClassName;
  const goalText = document.createElement('div');
  goalText.className = opts.goalClassName;
  goalText.textContent = opts.goalLabel;
  if (!reduced) host.append(handle, goalText);

  const scene = new Scene();
  const fog = new Fog(NIGHT_FOG, 20, 46);
  scene.fog = fog;
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 120);
  scene.add(camera); // gökyüzü süsleri kameraya bağlı (ufuk bandında sabit dururlar)

  // Işık: tepe ışığı + ana ışık (gece soğuk projektör, gündüz güneş) + marka yeşili kenar ışığı; masaüstünde oda
  // ortamı yansıması (top kaplaması).
  const hemi = new HemisphereLight(0x9fb4ff, 0x05080f, 1);
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(4, 9, 6);
  const rimLight = new DirectionalLight(BRAND_GREEN, 1.4);
  rimLight.position.set(-6, 4, -8);
  scene.add(hemi, key, rimLight);
  // Oda ortamı yansıması yalnız top ve direklerde (malzemeye doğrudan; scene.environment çimi de aydınlatıyordu ve
  // r163+ malzeme şiddetini yok sayıyor). Mobilde yok.
  let envTex: Texture | null = null;
  if (!lite) {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    envTex = track(pmrem.fromScene(room, 0.04).texture);
    room.dispose();
    pmrem.dispose();
  }

  // ── Çim ve saha çizgileri ──────────────────────────────────────────────────────────────────────────
  const groundDepth = GROUND_NEAR_Z - GROUND_FAR_Z;
  const grass = track(grassTexture(lite ? 256 : 512));
  grass.repeat.set(70 / 2.2, groundDepth / 2.2);
  grass.anisotropy = maxAniso;
  const groundMat = track(
    new MeshStandardMaterial({ map: grass, alphaMap: track(groundAlphaTexture()), transparent: true, roughness: 0.95, metalness: 0, depthWrite: true }),
  );
  const ground = new Mesh(track(new PlaneGeometry(70, groundDepth)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = (GROUND_NEAR_Z + GROUND_FAR_Z) / 2;
  ground.renderOrder = -1;
  scene.add(ground);
  const linesTex = track(pitchLinesTexture(lite ? 1024 : 2048));
  linesTex.anisotropy = maxAniso;
  const linesMat = track(
    new MeshStandardMaterial({ map: linesTex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  const lines = new Mesh(track(new PlaneGeometry(LINES_HALF_X * 2, LINES_HALF_Z * 2)), linesMat);
  lines.rotation.x = -Math.PI / 2;
  lines.position.y = 0.003;
  scene.add(lines);

  // ── Gece: projektör huzmeleri / gündüz: yumuşak güneş huzmeleri (dünyada, sahaya iner) ──────────────────
  type BeamDef = { from: [number, number, number]; target: [number, number, number]; color: number; intensity: number; phase: number };
  const beamGeo = track(new CylinderGeometry(0.16, 3.6, 24, 32, 1, true));
  beamGeo.translate(0, -12, 0); // tepe (lamba) orijinde, koni -Y yönünde
  const shaftGeo = track(new CylinderGeometry(0.8, 6, 30, 32, 1, true));
  shaftGeo.translate(0, -15, 0);
  const nightBeams: BeamDef[] = lite
    ? [
        { from: [-7, 10, -14], target: [-1, 0, -1], color: 0xcfe0ff, intensity: 0.5, phase: 0 },
        { from: [9, 10.5, -14], target: [2.5, 0, -1], color: 0xbff5de, intensity: 0.45, phase: 2.1 },
      ]
    : [
        { from: [-9, 10, -14], target: [-2, 0, -1], color: 0xcfe0ff, intensity: 0.5, phase: 0 },
        { from: [9, 10.5, -14], target: [2, 0, -1], color: 0xbff5de, intensity: 0.45, phase: 2.1 },
        { from: [0, 12, -18], target: [0, 0, -2.5], color: 0xe6eeff, intensity: 0.3, phase: 4.2 },
        { from: [-16, 9, -16], target: [-4, 0, -2], color: 0xcfe0ff, intensity: 0.28, phase: 1.3 },
      ];
  const dayShafts: BeamDef[] = [
    { from: [12, 16, -22], target: [-2, 0, 0], color: 0xfff1d0, intensity: 0.2, phase: 0.7 },
    { from: [12, 16, -22], target: [2, 0, -2], color: 0xfff6e2, intensity: 0.15, phase: 3.3 },
  ];
  type Beam = { mesh: Mesh; mat: ShaderMaterial; base: Vector3; phase: number; intensity: number; sway: number };
  const makeBeams = (defs: BeamDef[], geo: BufferGeometry, sway: number): Beam[] =>
    defs.map((d) => {
      const mat = track(beamMaterial(d.color, d.intensity));
      const mesh = new Mesh(geo, mat);
      mesh.position.set(...d.from);
      mesh.renderOrder = 2;
      scene.add(mesh);
      return { mesh, mat, base: new Vector3(...d.target), phase: d.phase, intensity: d.intensity, sway };
    });
  const beams = makeBeams(nightBeams, beamGeo, 1.6);
  const shafts = makeBeams(dayShafts, shaftGeo, 0.8);
  const aim = new Vector3();
  const down = new Vector3(0, -1, 0);
  const aimBeams = (t: number) => {
    for (const b of [...beams, ...shafts]) {
      aim.copy(b.base);
      aim.x += Math.sin(t * 0.18 + b.phase) * b.sway;
      aim.z += Math.cos(t * 0.13 + b.phase) * b.sway * 0.5;
      aim.sub(b.mesh.position).normalize();
      b.mesh.quaternion.setFromUnitVectors(down, aim);
    }
  };
  aimBeams(0);

  // ── Ufuk bandı süsleri (kameraya bağlı): gece lambalar, gündüz güneş ve bulutlar, ikisinde ufuk sisi ─────
  const sky = new Group();
  camera.add(sky);
  const skySprite = (tex: Texture, x: number, y: number, sx: number, sy: number, light: boolean) => {
    const s = new Sprite(
      track(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0, ...(light ? LIGHT_BLEND : {}) })),
    );
    s.position.set(x, y, -30);
    s.scale.set(sx, sy, 1);
    s.renderOrder = -3;
    sky.add(s);
    return s;
  };
  const lampTex = track(glowTexture('rgba(255,255,255,1)', 'rgba(190,220,255,0.35)'));
  const lamps = (lite ? [-6, 6] : [-9, -3, 4, 10]).map((x, i) => skySprite(lampTex, x, 8.4 + (i % 2) * 0.4, 2, 2, true));
  const sun = skySprite(track(glowTexture('rgba(255,250,235,1)', 'rgba(255,226,160,0.4)')), lite ? 6 : 8, 8.6, 5.5, 5.5, true);
  const cloudTex = track(cloudTexture());
  const clouds = (lite ? [[-5, 8.4, 7], [3, 9.2, 8]] : [[-9, 8.2, 8], [-1, 9.4, 10], [9, 8.8, 7]]).map(([x, y, w]) => ({
    s: skySprite(cloudTex, x!, y!, w!, w! * 0.5, false),
    x: x!,
  }));
  const horizonTex = track(glowTexture('rgba(150,180,220,0.6)', 'rgba(110,140,190,0.2)'));
  const horizon = skySprite(horizonTex, 0, 7.4, 70, 6, false);

  // ── Işık partikülleri (sahanın üstünde süzülür) ────────────────────────────────────────────────────
  const pCount = lite ? 60 : 200;
  const pPos = new Float32Array(pCount * 3);
  const pVel = new Float32Array(pCount);
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  for (let i = 0; i < pCount; i++) {
    pPos.set([rand(-11, 11), rand(0.3, 7), rand(-14, 6)], i * 3);
    pVel[i] = rand(0.08, 0.3);
  }
  const pGeo = track(new BufferGeometry());
  pGeo.setAttribute('position', new BufferAttribute(pPos, 3));
  const pMat = track(
    new PointsMaterial({
      size: lite ? 0.12 : 0.1,
      map: track(glowTexture('rgba(255,255,255,1)', 'rgba(170,255,220,0.4)')),
      color: 0xcff7e8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      sizeAttenuation: true,
      ...LIGHT_BLEND,
    }),
  );
  scene.add(new Points(pGeo, pMat));

  // ── Top ve gölgesi ─────────────────────────────────────────────────────────────────────────────────
  const ballGroup = new Group();
  const spinGroup = new Group();
  ballGroup.add(spinGroup);
  scene.add(ballGroup);
  const shadowMat = track(new MeshBasicMaterial({ map: track(shadowTexture()), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.5 }));
  const shadow = new Mesh(track(new PlaneGeometry(1, 1)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  scene.add(shadow);

  const faces = truncatedIcosahedron();
  const panelOpts = { radius: 1, inset: 0.955, subdivisions: lite ? 3 : 5, puff: 0.03 };
  const logoCount = lite ? 3 : 6;
  const logoFaces = new Set(pickSpreadHexagons(faces, logoCount));
  // Mobilde ucuz standart malzeme; masaüstünde parlak kaplama (clearcoat) + ortam yansıması.
  const physical = (color: number, extra: { roughness?: number; clearcoat?: number } = {}) =>
    track(
      lite
        ? new MeshStandardMaterial({ color, roughness: extra.roughness ?? 0.35, metalness: 0.05 })
        : new MeshPhysicalMaterial({ color, roughness: 0.34, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.1, envMap: envTex, envMapIntensity: 0.6, ...extra }),
    );
  spinGroup.add(
    new Mesh(track(mergePanels(faces.filter((f, i) => f.kind === 'hexagon' && !logoFaces.has(i)).map((f) => panelMesh(f, panelOpts)))), physical(0xf4f6f8)),
    new Mesh(track(mergePanels(faces.filter((f) => f.kind === 'pentagon').map((f) => panelMesh(f, panelOpts)))), physical(0x005c3d)),
    new Mesh(track(new SphereGeometry(0.985, 40, 28)), physical(0x0b1511, { roughness: 0.85, clearcoat: 0 })),
  );
  const logoMaterials: (MeshPhysicalMaterial | MeshStandardMaterial)[] = [];
  for (const i of logoFaces) {
    const m = panelMesh(faces[i]!, panelOpts);
    const mat = physical(0xf4f6f8);
    logoMaterials.push(mat);
    spinGroup.add(new Mesh(track(toGeometry(m.positions, m.normals, m.uvs, m.indices)), mat));
  }
  const rimMat = track(rimMaterial(0x5cf2c0, 2.4, 0.45));
  ballGroup.add(new Mesh(track(new SphereGeometry(1.03, 40, 28)), rimMat));

  // ── Kaleler ve konfeti ─────────────────────────────────────────────────────────────────────────────
  const postMat = track(new MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.35, metalness: 0.1, emissive: 0x1a222b, envMap: envTex }));
  const netMat = track(new LineBasicMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.55, depthWrite: false }));
  // Mobil bantta yer dar: tek kale (sağ), kamera daha yakın.
  const goals = goalSpecs(lite ? [1] : [-1, 1]).map((spec) => buildGoal(spec, postMat, netMat));
  for (const g of goals) scene.add(g.group);
  const goalSpecList = goals.map((g) => g.spec);
  const start: V3 = { x: lite ? 0.8 : 0, y: R, z: 0.6 };

  const cCount = lite ? 60 : 110;
  const cPos = new Float32Array(cCount * 3);
  const cVel = new Float32Array(cCount * 3);
  const cCol = new Float32Array(cCount * 3);
  const tmpColor = new Color();
  for (let i = 0; i < cCount; i++) {
    tmpColor.setHex(CONFETTI_COLORS[i % CONFETTI_COLORS.length]!);
    cCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
  }
  const cGeo = track(new BufferGeometry());
  cGeo.setAttribute('position', new BufferAttribute(cPos, 3));
  cGeo.setAttribute('color', new BufferAttribute(cCol, 3));
  const cMat = track(new PointsMaterial({ size: lite ? 0.14 : 0.11, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false }));
  const confetti = new Points(cGeo, cMat);
  confetti.visible = false;
  confetti.frustumCulled = false;
  scene.add(confetti);
  let confettiT = -1;
  const burst = (at: V3, side: number) => {
    for (let i = 0; i < cCount; i++) {
      cPos.set([at.x, at.y, at.z + rand(-0.5, 0.5)], i * 3);
      cVel.set([-side * rand(0.8, 4.5), rand(3, 8), rand(-2.5, 2.5)], i * 3);
    }
    confettiT = 0;
    confetti.visible = true;
  };
  const stepConfetti = (dt: number) => {
    if (confettiT < 0) return;
    confettiT += dt;
    const drag = Math.exp(-0.9 * dt);
    for (let i = 0; i < cCount * 3; i += 3) {
      cVel[i + 1]! -= 9 * dt;
      for (let k = 0; k < 3; k++) {
        cVel[i + k]! *= drag;
        cPos[i + k]! += cVel[i + k]! * dt;
      }
    }
    cGeo.attributes.position!.needsUpdate = true;
    cMat.opacity = confettiT < 0.9 ? 1 : Math.max(0, 1 - (confettiT - 0.9) / (CONFETTI_SEC - 0.9));
    if (confettiT >= CONFETTI_SEC) {
      confettiT = -1;
      confetti.visible = false;
    }
  };

  // ── Tema: 0 gece … 1 gündüz; değişince renkler yumuşakça geçer (sahne yeniden kurulmaz) ────────────────
  const themeDay = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0);
  let day = themeDay();
  let dayTarget = day;
  const setOpacity = (s: Sprite, o: number) => {
    s.material.opacity = o;
    s.visible = o > 0.005;
  };
  const applyDay = (d: number) => {
    fog.color.setHex(mixColor(NIGHT_FOG, DAY_FOG, d));
    hemi.color.setHex(mixColor(0x8ea6e8, 0xeaf6ff, d));
    hemi.groundColor.setHex(mixColor(0x05080f, 0x5d8a46, d));
    hemi.intensity = mix(lite ? 0.32 : 0.25, lite ? 1.5 : 1.25, d);
    key.color.setHex(mixColor(0xe6eeff, 0xfff0d2, d));
    key.intensity = mix(0.8, 2.6, d);
    rimLight.intensity = mix(1.4, 0.4, d);
    renderer.toneMappingExposure = mix(0.95, 1, d);
    for (const b of beams) {
      b.mat.uniforms.uIntensity!.value = b.intensity * (1 - d);
      b.mesh.visible = d < 0.995;
    }
    for (const b of shafts) {
      b.mat.uniforms.uIntensity!.value = b.intensity * d;
      b.mesh.visible = d > 0.005;
    }
    for (const l of lamps) setOpacity(l, 1 - d);
    setOpacity(sun, d * 0.6);
    for (const c of clouds) setOpacity(c.s, d * 0.85);
    setOpacity(horizon, mix(0.22, 0.35, d));
    pMat.color.setHex(mixColor(0xcff7e8, 0xfff2cf, d));
    pMat.opacity = mix(0.85, 0.4, d);
    (rimMat.uniforms.uColor!.value as Color).setHex(mixColor(0x5cf2c0, 0xffffff, d));
    rimMat.uniforms.uIntensity!.value = mix(0.45, 0.2, d);
    netMat.color.setHex(mixColor(0xdfe8f0, 0xf4f7fa, d));
    netMat.opacity = mix(0.5, 0.7, d);
    postMat.emissive.setHex(mixColor(0x1a222b, 0x000000, d));
    postMat.envMapIntensity = mix(0.3, 0.8, d);
    shadowFactor = mix(0.75, 1, d);
  };
  let shadowFactor = 1;
  applyDay(day);

  // ── Kamera: kaleler tam görünür olacak en yakın mesafe (ikili arama) ─────────────────────────────────
  let width = 1;
  let height = 1;
  let camTarget = new Vector3(0, TARGET_Y, 0);
  let camBase = new Vector3();
  const camDir = new Vector3(0, Math.sin((TILT_DEG * Math.PI) / 180), Math.cos((TILT_DEG * Math.PI) / 180));
  const fitPoints: Vector3[] = [];
  for (const g of goalSpecList) {
    for (const x of [g.lineX, g.backX]) for (const y of [0, g.height]) for (const z of [-g.halfW, g.halfW]) fitPoints.push(new Vector3(x, y, z));
  }
  if (lite) fitPoints.push(new Vector3(-2.2, 0, 1.6), new Vector3(-2.2, 0, -1.6));
  const placeCamera = (dist: number) => {
    camBase = camTarget.clone().addScaledVector(camDir, dist);
    camera.position.copy(camBase);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
  };
  const fits = () => {
    const v = new Vector3();
    return fitPoints.every((p) => {
      v.copy(p).project(camera);
      return Math.abs(v.x) <= 0.93 && v.y >= -0.93 && v.y <= 0.75;
    });
  };
  const fitCamera = () => {
    const xs = fitPoints.map((p) => p.x);
    camTarget = new Vector3((Math.min(...xs) + Math.max(...xs)) / 2, TARGET_Y, -0.2);
    let lo = 4;
    let hi = 60;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      placeCamera(mid);
      if (fits()) hi = mid;
      else lo = mid;
    }
    placeCamera(hi);
  };

  let firstFrame = true;
  const render = () => {
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      canvas.setAttribute('data-ready', '');
    }
  };

  // Logolar: aynı köken (/api/img/logo) → doku CORS'a takılmaz; yüklenemeyen panel düz beyaz kalır.
  pickLogoIds(HUB_LEAGUE_IDS, logoCount, PINNED_LEAGUE_IDS)
    .map((id) => logoSrc(sportmonksLeagueLogoUrl(id), 64))
    .filter((u): u is string => Boolean(u))
    .forEach((url, k) => {
      const mat = logoMaterials[k];
      if (!mat) return;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        if (disposed || !img.naturalWidth) return;
        try {
          const tex = track(drawLogo(img));
          tex.anisotropy = Math.min(4, maxAniso);
          mat.map = tex;
          mat.needsUpdate = true;
          if (!raf) render(); // döngü duruyorsa (hareketi azalt / gizli) logolu kare yine çizilsin
        } catch {
          // kirli tuval / bozuk görsel: panel düz kalır
        }
      };
      img.src = url;
    });

  let ball: Ball = restingBall(start.x, start.z);
  let pop = 1;
  const projected = new Vector3();
  const placeBall = () => {
    ballGroup.position.set(ball.pos.x, ball.pos.y, ball.pos.z);
    ballGroup.scale.setScalar(R * (pop < 1 ? 1 - (1 - pop) ** 3 : 1));
    const sh = shadowFor(ball.pos.y - R, R);
    shadow.position.set(ball.pos.x, 0.006, ball.pos.z);
    shadow.scale.setScalar(sh.scale * pop);
    shadowMat.opacity = sh.opacity * shadowFactor;
    if (reduced) return;
    projected.copy(ballGroup.position).project(camera);
    // Kadraj dışındaki (ör. kameranın arkasına giden) topun tutamağı gizlenir.
    const onScreen = projected.z < 1 && Math.abs(projected.x) <= 1.2 && Math.abs(projected.y) <= 1.2;
    handle.style.visibility = onScreen ? '' : 'hidden';
    if (!onScreen) return;
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    // Ekrandaki yarıçap (kameraya uzaklıkla) — dokunmada en az 22 px.
    const dist = camera.position.distanceTo(ballGroup.position);
    const rPx = Math.max(22, ((R * 1.25) / (dist * Math.tan((FOV * Math.PI) / 360))) * (height / 2));
    handle.style.width = `${rPx * 2}px`;
    handle.style.height = `${rPx * 2}px`;
    handle.style.transform = `translate(${x - rPx}px, ${y - rPx}px)`;
  };
  const ballVisible = () => {
    projected.copy(ballGroup.position).project(camera);
    return projected.z < 1 && Math.abs(projected.x) <= 1.05 && Math.abs(projected.y) <= 1.05;
  };

  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    fitCamera();
    placeBall();
    render();
  };

  /** offset: tutma anında top ile işaretçinin taşıma düzlemindeki izdüşümü arasındaki fark (top "sıçramasın"). */
  let dragging: { id: number; samples: DragSample[]; offset: { x: number; z: number } } | null = null;
  let pointer: { nx: number; ny: number } | null = null;
  /** Gol anı: süre dolunca top başlama noktasına döner. */
  let scored: { side: -1 | 1; t: number } | null = null;
  let offscreen = 0;
  const qTmp = new Quaternion();
  const axis = new Vector3();
  const rotate = (spin: V3, dt: number) => {
    const w = Math.hypot(spin.x, spin.y, spin.z);
    if (w < 1e-6) return;
    axis.set(spin.x / w, spin.y / w, spin.z / w);
    spinGroup.quaternion.premultiply(qTmp.setFromAxisAngle(axis, w * dt));
  };
  const resetBall = () => {
    ball = restingBall(start.x, start.z);
    pop = 0;
    offscreen = 0;
  };
  const onGoal = (side: -1 | 1) => {
    scored = { side, t: 0 };
    const view = goals.find((g) => g.spec.side === side);
    if (view) view.ripple = { t: 0, at: { ...ball.pos }, dir: { x: side, y: 0, z: 0 }, amp: 0.14 };
    burst({ x: side * DEFAULT_GOAL.lineX, y: DEFAULT_GOAL.height * 0.8, z: ball.pos.z }, side);
    goalText.removeAttribute('data-show');
    void goalText.offsetWidth; // animasyonu baştan başlat
    goalText.setAttribute('data-show', '');
  };

  let elapsed = 0;
  const update = (dt: number) => {
    elapsed += dt;
    if (day !== dayTarget) {
      day = Math.abs(dayTarget - day) < 0.003 ? dayTarget : approach(day, dayTarget, 3.5, dt);
      applyDay(day);
    }
    if (!dragging) {
      const out = stepBall(ball, dt, goalSpecList, R);
      ball = out.ball;
      for (const e of out.events) {
        if (e.type === 'goal' && !scored) onGoal(e.side);
        else if (e.type === 'net') {
          const view = goals.find((g) => g.spec.side === e.side);
          if (view && e.speed > 1) {
            const dir = Math.abs(Math.abs(e.z) - view.spec.halfW) < 0.05 ? { x: 0, y: 0, z: Math.sign(e.z) } : { x: e.side, y: 0, z: 0 };
            view.ripple = { t: 0, at: { x: ball.pos.x, y: e.y, z: e.z }, dir, amp: Math.min(0.16, 0.025 * e.speed) };
          }
        }
      }
      rotate(ball.spin, dt);
    }
    if (scored) {
      scored.t += dt;
      if (scored.t >= GOAL_RESET_SEC) {
        scored = null;
        resetBall();
      }
    } else {
      offscreen = offscreenTime(offscreen, dragging != null || ballVisible(), dt);
      if (offscreen >= OFFSCREEN_RESET_SEC) resetBall();
    }
    if (pop < 1) pop = Math.min(1, pop + dt / POP_SEC);
    for (const g of goals) rippleNet(g, dt);
    stepConfetti(dt);

    const target = parallaxTarget(pointer?.nx ?? null, pointer?.ny ?? null, 0.35);
    camera.position.x = approach(camera.position.x, camBase.x + target.x, 3, dt);
    camera.position.y = approach(camera.position.y, camBase.y + target.y, 3, dt);
    camera.lookAt(camTarget);

    aimBeams(elapsed);
    for (const c of clouds) c.s.position.x = c.x + Math.sin(elapsed * 0.05 + c.x) * 1.5;
    for (let i = 0; i < pCount; i++) {
      const y = i * 3 + 1;
      pPos[y]! += pVel[i]! * dt;
      pPos[i * 3]! += Math.sin(elapsed * 0.4 + i) * 0.02 * dt;
      if (pPos[y]! > 7) pPos[y] = 0.3;
    }
    pGeo.attributes.position!.needsUpdate = true;
    placeBall();
  };

  let raf = 0;
  let last = 0;
  let pageVisible = document.visibilityState === 'visible';
  let inView = true;
  let contextLost = false;
  const frame = (ts: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    update(dt);
    render();
  };
  const sync = () => {
    const run = !reduced && !disposed && !contextLost && pageVisible && inView;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const onVisibility = () => {
    pageVisible = document.visibilityState === 'visible';
    sync();
  };
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          inView = entries.some((e) => e.isIntersecting);
          sync();
        })
      : null;
  const ro = new ResizeObserver(resize);
  // Tema değişimi: döngü çalışıyorsa geçiş karelere yayılır; duruyorsa (hareketi azalt / gizli) hemen tek kare.
  const themeObserver = new MutationObserver(() => {
    dayTarget = themeDay();
    if (!raf && !disposed && !contextLost) {
      day = dayTarget;
      applyDay(day);
      render();
    }
  });

  // ── Etkileşim: tut → top işaretçinin altında (biraz havada) taşınır; bırak → yön ve güç harekette ─────────
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const dragPlane = new Plane(new Vector3(0, 1, 0), -(R + LIFT));
  const hit = new Vector3();
  const local = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  const rayOnPlane = (e: PointerEvent): { x: number; z: number } | null => {
    const p = local(e);
    ndc.set((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(dragPlane, hit) ? { x: hit.x, z: hit.z } : null;
  };
  const onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const p = local(e);
    pointer = { nx: (p.x / p.w) * 2 - 1, ny: (p.y / p.h) * 2 - 1 };
  };
  const onLeave = () => {
    pointer = null;
  };
  const onDown = (e: PointerEvent) => {
    if (scored || pop < 1) return;
    e.preventDefault();
    const at = rayOnPlane(e);
    const offset = at ? { x: ball.pos.x - at.x, z: ball.pos.z - at.z } : { x: 0, z: 0 };
    dragging = { id: e.pointerId, samples: [{ t: e.timeStamp, x: ball.pos.x, z: ball.pos.z }], offset };
    ball = { pos: { ...ball.pos, y: R + LIFT }, vel: { x: 0, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // yakalama olmadan da çalışır
    }
    handle.setAttribute('data-dragging', '');
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const at = rayOnPlane(e);
    if (!at) return;
    // Sahadan çok uzağa taşınmasın
    const p = { x: Math.max(-9, Math.min(9, at.x + dragging.offset.x)), z: Math.max(-9, Math.min(7, at.z + dragging.offset.z)) };
    const prev = dragging.samples[dragging.samples.length - 1]!;
    const dt = Math.max(1e-3, (e.timeStamp - prev.t) / 1000);
    ball = { ...ball, pos: { x: p.x, y: R + LIFT, z: p.z } };
    // Taşırken hareket yönünde döner (görsel)
    rotate(rollingSpin((p.x - prev.x) / dt, (p.z - prev.z) / dt, R), Math.min(dt, 1 / 30));
    dragging.samples.push({ t: e.timeStamp, x: p.x, z: p.z });
    if (dragging.samples.length > 12) dragging.samples.shift();
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    // İptal (kaydırma vb.): fırlatma yok, olduğu yere düşer.
    const v = e.type === 'pointercancel' ? { x: 0, y: 0, z: 0 } : throwVelocity(dragging.samples);
    dragging = null;
    handle.removeAttribute('data-dragging');
    const roll = rollingSpin(v.x, v.z, R);
    ball = { ...ball, vel: v, spin: { x: roll.x * 0.6, y: 0, z: roll.z * 0.6 } };
  };
  // GPU bağlamı kaybolursa (sürücü sıfırlama vb.) tuval gizlenir, düz gradyan kalır.
  const onContextLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    canvas.removeAttribute('data-ready');
    sync();
  };

  if (!reduced) {
    host.addEventListener('pointermove', onHover);
    host.addEventListener('pointerleave', onLeave);
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
    document.addEventListener('visibilitychange', onVisibility);
    io?.observe(host);
  }
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  canvas.addEventListener('webglcontextlost', onContextLost);
  ro.observe(host);
  spinGroup.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.5).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -0.7));
  resize();
  sync();

  return {
    dispose() {
      disposed = true;
      sync();
      ro.disconnect();
      io?.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      host.removeEventListener('pointermove', onHover);
      host.removeEventListener('pointerleave', onLeave);
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = (mesh as { material?: Material | Material[] }).material;
        for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          const map = (m as { map?: Texture | null }).map;
          map?.dispose();
          m.dispose();
        }
      });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      handle.remove();
      goalText.remove();
    },
  };
}

/**
 * Giriş / kayıt sahnesi (three.js). Yalnız `AuthStage` dinamik olarak yükler → three.js bu iki sayfanın sonradan
 * gelen parçasında kalır, ilk yüke ve diğer sayfalara girmez.
 *
 * Sahne temaya uyar (yeniden yüklenmeden, renkler yumuşakça geçer): koyu temada gece maçı (projektör huzmeleri,
 * sis, ışık partikülleri), açık temada gündüz maçı (güneş, yumuşak ışık huzmeleri, bulutlar). Arkada bulanık küçük
 * toplar; ortada kesik ikosahedron top (beşgenler marka yeşili, bazı altıgenlerde planımızdaki liglerin logoları),
 * parlak kaplama + kenar parlaması; zeminde sol / sağ kenarda kaleler (mobilde tek).
 * Etkileşim (stageMotion.ts): tut-döndür (atalet), hızlı fırlatınca sekip merkeze dönme, üst direkten sekme, gol
 * (file dalgası + "GOL!" + konfeti, 1,5 sn sonra top ortaya), paralaks.
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
  OneFactor,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SrcAlphaFactor,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
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
  GOAL_RESET_SEC,
  approach,
  dragRotation,
  goalLayout,
  mix,
  mixColor,
  parallaxTarget,
  pickLogoIds,
  planeBounds,
  pointerVelocity,
  releaseMotion,
  restingMotion,
  stepInNet,
  stepPlay,
  type BallMotion,
  type Bounds,
  type GoalSpec,
  type PointerSample,
} from './stageMotion';

export type StageOptions = {
  /** prefers-reduced-motion: tek kare, etkileşim yok. */
  reduced: boolean;
  /** Mobil: daha az partikül / top / logo / huzme, düşük pixelRatio, ortam yansıması yok. */
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
const FOV = 32;
/** Top çapı / sahne yüksekliği (istenen ~%25–30). */
const BALL_FRACTION = { desktop: 0.27, lite: 0.3 };
const POP_SEC = 0.35;
const CONFETTI_SEC = 1.6;
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);

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

/** Arka plandaki bulanık küçük top: beyaz küre + birkaç yeşil leke, bulanıklaştırılmış. */
function blurredBallTexture(): CanvasTexture {
  return canvasTexture(128, (ctx, s) => {
    ctx.filter = 'blur(5px)';
    const r = s * 0.32;
    const shade = ctx.createRadialGradient(s * 0.42, s * 0.4, r * 0.1, s / 2, s / 2, r);
    shade.addColorStop(0, '#ffffff');
    shade.addColorStop(1, '#9aa6b2');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,140,95,0.85)';
    for (const [dx, dy, rr] of [
      [0, 0, 0.3],
      [0.62, -0.38, 0.22],
      [-0.6, -0.34, 0.22],
      [0.05, 0.72, 0.2],
    ] as const) {
      ctx.beginPath();
      ctx.arc(s / 2 + dx * r, s / 2 + dy * r, rr * r, 0, Math.PI * 2);
      ctx.fill();
    }
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

type GoalView = {
  spec: GoalSpec;
  group: Group;
  geometries: BufferGeometry[];
  net: BufferGeometry;
  /** Filenin dalgasız köşeleri (dalga bunun üstüne yazılır). */
  base: Float32Array;
  ripple: { t: number; y: number; amp: number } | null;
};

/**
 * Yandan görünen 3D kale: iki direk (z = ±halfZ), üst direk, file (arka, iki yan, arkaya hafif inen çatı). Direkler
 * zeminin altına uzanır (kadrajın dışı). File çizgileri kısa parçalara bölünür → dalga yumuşak görünür.
 */
function buildGoal(spec: GoalSpec, halfZ: number, postMat: Material, netMat: LineBasicMaterial): GoalView {
  const { side, lineX, backX, floorY, crossY, barR } = spec;
  const group = new Group();
  const geometries: BufferGeometry[] = [];
  const bottom = floorY - 1.5;
  const postGeo = new CylinderGeometry(barR, barR, crossY - bottom, 12);
  postGeo.translate(0, (crossY + bottom) / 2, 0);
  const barGeo = new CylinderGeometry(barR, barR, halfZ * 2 + barR * 2, 12);
  geometries.push(postGeo, barGeo);
  for (const z of [-halfZ, halfZ]) {
    const post = new Mesh(postGeo, postMat);
    post.position.set(lineX, 0, z);
    group.add(post);
  }
  const bar = new Mesh(barGeo, postMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(lineX, crossY, 0);
  group.add(bar);

  const roofBackY = crossY - Math.min(0.15, (crossY - floorY) * 0.1);
  const step = 0.13;
  const pts: number[] = [];
  type P = (u: number, v: number) => [number, number, number];
  // Yüzey üzerinde u ve v doğrultusunda ızgara çizgileri, her çizgi kısa parçalarla.
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
  const roofAt = (u: number) => crossY + (roofBackY - crossY) * u;
  grid((u, v) => [backX, bottom + (roofBackY - bottom) * v, -halfZ + 2 * halfZ * u], 2 * halfZ, roofBackY - bottom);
  for (const z of [-halfZ, halfZ]) grid((u, v) => [lineX + (backX - lineX) * u, bottom + (roofAt(u) - bottom) * v, z], depth, crossY - bottom);
  grid((u, v) => [lineX + (backX - lineX) * u, roofAt(u), -halfZ + 2 * halfZ * v], depth, 2 * halfZ);
  const base = new Float32Array(pts);
  const net = new BufferGeometry();
  net.setAttribute('position', new BufferAttribute(new Float32Array(base), 3));
  geometries.push(net);
  const lines = new LineSegments(net, netMat);
  lines.renderOrder = 1;
  group.add(lines);
  return { spec: { ...spec, side }, group, geometries, net, base, ripple: null };
}

/** File dalgası: çarpma noktası çevresinde dışa doğru sönümlü salınım (arkaya yakın köşelerde daha güçlü). */
function rippleNet(v: GoalView, dt: number) {
  const r = v.ripple;
  if (!r) return;
  r.t += dt;
  const attr = v.net.attributes.position as BufferAttribute;
  const out = attr.array as Float32Array;
  const { side, lineX, backX } = v.spec;
  const depth = Math.abs(backX - lineX) || 1;
  const done = r.t > 1.6;
  const wave = done ? 0 : r.amp * Math.sin(r.t * 14) * Math.exp(-r.t * 3);
  for (let i = 0; i < v.base.length; i += 3) {
    const x = v.base[i]!;
    const y = v.base[i + 1]!;
    const z = v.base[i + 2]!;
    const f = Math.min(1, Math.max(0, ((x - lineX) * side) / depth));
    const w = Math.exp(-((y - r.y) ** 2 + z * z) / 0.5) * f;
    out[i] = x + side * wave * w;
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

  // Mobil bant küçük: MSAA ucuz, kapalıyken dikiş çizgileri tırtıklı → her iki düzende açık.
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = opts.canvasClassName;
  host.appendChild(canvas);

  const handle = document.createElement('div');
  handle.className = opts.handleClassName;
  const goalText = document.createElement('div');
  goalText.className = opts.goalClassName;
  goalText.textContent = opts.goalLabel;
  if (!reduced) host.append(handle, goalText);

  const scene = new Scene();
  const fog = new Fog(NIGHT_FOG, 10, 28);
  scene.fog = fog;
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  let camDist = 8;
  camera.position.set(0, 0, camDist);

  // Işık: tepe ışığı + ana ışık (gece soğuk beyaz, gündüz güneş) + marka yeşili arka kenar ışığı; masaüstünde oda
  // ortamı yansıması.
  const hemi = new HemisphereLight(0x9fb4ff, 0x05080f, 1);
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(3, 4, 5);
  const rimLight = new DirectionalLight(BRAND_GREEN, 2.2);
  rimLight.position.set(-4, 2.5, -3);
  const under = new DirectionalLight(0x7d93d6, 0.5);
  under.position.set(1, -4, 2);
  scene.add(hemi, key, rimLight, under);
  if (!lite) {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    track(env.texture);
    room.dispose();
    pmrem.dispose();
  }

  // ── Gece: projektör huzmeleri ve lambalar / gündüz: güneş, yumuşak ışık huzmeleri, bulutlar ─────────────
  type BeamDef = { from: [number, number, number]; target: [number, number, number]; color: number; intensity: number; phase: number };
  const beamGeo = track(new CylinderGeometry(0.14, 3.4, 18, 32, 1, true));
  beamGeo.translate(0, -9, 0); // tepe (lamba) orijinde, koni -Y yönünde
  const shaftGeo = track(new CylinderGeometry(0.6, 5.5, 24, 32, 1, true));
  shaftGeo.translate(0, -12, 0);
  const lampTex = track(glowTexture('rgba(255,255,255,1)', 'rgba(190,220,255,0.35)'));
  const nightBeams: BeamDef[] = lite
    ? [
        { from: [-6, 4.2, -12], target: [-0.5, -3, -2], color: 0xcfe0ff, intensity: 0.9, phase: 0 },
        { from: [6.5, 4.4, -13], target: [1, -3, -2], color: 0xbff5de, intensity: 0.8, phase: 2.1 },
      ]
    : [
        { from: [-5.2, 4.6, -12], target: [-0.8, -3, -2], color: 0xcfe0ff, intensity: 0.9, phase: 0 },
        { from: [5.6, 4.9, -13], target: [1.2, -3, -2], color: 0xbff5de, intensity: 0.8, phase: 2.1 },
        { from: [1.2, 6.2, -18], target: [0, -3, -6], color: 0xe6eeff, intensity: 0.55, phase: 4.2 },
        { from: [-9.5, 5.4, -18], target: [-3, -3, -6], color: 0xcfe0ff, intensity: 0.5, phase: 1.3 },
      ];
  const sunPos: [number, number, number] = lite ? [4.6, 3.6, -14] : [5.2, 4.4, -16];
  const dayShafts: BeamDef[] = [
    { from: sunPos, target: [-2.5, -3, -2], color: 0xfff1d0, intensity: 0.32, phase: 0.7 },
    { from: sunPos, target: [0.5, -3, -4], color: 0xfff6e2, intensity: 0.24, phase: 3.3 },
  ];
  type Beam = { mesh: Mesh; mat: ShaderMaterial; base: Vector3; phase: number; intensity: number; sway: number; lamp: Sprite | null };
  const makeBeams = (defs: BeamDef[], geo: BufferGeometry, withLamp: boolean, sway: number): Beam[] =>
    defs.map((d) => {
      const mat = track(beamMaterial(d.color, d.intensity));
      const mesh = new Mesh(geo, mat);
      mesh.position.set(...d.from);
      mesh.renderOrder = -2;
      scene.add(mesh);
      let lamp: Sprite | null = null;
      if (withLamp) {
        lamp = new Sprite(track(new SpriteMaterial({ map: lampTex, ...LIGHT_BLEND, depthWrite: false, transparent: true })));
        lamp.position.set(...d.from);
        lamp.scale.setScalar(1.8);
        scene.add(lamp);
      }
      return { mesh, mat, base: new Vector3(...d.target), phase: d.phase, intensity: d.intensity, sway, lamp };
    });
  const beams = makeBeams(nightBeams, beamGeo, true, 1.6);
  const shafts = makeBeams(dayShafts, shaftGeo, false, 0.6);
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

  const sun = new Sprite(track(new SpriteMaterial({ map: track(glowTexture('rgba(255,250,235,1)', 'rgba(255,226,160,0.4)')), transparent: true, depthWrite: false, fog: false, ...LIGHT_BLEND })));
  sun.position.set(...sunPos);
  sun.scale.setScalar(lite ? 5 : 6.5);
  scene.add(sun);
  const cloudTex = track(cloudTexture());
  const clouds = (
    [
      { p: [-4.5, 3.4, -14], s: 6, o: 0.85, v: 0.12 },
      { p: [2, 4.5, -18], s: 8, o: 0.75, v: 0.08 },
      { p: [7, 2.6, -16], s: 5.5, o: 0.7, v: 0.1 },
      { p: [-1.5, 2.4, -21], s: 7, o: 0.6, v: 0.06 },
    ] as { p: [number, number, number]; s: number; o: number; v: number }[]
  )
    .slice(0, lite ? 2 : 4)
    .map((d) => {
      const s = new Sprite(track(new SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity: 0 })));
      s.position.set(...d.p);
      s.scale.set(d.s, d.s * 0.55, 1);
      s.renderOrder = -1;
      scene.add(s);
      return { s, d };
    });

  // ── Yer sisi (iki geniş, çok silik bulut) ───────────────────────────────────────────────────────────
  const mistTex = track(glowTexture('rgba(150,180,220,0.55)', 'rgba(110,140,190,0.18)'));
  const mists = [
    { x: -3, y: -2.6, z: -4, sx: 14, sy: 3.2, speed: 0.12 },
    { x: 4, y: -3.1, z: -7, sx: 16, sy: 3.6, speed: -0.08 },
  ].map((d) => {
    const s = new Sprite(track(new SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.16, depthWrite: false })));
    s.position.set(d.x, d.y, d.z);
    s.scale.set(d.sx, d.sy, 1);
    s.renderOrder = -1;
    scene.add(s);
    return { s, d };
  });

  // ── Işık partikülleri ───────────────────────────────────────────────────────────────────────────────
  const pCount = lite ? 70 : 240;
  const pPos = new Float32Array(pCount * 3);
  const pVel = new Float32Array(pCount);
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = rand(-10, 10);
    pPos[i * 3 + 1] = rand(-6, 7);
    pPos[i * 3 + 2] = rand(-16, 2);
    pVel[i] = rand(0.08, 0.3);
  }
  const pGeo = track(new BufferGeometry());
  pGeo.setAttribute('position', new BufferAttribute(pPos, 3));
  const dotTex = track(glowTexture('rgba(255,255,255,1)', 'rgba(170,255,220,0.4)'));
  const pMat = track(
    new PointsMaterial({
      size: lite ? 0.16 : 0.13,
      map: dotTex,
      color: 0xcff7e8,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      ...LIGHT_BLEND,
      sizeAttenuation: true,
    }),
  );
  scene.add(new Points(pGeo, pMat));

  // ── Arkada süzülen bulanık toplar ───────────────────────────────────────────────────────────────────
  const smallTex = track(blurredBallTexture());
  const smallDefs = [
    { p: [-4.6, 2.1, -6], s: 1.3, o: 0.5 },
    { p: [4.9, -1.5, -7.5], s: 1.5, o: 0.42 },
    { p: [-3.4, -0.6, -4.5], s: 0.9, o: 0.55 },
    { p: [3.8, 2.7, -10], s: 1.6, o: 0.3 },
  ].slice(0, lite ? 3 : 4) as { p: [number, number, number]; s: number; o: number }[];
  const smallBalls = smallDefs.map((d, i) => {
    const s = new Sprite(track(new SpriteMaterial({ map: smallTex, transparent: true, opacity: d.o, depthWrite: false })));
    s.position.set(...d.p);
    s.scale.setScalar(d.s);
    scene.add(s);
    return { s, base: d.p, phase: i * 1.7 };
  });

  // ── Top ────────────────────────────────────────────────────────────────────────────────────────────
  const ballGroup = new Group();
  const spinGroup = new Group();
  ballGroup.add(spinGroup);
  scene.add(ballGroup);

  // Hale: gece yeşil, gündüz sıcak beyaz (iki sprite arasında geçiş).
  const haloNight = new Sprite(track(new SpriteMaterial({ map: track(glowTexture('rgba(0,167,111,0.55)', 'rgba(0,167,111,0.16)')), transparent: true, depthWrite: false, ...LIGHT_BLEND })));
  const haloDay = new Sprite(track(new SpriteMaterial({ map: track(glowTexture('rgba(255,248,225,0.6)', 'rgba(255,240,200,0.18)')), transparent: true, depthWrite: false, opacity: 0 })));
  for (const h of [haloNight, haloDay]) {
    h.renderOrder = -1;
    scene.add(h);
  }

  const faces = truncatedIcosahedron();
  const panelOpts = { radius: 1, inset: 0.955, subdivisions: lite ? 3 : 6, puff: 0.03 };
  // Küçük topta logo seçilsin diye az ve dağınık: masaüstünde 8, mobilde 4 altıgen.
  const logoCount = lite ? 4 : 8;
  const logoFaces = new Set(pickSpreadHexagons(faces, logoCount));
  // Mobilde ucuz standart malzeme; masaüstünde parlak kaplama (clearcoat) + ortam yansıması.
  const physical = (color: number, extra: { roughness?: number; clearcoat?: number } = {}) =>
    track(
      lite
        ? new MeshStandardMaterial({ color, roughness: extra.roughness ?? 0.3, metalness: 0.05 })
        : new MeshPhysicalMaterial({
            color,
            roughness: 0.32,
            metalness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0.08,
            envMapIntensity: 0.6,
            ...extra,
          }),
    );
  const whiteMat = physical(0xf4f6f8);
  const greenMat = physical(0x005c3d);
  spinGroup.add(
    new Mesh(track(mergePanels(faces.filter((f, i) => f.kind === 'hexagon' && !logoFaces.has(i)).map((f) => panelMesh(f, panelOpts)))), whiteMat),
    new Mesh(track(mergePanels(faces.filter((f) => f.kind === 'pentagon').map((f) => panelMesh(f, panelOpts)))), greenMat),
    new Mesh(track(new SphereGeometry(0.985, 48, 32)), physical(0x0b1511, { roughness: 0.85, clearcoat: 0 })),
  );
  const logoMaterials: (MeshPhysicalMaterial | MeshStandardMaterial)[] = [];
  for (const i of logoFaces) {
    const m = panelMesh(faces[i]!, panelOpts);
    const mat = physical(0xf4f6f8);
    logoMaterials.push(mat);
    spinGroup.add(new Mesh(track(toGeometry(m.positions, m.normals, m.uvs, m.indices)), mat));
  }
  // Cam kaplama + kenar parlaması (spinGroup dışında: görüş açısına bağlı).
  const shell = new Mesh(
    track(new SphereGeometry(1.045, 48, 32)),
    track(
      lite
        ? new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.1, depthWrite: false })
        : new MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false }),
    ),
  );
  const rimMat = track(rimMaterial(0x5cf2c0, 2.4, 0.75));
  ballGroup.add(shell, new Mesh(track(new SphereGeometry(1.035, 48, 32)), rimMat));
  spinGroup.quaternion.setFromAxisAngle(AXIS_X, 0.35).multiply(new Quaternion().setFromAxisAngle(AXIS_Y, -0.6));

  // ── Kaleler (boyuta bağlı: yeniden boyutlanınca yeniden kurulur) ───────────────────────────────────────
  const postMat = track(new MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.35, metalness: 0.1, emissive: 0x1a222b }));
  const netMat = track(new LineBasicMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.5, depthWrite: false }));
  let goals: GoalView[] = [];
  const buildGoals = (bounds: Bounds, ballR: number) => {
    for (const g of goals) {
      scene.remove(g.group);
      for (const geo of g.geometries) geo.dispose();
    }
    // Mobil bantta yer dar: tek kale (sağ).
    goals = goalLayout(bounds, ballR, lite ? [1] : [-1, 1]).map((spec) => buildGoal(spec, lite ? 0.6 : 0.75, postMat, netMat));
    for (const g of goals) scene.add(g.group);
  };

  // ── Gol: konfeti ───────────────────────────────────────────────────────────────────────────────────
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
  const cMat = track(new PointsMaterial({ size: lite ? 0.12 : 0.09, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false }));
  const confetti = new Points(cGeo, cMat);
  confetti.visible = false;
  confetti.frustumCulled = false;
  scene.add(confetti);
  let confettiT = -1;
  const burst = (x: number, y: number, side: number) => {
    for (let i = 0; i < cCount; i++) {
      cPos.set([x, y, rand(-0.4, 0.4)], i * 3);
      cVel.set([-side * rand(0.8, 4.5), rand(1.5, 6.5), rand(-1.8, 1.8)], i * 3);
    }
    confettiT = 0;
    confetti.visible = true;
  };
  const stepConfetti = (dt: number) => {
    if (confettiT < 0) return;
    confettiT += dt;
    const drag = Math.exp(-0.9 * dt);
    for (let i = 0; i < cCount * 3; i += 3) {
      cVel[i + 1]! -= 7 * dt;
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
  const setOpacity = (s: Sprite | Points, o: number) => {
    (s.material as SpriteMaterial | PointsMaterial).opacity = o;
    s.visible = o > 0.005;
  };
  const applyDay = (d: number) => {
    fog.color.setHex(mixColor(NIGHT_FOG, DAY_FOG, d));
    hemi.color.setHex(mixColor(0x9fb4ff, 0xeaf6ff, d));
    hemi.groundColor.setHex(mixColor(0x05080f, 0x5d8a46, d));
    hemi.intensity = mix(lite ? 1.1 : 0.7, lite ? 1.9 : 1.5, d);
    key.color.setHex(mixColor(0xffffff, 0xfff0d2, d));
    key.intensity = mix(lite ? 2.6 : 2.1, 2.9, d);
    rimLight.intensity = mix(2.2, 0.8, d);
    under.intensity = mix(lite ? 0.3 : 0.5, 0.15, d);
    renderer.toneMappingExposure = mix(1.05, 1, d);
    for (const b of beams) {
      b.mat.uniforms.uIntensity!.value = b.intensity * (1 - d);
      b.mesh.visible = d < 0.995;
      if (b.lamp) setOpacity(b.lamp, 1 - d);
    }
    for (const b of shafts) {
      b.mat.uniforms.uIntensity!.value = b.intensity * d;
      b.mesh.visible = d > 0.005;
    }
    setOpacity(sun, d * 0.55);
    for (const c of clouds) setOpacity(c.s, c.d.o * d);
    pMat.color.setHex(mixColor(0xcff7e8, 0xfff2cf, d));
    pMat.opacity = mix(0.9, 0.55, d);
    for (const m of mists) (m.s.material as SpriteMaterial).opacity = mix(0.16, 0.3, d);
    setOpacity(haloNight, 1 - d);
    setOpacity(haloDay, d * 0.8);
    (rimMat.uniforms.uColor!.value as Color).setHex(mixColor(0x5cf2c0, 0xffffff, d));
    rimMat.uniforms.uIntensity!.value = mix(0.75, 0.4, d);
    netMat.color.setHex(mixColor(0xdfe8f0, 0x4a5a66, d));
    netMat.opacity = mix(0.5, 0.6, d);
    postMat.emissive.setHex(mixColor(0x1a222b, 0x000000, d));
  };
  applyDay(day);

  // ── Çizim, boyut, döngü ────────────────────────────────────────────────────────────────────────────
  let width = 1;
  let height = 1;
  let bounds: Bounds = { halfW: 3, halfH: 2 };
  let ballR = 0.6;
  let pop = 1;
  let firstFrame = true;
  const render = () => {
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      canvas.setAttribute('data-ready', '');
    }
  };

  // Logolar: aynı köken (/api/img/logo) → doku CORS'a takılmaz; yüklenemeyen panel düz beyaz kalır.
  const logoUrls = pickLogoIds(HUB_LEAGUE_IDS, logoCount, PINNED_LEAGUE_IDS)
    .map((id) => logoSrc(sportmonksLeagueLogoUrl(id), 64))
    .filter((u): u is string => Boolean(u));
  logoUrls.forEach((url, k) => {
    const mat = logoMaterials[k];
    if (!mat) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (disposed || !img.naturalWidth) return;
      try {
        const tex = track(drawLogo(img));
        tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
        mat.map = tex;
        mat.needsUpdate = true;
        if (!raf) render(); // döngü duruyorsa (hareketi azalt / gizli) logolu kare yine çizilsin
      } catch {
        // kirli tuval / bozuk görsel: panel düz kalır
      }
    };
    img.src = url;
  });

  const worldPerPx = () => (2 * Math.tan((FOV * Math.PI) / 360) * camDist) / Math.max(1, height);
  const projected = new Vector3();
  const placeBall = () => {
    ballGroup.position.set(motion.pos.x, motion.pos.y, 0);
    ballGroup.scale.setScalar(ballR * pop);
    for (const h of [haloNight, haloDay]) {
      h.position.set(motion.pos.x * 0.8, motion.pos.y * 0.8, -1.6);
      h.scale.setScalar(6.2 * ballR * pop);
    }
    if (reduced) return;
    projected.copy(ballGroup.position).project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const r = (ballR * 1.1) / worldPerPx();
    handle.style.width = `${r * 2}px`;
    handle.style.height = `${r * 2}px`;
    handle.style.transform = `translate(${x - r}px, ${y - r}px)`;
  };

  let motion: BallMotion = restingMotion();
  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    // Geniş ve alçak bant (mobil): kamera biraz daha yakın.
    camDist = aspect > 1.3 ? 7 : 8;
    camera.aspect = aspect;
    camera.position.z = camDist;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    bounds = planeBounds(FOV, camDist, aspect);
    ballR = (lite ? BALL_FRACTION.lite : BALL_FRACTION.desktop) * bounds.halfH;
    buildGoals(bounds, ballR);
    placeBall();
    render();
  };

  let dragging: { id: number; lastX: number; lastY: number; samples: PointerSample[] } | null = null;
  let pointer: { nx: number; ny: number } | null = null;
  /** Gol anı: top filede, süre dolunca ortaya döner. */
  let scored: { view: GoalView; t: number } | null = null;
  const qTmp = new Quaternion();
  const rotate = (ax: number, ay: number) => {
    if (ay) spinGroup.quaternion.premultiply(qTmp.setFromAxisAngle(AXIS_Y, ay));
    if (ax) spinGroup.quaternion.premultiply(qTmp.setFromAxisAngle(AXIS_X, ax));
  };
  const showGoal = (view: GoalView) => {
    scored = { view, t: 0 };
    view.ripple = { t: 0, y: motion.pos.y, amp: 0.12 };
    burst(view.spec.lineX, Math.min(motion.pos.y + ballR, view.spec.crossY), view.spec.side);
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
    if (scored) {
      scored.t += dt;
      const r = stepInNet(motion, dt, scored.view.spec, ballR);
      motion = r.motion;
      if (r.netHit > 1) scored.view.ripple = { t: 0, y: motion.pos.y, amp: Math.min(0.16, 0.03 * r.netHit) };
      rotate(motion.spin.x * dt, motion.spin.y * dt);
      if (scored.t >= GOAL_RESET_SEC) {
        scored = null;
        motion = { ...restingMotion(), spin: motion.spin };
        pop = 0;
      }
    } else if (!dragging) {
      const r = stepPlay(motion, dt, bounds, ballR, goals.map((g) => g.spec));
      motion = r.motion;
      rotate(motion.spin.x * dt, motion.spin.y * dt);
      if (r.event?.type === 'goal') {
        const view = goals.find((g) => g.spec.side === r.event!.side);
        if (view) showGoal(view);
      }
    }
    if (pop < 1) pop = Math.min(1, pop + dt / POP_SEC);
    for (const g of goals) rippleNet(g, dt);
    stepConfetti(dt);

    const target = parallaxTarget(pointer?.nx ?? null, pointer?.ny ?? null, 0.45);
    camera.position.x = approach(camera.position.x, target.x, 3, dt);
    camera.position.y = approach(camera.position.y, target.y, 3, dt);
    camera.lookAt(0, 0, 0);

    aimBeams(elapsed);
    for (const m of mists) m.s.position.x = m.d.x + Math.sin(elapsed * m.d.speed) * 2.5;
    for (const c of clouds) c.s.position.x = c.d.p[0] + Math.sin(elapsed * c.d.v * 0.5) * 2.2;
    for (const b of smallBalls) {
      b.s.position.x = b.base[0] + Math.sin(elapsed * 0.21 + b.phase) * 0.5;
      b.s.position.y = b.base[1] + Math.sin(elapsed * 0.33 + b.phase) * 0.35;
      b.s.material.rotation += dt * 0.15;
    }
    for (let i = 0; i < pCount; i++) {
      const y = i * 3 + 1;
      pPos[y]! += pVel[i]! * dt;
      pPos[i * 3]! += Math.sin(elapsed * 0.4 + i) * 0.02 * dt;
      if (pPos[y]! > 7) pPos[y] = -6;
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

  // ── Etkileşim ──────────────────────────────────────────────────────────────────────────────────────
  const local = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
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
    const p = local(e);
    dragging = { id: e.pointerId, lastX: p.x, lastY: p.y, samples: [{ t: e.timeStamp, x: p.x, y: p.y }] };
    motion = { ...motion, vel: { x: 0, y: 0 } };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // yakalama olmadan da çalışır
    }
    handle.setAttribute('data-dragging', '');
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const p = local(e);
    const r = dragRotation(p.x - dragging.lastX, p.y - dragging.lastY);
    rotate(r.x, r.y);
    dragging.lastX = p.x;
    dragging.lastY = p.y;
    dragging.samples.push({ t: e.timeStamp, x: p.x, y: p.y });
    if (dragging.samples.length > 12) dragging.samples.shift();
  };
  const onUp = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== dragging.id) return;
    const v = pointerVelocity(dragging.samples);
    dragging = null;
    handle.removeAttribute('data-dragging');
    // İptal (kaydırma vb.): yalnız dönüş, fırlatma yok.
    motion = releaseMotion(motion, e.type === 'pointercancel' ? { x: 0, y: 0 } : v, worldPerPx());
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
      scene.environment = null;
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      handle.remove();
      goalText.remove();
    },
  };
}

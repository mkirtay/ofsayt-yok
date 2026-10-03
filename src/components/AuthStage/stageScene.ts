/**
 * Giriş / kayıt sahnesi (three.js). Yalnız `AuthStage` dinamik olarak yükler → three.js bu iki sayfanın sonradan
 * gelen parçasında kalır, ilk yüke ve diğer sayfalara girmez.
 *
 * Sahne: gece maçı — uzakta projektör huzmeleri, sis, süzülen ışık partikülleri, arkada bulanık küçük toplar; ortada
 * kesik ikosahedron top (beşgenler marka yeşili, bazı altıgenlerde planımızdaki liglerin logoları), parlak kaplama +
 * kenar parlaması. Etkileşim (stageMotion.ts): tut-döndür (atalet), hızlı fırlatınca sekip merkeze dönme, paralaks.
 *
 * Hareketi azalt: tek kare çizilir, döngü ve etkileşim yok. Sekme gizliyken / sahne ekran dışındayken döngü durur.
 * `dispose()` bütün GPU kaynaklarını bırakır ve eklediği öğeleri kaldırır.
 */
import {
  AdditiveBlending,
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
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
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { logoSrc } from '@/utils/logoUrl';
import { panelMesh, pickSpreadHexagons, truncatedIcosahedron, type PanelMesh } from './ballGeometry';
import {
  approach,
  dragRotation,
  parallaxTarget,
  pickLogoIds,
  planeBounds,
  pointerVelocity,
  releaseMotion,
  restingMotion,
  stepMotion,
  type BallMotion,
  type Bounds,
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
};

export type StageHandle = { dispose: () => void };

/** Süper Lig her zaman topta; kalan logolar 34 ligden karışık. */
const PINNED_LEAGUE_IDS = [600];
const FOV = 32;
const BALL_RADIUS = 1;
const AXIS_X = new Vector3(1, 0, 0);
const AXIS_Y = new Vector3(0, 1, 0);

const BRAND_GREEN = 0x00a76f;
const NIGHT = 0x060a14;

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
    blending: AdditiveBlending,
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
    blending: AdditiveBlending,
  });
}

/** Logo dokusu: panel beyazı + ortada logo (oranı korunur). */
function drawLogo(img: HTMLImageElement): CanvasTexture {
  return canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#f4f6f8';
    ctx.fillRect(0, 0, s, s);
    const box = s * 0.5;
    const k = Math.min(box / img.naturalWidth, box / img.naturalHeight);
    const w = img.naturalWidth * k;
    const h = img.naturalHeight * k;
    ctx.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
  });
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
  renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement;
  canvas.className = opts.canvasClassName;
  host.appendChild(canvas);

  const handle = document.createElement('div');
  handle.className = opts.handleClassName;
  if (!reduced) host.appendChild(handle);

  const scene = new Scene();
  scene.fog = new Fog(NIGHT, 10, 28);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 80);
  let camDist = 8;
  camera.position.set(0, 0, camDist);

  // Işık: soğuk tepe ışığı + marka yeşili arka kenar ışığı; masaüstünde yansıma için oda ortamı.
  scene.add(new HemisphereLight(0x9fb4ff, 0x05080f, lite ? 1.1 : 0.7));
  const key = new DirectionalLight(0xffffff, lite ? 2.6 : 2.1);
  key.position.set(3, 4, 5);
  const rimLight = new DirectionalLight(BRAND_GREEN, 2.2);
  rimLight.position.set(-4, 2.5, -3);
  const under = new DirectionalLight(0x4a6cff, 0.5);
  under.position.set(1, -4, 2);
  scene.add(key, rimLight, under);
  if (!lite) {
    const pmrem = new PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture;
    track(env.texture);
    room.dispose();
    pmrem.dispose();
  }

  // ── Projektör huzmeleri ve lambalar ────────────────────────────────────────────────────────────────
  const beamGeo = track(new CylinderGeometry(0.14, 3.4, 18, 32, 1, true));
  beamGeo.translate(0, -9, 0); // tepe (lamba) orijinde, koni -Y yönünde
  const lampTex = track(glowTexture('rgba(255,255,255,1)', 'rgba(190,220,255,0.35)'));
  const beamDefs = (lite
    ? [
        { lamp: [-6, 4.2, -12], target: [-0.5, -3, -2], color: 0xcfe0ff, intensity: 0.9, phase: 0 },
        { lamp: [6.5, 4.4, -13], target: [1, -3, -2], color: 0xbff5de, intensity: 0.8, phase: 2.1 },
      ]
    : [
        { lamp: [-5.2, 4.6, -12], target: [-0.8, -3, -2], color: 0xcfe0ff, intensity: 0.9, phase: 0 },
        { lamp: [5.6, 4.9, -13], target: [1.2, -3, -2], color: 0xbff5de, intensity: 0.8, phase: 2.1 },
        { lamp: [1.2, 6.2, -18], target: [0, -3, -6], color: 0xe6eeff, intensity: 0.55, phase: 4.2 },
        { lamp: [-9.5, 5.4, -18], target: [-3, -3, -6], color: 0xcfe0ff, intensity: 0.5, phase: 1.3 },
      ]) as { lamp: [number, number, number]; target: [number, number, number]; color: number; intensity: number; phase: number }[];
  const beams = beamDefs.map((d) => {
    const mesh = new Mesh(beamGeo, track(beamMaterial(d.color, d.intensity)));
    mesh.position.set(...d.lamp);
    mesh.renderOrder = -2;
    scene.add(mesh);
    const lamp = new Sprite(track(new SpriteMaterial({ map: lampTex, blending: AdditiveBlending, depthWrite: false, transparent: true })));
    lamp.position.set(...d.lamp);
    lamp.scale.setScalar(1.8);
    scene.add(lamp);
    return { mesh, base: new Vector3(...d.target), phase: d.phase };
  });
  const aim = new Vector3();
  const aimBeams = (t: number) => {
    for (const b of beams) {
      aim.copy(b.base);
      aim.x += Math.sin(t * 0.18 + b.phase) * 1.6;
      aim.z += Math.cos(t * 0.13 + b.phase) * 0.8;
      aim.sub(b.mesh.position).normalize();
      b.mesh.quaternion.setFromUnitVectors(new Vector3(0, -1, 0), aim);
    }
  };
  aimBeams(0);

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
  const particles = new Points(
    pGeo,
    track(
      new PointsMaterial({
        size: lite ? 0.16 : 0.13,
        map: dotTex,
        color: 0xcff7e8,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        blending: AdditiveBlending,
        sizeAttenuation: true,
      }),
    ),
  );
  scene.add(particles);

  // ── Arkada süzülen bulanık toplar ───────────────────────────────────────────────────────────────────
  const smallTex = track(blurredBallTexture());
  const smallDefs = [
    { p: [-4.6, 2.1, -6], s: 1.3, o: 0.5 },
    { p: [4.9, -1.5, -7.5], s: 1.5, o: 0.42 },
    { p: [-3.4, -2.3, -4.5], s: 0.9, o: 0.55 },
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

  const halo = new Sprite(track(new SpriteMaterial({ map: track(glowTexture('rgba(0,167,111,0.55)', 'rgba(0,167,111,0.16)')), transparent: true, depthWrite: false, blending: AdditiveBlending })));
  halo.scale.setScalar(6.2);
  halo.position.set(0, 0, -1.6);
  halo.renderOrder = -1;
  scene.add(halo);

  const faces = truncatedIcosahedron();
  const panelOpts = { radius: BALL_RADIUS, inset: 0.955, subdivisions: lite ? 3 : 6, puff: 0.03 };
  const logoCount = lite ? 8 : 12;
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
    new Mesh(track(new SphereGeometry(BALL_RADIUS * 0.985, 48, 32)), physical(0x0b1511, { roughness: 0.85, clearcoat: 0 })),
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
    track(new SphereGeometry(BALL_RADIUS * 1.045, 48, 32)),
    track(
      lite
        ? new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, roughness: 0.1, depthWrite: false })
        : new MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.2, depthWrite: false }),
    ),
  );
  const rim = new Mesh(track(new SphereGeometry(BALL_RADIUS * 1.035, 48, 32)), track(rimMaterial(0x5cf2c0, 2.4, 0.75)));
  ballGroup.add(shell, rim);
  spinGroup.quaternion.setFromAxisAngle(AXIS_X, 0.35).multiply(new Quaternion().setFromAxisAngle(AXIS_Y, -0.6));

  // ── Çizim, boyut, döngü ────────────────────────────────────────────────────────────────────────────
  let width = 1;
  let height = 1;
  let bounds: Bounds = { halfW: 3, halfH: 2 };
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
  const placeHandle = () => {
    if (reduced) return;
    projected.copy(ballGroup.position).project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const r = (BALL_RADIUS * 1.05) / worldPerPx();
    handle.style.width = `${r * 2}px`;
    handle.style.height = `${r * 2}px`;
    handle.style.transform = `translate(${x - r}px, ${y - r}px)`;
  };

  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    const aspect = width / height;
    // Geniş ve alçak bant (mobil): top biraz daha yakın.
    camDist = aspect > 1.3 ? 7 : 8;
    camera.aspect = aspect;
    camera.position.z = camDist;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    bounds = planeBounds(FOV, camDist, aspect);
    placeHandle();
    render();
  };

  let motion: BallMotion = restingMotion();
  let dragging: { id: number; lastX: number; lastY: number; samples: PointerSample[] } | null = null;
  let pointer: { nx: number; ny: number } | null = null;
  const qTmp = new Quaternion();
  const rotate = (ax: number, ay: number) => {
    if (ay) spinGroup.quaternion.premultiply(qTmp.setFromAxisAngle(AXIS_Y, ay));
    if (ax) spinGroup.quaternion.premultiply(qTmp.setFromAxisAngle(AXIS_X, ax));
  };

  let elapsed = 0;
  const update = (dt: number) => {
    elapsed += dt;
    if (!dragging) {
      motion = stepMotion(motion, dt, bounds, BALL_RADIUS);
      rotate(motion.spin.x * dt, motion.spin.y * dt);
    }
    ballGroup.position.set(motion.pos.x, motion.pos.y, 0);
    halo.position.set(motion.pos.x * 0.8, motion.pos.y * 0.8, -1.6);

    const target = parallaxTarget(pointer?.nx ?? null, pointer?.ny ?? null, 0.45);
    camera.position.x = approach(camera.position.x, target.x, 3, dt);
    camera.position.y = approach(camera.position.y, target.y, 3, dt);
    camera.lookAt(0, 0, 0);

    aimBeams(elapsed);
    for (const m of mists) m.s.position.x = m.d.x + Math.sin(elapsed * m.d.speed) * 2.5;
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
    placeHandle();
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
    motion = e.type === 'pointercancel' ? releaseMotion(motion, { x: 0, y: 0 }, worldPerPx()) : releaseMotion(motion, v, worldPerPx());
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
    },
  };
}

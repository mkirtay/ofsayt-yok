/**
 * Giriş / kayıt sahnesi (three.js). Yalnız `AuthStage` dinamik olarak yükler → three.js bu iki sayfanın sonradan
 * gelen parçasında kalır, ilk yüke ve diğer sayfalara girmez.
 *
 * Sahne: kamera sahaya ~30° yukarıdan bakar. Dokulu çim (biçme şeritleri), perspektifli saha çizgileri, sahanın iki
 * ucunda derin fileli kaleler (mobilde tek); uzak çim gökyüzüne doğru silinir. Top çimin üstünde durur, altında
 * yüksekliğe göre değişen yumuşak gölge. Tema: koyu temada gece (projektör huzmeleri, sis, ışık partikülleri), açık
 * temada gündüz (güneş, yumuşak huzmeler, bulutlar); değişince renkler yeniden kurulmadan yumuşakça geçer.
 * Sahanın çevresinde marka renklerinde "Ofsayt Yok" reklam panoları (görünmez duvar: top seker, kadrajdan çıkmaz).
 * Etkileşim (stageMotion.ts): nişan al ve şut çek — topa bas, geri çek (önünde yön + güç oku), bırak; yalnız duran /
 * çok yavaş top şutlanır. Top yay çizer, sekip yuvarlanır, durduğu yerde kalır. Gol: file dalgası + "GOL!" + konfeti,
 * 1,5 sn sonra top orta noktaya. İlk şuta kadar topun yanında ipucu. Fareyle hafif paralaks.
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
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  BoxGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { logoSrc } from '@/utils/logoUrl';
import {
  LIGHT_BLEND,
  beamMaterial,
  boardTexture,
  buildBall,
  buildGoal,
  canvasTexture,
  cloudTexture,
  createEnvTexture,
  glowTexture,
  grassTexture,
  groundAlphaTexture,
  loadBallLogos,
  makeArrow,
  rippleNet,
  shadowTexture,
} from '@/components/pitch3d/pitchKit';
import {
  BALL_RADIUS,
  CEILING,
  DEFAULT_GOAL,
  GOAL_RESET_SEC,
  TOUCH_Z,
  approach,
  arenaFor,
  canShoot,
  mix,
  mixColor,
  parallaxTarget,
  pickLogoIds,
  restingBall,
  rollingSpin,
  shadowFor,
  shotFromPull,
  stepBall,
  type Ball,
  type Shot,
  type V3,
  type Walls,
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
  hintClassName: string;
  /** Gol yazısı (dile göre: "GOL!" / "GOAL!"). */
  goalLabel: string;
  /** İlk şuta kadar gösterilen ipucu. */
  hintLabel: string;
};

export type StageHandle = { dispose: () => void; setLabels: (goalLabel: string, hintLabel: string) => void };

/** Süper Lig her zaman topta; kalan logolar 34 ligden karışık. */
const PINNED_LEAGUE_IDS = [600];
const FOV = 35;
/** Kameranın yere bakış açısı (derece) ve baktığı yükseklik. */
const TILT_DEG = 42;
const TARGET_Y = 0.35;
const POP_SEC = 0.35;
const CONFETTI_SEC = 1.6;
/** Reklam panoları: yükseklik ve kalınlık. */
const BOARD_H = 0.42;
const BOARD_T = 0.08;
/** Çim düzlemi: yakın kenar z, uzak kenar z (uzakta gökyüzüne silinir). */
const GROUND_NEAR_Z = 14;
const GROUND_FAR_Z = -16;
/** Saha çizgileri: kale çizgileri ±lineX, kenar çizgileri ±TOUCH_Z. */
const LINES_HALF_X = DEFAULT_GOAL.lineX + 0.7;
const LINES_HALF_Z = TOUCH_Z + 0.6;

const BRAND_GREEN = 0x00a76f;
const NIGHT_FOG = 0x060a14;
const DAY_FOG = 0xd3e8f2;
const CONFETTI_COLORS = [0x00a76f, 0x2fe3a0, 0xffffff, 0xffc83d, 0x007b55];

/**
 * Saha çizgileri (saydam zemin üstüne beyaz): kale / kenar / orta çizgi, orta yuvarlak, ceza ve kale alanları.
 * `clipMinX`: bu x'in solu çizilmez (mobilde sol pano orta çizginin gerisinde; dışarıda çizgi kalmasın).
 */
function pitchLinesTexture(size: number, clipMinX: number | null): CanvasTexture {
  return canvasTexture(size, (ctx, s) => {
    const k = s / (2 * LINES_HALF_X); // px / birim (kare doku: z ekseni de aynı ölçek, aşağıda sıkıştırılır)
    const kz = s / (2 * LINES_HALF_Z);
    const X = (x: number) => (x + LINES_HALF_X) * k;
    const Z = (z: number) => (z + LINES_HALF_Z) * kz;
    if (clipMinX != null) {
      ctx.beginPath();
      ctx.rect(X(clipMinX), 0, s, s);
      ctx.clip();
    }
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
    ellipse(0, 0, 1.1);
    const dot = (x: number, z: number) => {
      ctx.beginPath();
      ctx.ellipse(X(x), Z(z), 0.07 * k, 0.07 * kz, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fill();
    };
    dot(0, 0);
    for (const side of [-1, 1]) {
      const gx = side * L;
      rect(Math.min(gx, gx - side * 1.45), -3.9, Math.max(gx, gx - side * 1.45), 3.9);
      rect(Math.min(gx, gx - side * 0.6), -2.95, Math.max(gx, gx - side * 0.6), 2.95);
      dot(gx - side * 1.1, 0);
      // Ceza yayı: ceza alanının dışında kalan kısım
      const a = Math.acos(0.45 / 0.85);
      const start = side > 0 ? Math.PI - a : -a;
      ellipse(gx - side * 1.1, 0, 0.85, start, start + 2 * a);
    }
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
  const hint = document.createElement('div');
  hint.className = opts.hintClassName;
  hint.textContent = opts.hintLabel;
  if (!reduced) host.append(handle, goalText, hint);

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
  const envTex: Texture | null = lite ? null : track(createEnvTexture(renderer));

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
  const linesTex = track(pitchLinesTexture(lite ? 1024 : 2048, lite ? arenaFor(true).walls.minX : null));
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

  const ballView = track(buildBall({ lite, envTex, logoCount: lite ? 3 : 6 }));
  spinGroup.add(ballView.spin);
  ballGroup.add(...ballView.group.children.filter((c) => c !== ballView.spin));
  const rimMat = ballView.rimMat;

  // ── Kaleler ve konfeti ─────────────────────────────────────────────────────────────────────────────
  const postMat = track(new MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.35, metalness: 0.1, emissive: 0x1a222b, envMap: envTex }));
  const netMat = track(new LineBasicMaterial({ color: 0xdfe8f0, transparent: true, opacity: 0.55, depthWrite: false }));
  // Mobil bantta yer dar: tek kale (sağ), sol pano orta çizginin gerisinde; kamera daha yakın.
  const arena = arenaFor(lite);
  const walls: Walls = arena.walls;
  const goals = arena.goals.map((spec) => buildGoal(spec, postMat, netMat));
  for (const g of goals) scene.add(g.group);
  const goalSpecList = goals.map((g) => g.spec);
  /** Başlama ve gol sonrası dönüş: orta nokta. */
  const start: V3 = { x: 0, y: R, z: 0 };

  // ── Reklam panoları (iç yüzleri duvar çizgisinde) ─────────────────────────────────────────────────────
  const boardTex = track(boardTexture());
  const boardMat = track(new MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.6 }));
  const lenX = walls.maxX - walls.minX + 2 * BOARD_T;
  const lenZ = walls.maxZ - walls.minZ;
  boardTex.repeat.set(Math.max(1, Math.round(lenX / 4)), 1);
  const boardGeoX = track(new BoxGeometry(lenX, BOARD_H, BOARD_T));
  const boardGeoZ = track(new BoxGeometry(lenZ, BOARD_H, BOARD_T));
  const midX = (walls.minX + walls.maxX) / 2;
  const midZ = (walls.minZ + walls.maxZ) / 2;
  const boards: [BoxGeometry, number, number, number][] = [
    [boardGeoX, midX, walls.minZ - BOARD_T / 2, 0],
    [boardGeoX, midX, walls.maxZ + BOARD_T / 2, 0],
    [boardGeoZ, walls.minX - BOARD_T / 2, midZ, Math.PI / 2],
    [boardGeoZ, walls.maxX + BOARD_T / 2, midZ, -Math.PI / 2],
  ];
  for (const [geo, x, z, ry] of boards) {
    const b = new Mesh(geo, boardMat);
    b.position.set(x, BOARD_H / 2, z);
    b.rotation.y = ry;
    scene.add(b);
  }

  // ── Nişan oku ──────────────────────────────────────────────────────────────────────────────────────
  const arrowMat = track(new MeshBasicMaterial({ color: BRAND_GREEN, transparent: true, opacity: 0.92, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false }));
  const arrow = makeArrow(arrowMat);
  for (const g of arrow.geometries) track(g);
  scene.add(arrow.group);

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
    // Panolar gece LED gibi parlar
    boardMat.emissiveIntensity = mix(0.85, 0.2, d);
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
  // Kadraja sığacaklar: panoların dış köşeleri (alt / üst), kaleler ve uzak taraftaki tavan (havalanan top da
  // görünür kalsın). Saha panel genişliğini doldurur, gökyüzü azalır.
  const fitPoints: Vector3[] = [];
  for (const x of [walls.minX - BOARD_T, walls.maxX + BOARD_T]) {
    for (const z of [walls.minZ - BOARD_T, walls.maxZ + BOARD_T]) for (const y of [0, BOARD_H]) fitPoints.push(new Vector3(x, y, z));
    fitPoints.push(new Vector3(x, CEILING, walls.minZ));
  }
  for (const g of goalSpecList) {
    for (const x of [g.lineX, g.backX]) for (const y of [0, g.height]) for (const z of [-g.halfW, g.halfW]) fitPoints.push(new Vector3(x, y, z));
  }
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
      return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.96;
    });
  };
  const searchDistance = () => {
    let lo = 3;
    let hi = 60;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      placeCamera(mid);
      if (fits()) hi = mid;
      else lo = mid;
    }
    placeCamera(hi);
    return hi;
  };
  const fitCamera = () => {
    camTarget = new Vector3(midX, TARGET_Y, midZ);
    // Dikeyde boşluk dengelensin: kadraj sığdıktan sonra noktaların ekrandaki üst / alt taşmasını eşitleyecek kadar
    // hedefi ekranın "yukarı" yönünde kaydır, yeniden sığdır (birkaç tur yeter).
    const v = new Vector3();
    const up = new Vector3(0, Math.cos((TILT_DEG * Math.PI) / 180), -Math.sin((TILT_DEG * Math.PI) / 180));
    for (let iter = 0; iter < 4; iter++) {
      const dist = searchDistance();
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of fitPoints) {
        v.copy(p).project(camera);
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
      }
      const off = (hi + lo) / 2;
      if (Math.abs(off) < 0.01) break;
      camTarget.addScaledVector(up, off * dist * Math.tan((FOV * Math.PI) / 360));
    }
  };

  let firstFrame = true;
  const render = () => {
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      canvas.setAttribute('data-ready', '');
    }
  };

  loadBallLogos(
    ballView,
    pickLogoIds(HUB_LEAGUE_IDS, ballView.logoMaterials.length, PINNED_LEAGUE_IDS)
      .map((id) => logoSrc(sportmonksLeagueLogoUrl(id), 64))
      .filter((u): u is string => Boolean(u)),
    {
      maxAnisotropy: maxAniso,
      isDisposed: () => disposed,
      // döngü duruyorsa (hareketi azalt / gizli) logolu kare yine çizilsin
      onLoad: () => {
        if (!raf) render();
      },
    },
  );

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
    const rPx = Math.max(22, ((R * 1.15) / (dist * Math.tan((FOV * Math.PI) / 360))) * (height / 2));
    handle.style.width = `${rPx * 2}px`;
    handle.style.height = `${rPx * 2}px`;
    handle.style.transform = `translate(${x - rPx}px, ${y - rPx}px)`;
    if (!hintDone) hint.style.transform = `translate(${x}px, ${y - rPx - 6}px) translate(-50%, -100%)`;
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

  /** Nişan: basılı tutulurken işaretçinin zemindeki noktasından hesaplanan şut (null = iptal / güç yetersiz). */
  let aiming: { id: number; shot: Shot | null } | null = null;
  let hintDone = false;
  let pointer: { nx: number; ny: number } | null = null;
  /** Gol anı: süre dolunca top orta noktaya döner. */
  let scored: { side: -1 | 1; t: number } | null = null;
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
    {
      const out = stepBall(ball, dt, goalSpecList, R, walls);
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
    }
    if (aiming && !canShoot(ball, R)) cancelAim();
    updateArrow();
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

  // ── Etkileşim: nişan al ve şut çek — topa bas, geri çek (ok: yön + güç), bırak ────────────────────────────
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const groundPlane = new Plane(new Vector3(0, 1, 0), -R);
  const hit = new Vector3();
  const local = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };
  /** İşaretçinin top merkezi yüksekliğindeki zemin noktası (ufkun üstündeyse null). */
  const pointOnField = (e: PointerEvent): { x: number; z: number } | null => {
    const p = local(e);
    ndc.set((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(groundPlane, hit) ? { x: hit.x, z: hit.z } : null;
  };
  const arrowColor = new Color();
  const updateArrow = () => {
    const shot = aiming?.shot;
    arrow.group.visible = Boolean(shot);
    if (!shot) return;
    arrow.group.position.set(ball.pos.x, 0.03, ball.pos.z);
    arrow.group.rotation.y = Math.atan2(-shot.dirZ, shot.dirX);
    arrow.set(R * 1.15, 0.35 + shot.power * 2.1);
    // Güç arttıkça yeşilden sarıya
    arrowColor.setHex(mixColor(BRAND_GREEN, 0xffc83d, shot.power));
    arrowMat.color.copy(arrowColor);
  };
  const cancelAim = () => {
    aiming = null;
    handle.removeAttribute('data-dragging');
    arrow.group.visible = false;
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
    if (scored || pop < 1 || !canShoot(ball, R)) return;
    e.preventDefault();
    aiming = { id: e.pointerId, shot: null };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // yakalama olmadan da çalışır
    }
    handle.setAttribute('data-dragging', '');
  };
  const onMove = (e: PointerEvent) => {
    if (!aiming || e.pointerId !== aiming.id) return;
    const at = pointOnField(e);
    // İşaretçi ufkun üstündeyse zeminde karşılığı yok: son nişan korunur.
    if (!at) return;
    aiming.shot = shotFromPull(at.x - ball.pos.x, at.z - ball.pos.z);
    updateArrow();
  };
  const onUp = (e: PointerEvent) => {
    if (!aiming || e.pointerId !== aiming.id) return;
    // İptal (kaydırma vb.) ya da yetersiz güç: şut yok.
    const shot = e.type === 'pointercancel' ? null : aiming.shot;
    cancelAim();
    if (!shot) return;
    const roll = rollingSpin(shot.vel.x, shot.vel.z, R);
    ball = { ...ball, vel: shot.vel, spin: { x: roll.x * 0.6, y: 0, z: roll.z * 0.6 } };
    if (!hintDone) {
      hintDone = true;
      hint.setAttribute('data-hidden', '');
    }
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
    setLabels(goalLabel: string, hintLabel: string) {
      goalText.textContent = goalLabel;
      hint.textContent = hintLabel;
    },
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
      hint.remove();
    },
  };
}

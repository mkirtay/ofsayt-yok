/**
 * /frikik sahnesi (three.js). Yalnız `Frikik` bileşeni dinamik olarak yükler → three.js bu sayfanın sonradan gelen
 * parçasında kalır. Yapı taşları giriş sahnesiyle ortak (components/pitch3d/pitchKit.ts); fizik ve skor
 * lib/frikik/sim.ts'te (belirlenimci; sunucu aynı kodu çalıştırır) — burası yalnız çizer ve girdiyi toplar.
 *
 * Kamera topun arkasında, kaleye bakar. Baraj ve kaleci oyuncak "peg" figürler. Kontrol (sapan): topu tut, geriye çek
 * — yön çekmenin tersi, güç çekme uzunluğu; bırakırken parmağı yana kıvır → falso. Yalnız KISA bir yön oku (ilk ~1,8 m)
 * ve güç çubuğu gösterilir; topun nereye gideceği (yükseklik, falso, sapma) oyuncunun tahminine kalır.
 * Çekme yolu 16 noktalı tam sayı girdiye çevrilir (lib/frikik/pull.ts); gerisini simülasyon hesaplar.
 * Akış: tur (nişan) → uçuş → sonuç beklemesi → sıradaki tur … 5 vuruş → `onFinish`.
 * Sekme gizliyken / sahne ekran dışındayken döngü durur. `dispose()` GPU kaynaklarını bırakır.
 */
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
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
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { logoSrc } from '@/utils/logoUrl';
import { pickLogoIds } from '@/components/AuthStage/stageMotion';
import {
  boardTexture,
  buildBall,
  buildGoal,
  canvasTexture,
  createEnvTexture,
  grassTexture,
  loadBallLogos,
  makeConfetti,
  rippleNet,
  shadowTexture,
} from '@/components/pitch3d/pitchKit';
import {
  BALL_R,
  FIGURE,
  GOAL,
  KEEPER,
  MAX_RELEASE_TICK,
  SHOTS_PER_SERIES,
  TICK,
  aimBasis,
  keeperZ,
  makeRound,
  powerWindow,
  shotParams,
  startShot,
  stepShot,
  type Round,
  type ShotInput,
  type ShotResult,
  type ShotState,
} from '@/lib/frikik/sim';
import { flickPx, pullToInput, type ScreenPoint } from '@/lib/frikik/pull';

export type FrikikSummary = { seed: number; inputs: ShotInput[]; results: ShotResult[]; total: number };

export type FrikikOptions = {
  /** Mobil: düşük pixelRatio, ucuz malzeme, küçük dokular. */
  lite: boolean;
  canvasClassName: string;
  handleClassName: string;
  goalClassName: string;
  /** Nişan katmanı (SVG: kısa yön oku, güç çubuğu) sınıfı. */
  trailClassName: string;
  goalLabel: string;
  onRound: (index: number) => void;
  onShot: (index: number, result: ShotResult, total: number) => void;
  onFinish: (summary: FrikikSummary) => void;
  /** İlk kaydırma (ipucu kapansın). */
  onAimStart: () => void;
};

export type FrikikHandle = { dispose: () => void; start: (seed: number) => void; setGoalLabel: (label: string) => void };

const CONFETTI_COLORS = [0x00a76f, 0x2fe3a0, 0xffffff, 0xffc83d, 0x007b55];
/** Sonuçtan sonra bekleme (tick): gol kutlaması daha uzun. */
const HOLD_TICKS = { goal: 210, other: 130 };
const LINES = { minX: -30, maxX: 2, halfZ: 26 };

/** Ceza sahası çizgileri (saydam zemin üstüne beyaz): kale çizgisi, ceza alanı, altı pas, penaltı noktası, yay. */
function boxLinesTexture(pxPerM: number): CanvasTexture {
  const w = Math.round((LINES.maxX - LINES.minX) * pxPerM);
  const h = Math.round(LINES.halfZ * 2 * pxPerM);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const X = (x: number) => (x - LINES.minX) * pxPerM;
    const Y = (z: number) => (z + LINES.halfZ) * pxPerM;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, 0.12 * pxPerM);
    const line = (x0: number, z0: number, x1: number, z1: number) => {
      ctx.beginPath();
      ctx.moveTo(X(x0), Y(z0));
      ctx.lineTo(X(x1), Y(z1));
      ctx.stroke();
    };
    line(0, -LINES.halfZ, 0, LINES.halfZ);
    ctx.strokeRect(X(-16.5), Y(-20.16), 16.5 * pxPerM, 40.32 * pxPerM);
    ctx.strokeRect(X(-5.5), Y(-9.16), 5.5 * pxPerM, 18.32 * pxPerM);
    ctx.beginPath();
    ctx.arc(X(-11), Y(0), 0.14 * pxPerM, 0, Math.PI * 2);
    ctx.fill();
    // Ceza yayı: ceza alanının dışında kalan kısım
    const a = Math.acos(5.5 / 9.15);
    ctx.beginPath();
    ctx.arc(X(-11), Y(0), 9.15 * pxPerM, Math.PI - a, Math.PI + a);
    ctx.stroke();
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Kale arkası tribün: koyu zemin üstünde sıra sıra renkli noktalar (seyirci). */
function standTexture(): CanvasTexture {
  const tex = canvasTexture(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#0d1524');
    g.addColorStop(1, '#172338');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const palette = ['#e8eef5', '#00a76f', '#ffc83d', '#c9d4e2', '#2fe3a0', '#8fa3bd', '#d9534f'];
    for (let row = 0; row < 22; row++) {
      for (let i = 0; i < 64; i++) {
        if (rnd() < 0.12) continue;
        ctx.fillStyle = palette[Math.floor(rnd() * palette.length)]!;
        ctx.globalAlpha = 0.55 + rnd() * 0.4;
        ctx.beginPath();
        ctx.arc(i * 8 + 4 + (row % 2) * 4, row * 22 + 14 + rnd() * 3, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  });
  return tex;
}

/** Oyuncak "peg" figür: taban + konik gövde (forma) + bant + baş. Kaleci: yana açık kollar ve eldivenler. */
function makePeg(colors: { body: number; band: number; head: number }, keeper: boolean, geos: BufferGeometry[], mats: Material[]): Group {
  const g = new Group();
  const h = keeper ? KEEPER.height : FIGURE.height;
  const bodyH = h - 0.42;
  const mat = (color: number, roughness = 0.55) => {
    const m = new MeshStandardMaterial({ color, roughness, metalness: 0 });
    mats.push(m);
    return m;
  };
  const add = (geo: BufferGeometry, m: Material, x: number, y: number, z: number) => {
    geos.push(geo);
    const mesh = new Mesh(geo, m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(new CylinderGeometry(0.27, 0.29, 0.08, 20), mat(0x1c2430), 0, 0.04, 0);
  add(new CylinderGeometry(0.17, 0.25, bodyH, 20), mat(colors.body), 0, 0.08 + bodyH / 2, 0);
  add(new CylinderGeometry(0.2, 0.215, 0.14, 20), mat(colors.band), 0, 0.08 + bodyH * 0.55, 0);
  add(new SphereGeometry(0.2, 20, 14), mat(colors.head, 0.4), 0, h - 0.2, 0);
  if (keeper) {
    const arm = add(new CylinderGeometry(0.075, 0.075, 1.5, 12), mat(colors.body), 0, h - 0.62, 0);
    arm.rotation.x = Math.PI / 2;
    const glove = mat(colors.band, 0.4);
    add(new SphereGeometry(0.13, 14, 10), glove, 0, h - 0.62, -0.78);
    add(new SphereGeometry(0.13, 14, 10), glove, 0, h - 0.62, 0.78);
  }
  return g;
}

export function mountFrikik(host: HTMLElement, opts: FrikikOptions): FrikikHandle {
  const { lite } = opts;
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  let disposed = false;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  const canvas = renderer.domElement;
  canvas.className = opts.canvasClassName;
  const handle = document.createElement('div');
  handle.className = opts.handleClassName;
  const goalText = document.createElement('div');
  goalText.className = opts.goalClassName;
  goalText.textContent = opts.goalLabel;
  // Nişan katmanı (ekran uzayı, SVG): kısa yön oku + güç çubuğu. Yalnız çekerken görünür.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const el = (name: string, attrs: Record<string, string | number>, parent: Element) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    parent.appendChild(node);
    return node;
  };
  const trail = document.createElementNS(SVG_NS, 'svg');
  trail.setAttribute('class', opts.trailClassName);
  trail.setAttribute('aria-hidden', 'true');
  trail.style.visibility = 'hidden';
  const arrowShadow = el('polyline', { fill: 'none', stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, trail);
  const arrowLine = el('polyline', { fill: 'none', stroke: '#fff', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, trail);
  const arrowHead = el('polygon', { fill: '#fff', stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, trail);
  // Güç çubuğu: çok güçsüz | uygun | aşırı güçlü (bölgeler tura göre: powerWindow) + imleç
  const BAR_W = 150;
  const BAR_H = 6;
  const bar = el('g', {}, trail);
  el('rect', { x: -3, y: -3, width: BAR_W + 6, height: BAR_H + 6, rx: 6, fill: 'rgba(6,12,20,0.6)' }, bar);
  const barWeak = el('rect', { x: 0, y: 0, width: 1, height: BAR_H, fill: '#e5a23d' }, bar);
  const barOk = el('rect', { x: 0, y: 0, width: 1, height: BAR_H, fill: '#00a76f' }, bar);
  const barOver = el('rect', { x: 0, y: 0, width: 1, height: BAR_H, fill: '#e5322d' }, bar);
  const barMarker = el('rect', { x: -2, y: -4, width: 4, height: BAR_H + 8, rx: 2, fill: '#fff' }, bar);
  host.append(canvas, trail, handle, goalText);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new Scene();
  const fog = new Fog(0x0a1220, 45, 110);
  scene.fog = fog;
  const camera = new PerspectiveCamera(42, 1, 0.1, 200);
  const hemi = new HemisphereLight(0x9fb4ff, 0x0a1a10, 1);
  const key = new DirectionalLight(0xffffff, 2);
  key.position.set(-8, 14, 6);
  scene.add(hemi, key);
  const envTex: Texture | null = lite ? null : track(createEnvTexture(renderer));

  // ── Zemin, çizgiler, tribün, pano ─────────────────────────────────────────────────────────────────
  const grass = track(grassTexture(lite ? 256 : 512));
  grass.repeat.set(160 / 4, 110 / 4);
  grass.anisotropy = maxAniso;
  const ground = new Mesh(track(new PlaneGeometry(160, 110)), track(new MeshStandardMaterial({ map: grass, roughness: 0.95, metalness: 0 })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-40, 0, 0);
  scene.add(ground);
  const linesTex = track(boxLinesTexture(lite ? 20 : 32));
  linesTex.anisotropy = maxAniso;
  const lines = new Mesh(
    track(new PlaneGeometry(LINES.maxX - LINES.minX, LINES.halfZ * 2)),
    track(new MeshStandardMaterial({ map: linesTex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })),
  );
  lines.rotation.x = -Math.PI / 2;
  lines.position.set((LINES.minX + LINES.maxX) / 2, 0.004, 0);
  scene.add(lines);

  const standTex = track(standTexture());
  standTex.repeat.set(10, 1);
  standTex.wrapS = RepeatWrapping;
  const standMat = track(new MeshBasicMaterial({ map: standTex, color: 0xffffff, fog: true }));
  const stand = new Mesh(track(new PlaneGeometry(200, 6.5)), standMat);
  stand.rotation.y = -Math.PI / 2;
  stand.position.set(12, 4.1, 0);
  scene.add(stand);
  const boardTex = track(boardTexture());
  boardTex.repeat.set(14, 1);
  const boardMat = track(new MeshStandardMaterial({ map: boardTex, emissiveMap: boardTex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.6 }));
  const board = new Mesh(track(new PlaneGeometry(90, 0.9)), boardMat);
  board.rotation.y = -Math.PI / 2;
  board.position.set(6.2, 0.45, 0);
  scene.add(board);

  // ── Kale, top, gölgeler ───────────────────────────────────────────────────────────────────────────
  const postMat = track(new MeshStandardMaterial({ color: 0xf6f8fa, roughness: 0.35, metalness: 0.1, emissive: 0x1a222b, envMap: envTex }));
  const netMat = track(new LineBasicMaterial({ color: 0xe6edf4, transparent: true, opacity: 0.55, depthWrite: false }));
  const goal = buildGoal(GOAL, postMat, netMat);
  for (const g of goal.geometries) track(g);
  scene.add(goal.group);

  const ballView = track(buildBall({ lite, envTex, logoCount: lite ? 2 : 4 }));
  ballView.group.scale.setScalar(BALL_R);
  scene.add(ballView.group);
  const shadowTex = track(shadowTexture());
  const shadowGeo = track(new PlaneGeometry(1, 1));
  const makeShadow = (size: number, opacity: number) => {
    const m = new Mesh(shadowGeo, track(new MeshBasicMaterial({ map: shadowTex, color: 0x000000, transparent: true, depthWrite: false, opacity })));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.008;
    m.scale.setScalar(size);
    scene.add(m);
    return m;
  };
  const ballShadow = makeShadow(BALL_R * 2.8, 0.5);

  // ── Baraj ve kaleci (oyuncak figürler) ─────────────────────────────────────────────────────────────
  const pegGeos: BufferGeometry[] = [];
  const pegMats: Material[] = [];
  const wallPegs = Array.from({ length: 5 }, () => {
    const peg = makePeg({ body: 0x2a4fb0, band: 0xffffff, head: 0xf3dcc0 }, false, pegGeos, pegMats);
    scene.add(peg);
    return { peg, shadow: makeShadow(0.95, 0.4) };
  });
  const keeperPeg = makePeg({ body: 0xffc83d, band: 0x0b1511, head: 0xf3dcc0 }, true, pegGeos, pegMats);
  keeperPeg.position.x = KEEPER.x;
  scene.add(keeperPeg);
  const keeperShadow = makeShadow(1.3, 0.4);
  for (const x of [...pegGeos, ...pegMats]) track(x);

  const confetti = makeConfetti(lite ? 70 : 120, lite ? 0.2 : 0.16, CONFETTI_COLORS);
  track(confetti);
  scene.add(confetti.points);

  // ── Tema ───────────────────────────────────────────────────────────────────────────────────────────
  const applyTheme = () => {
    const day = document.documentElement.getAttribute('data-theme') === 'light';
    fog.color.setHex(day ? 0xcfe6f2 : 0x0a1220);
    hemi.color.setHex(day ? 0xeaf6ff : 0x8ea6e8);
    hemi.groundColor.setHex(day ? 0x5d8a46 : 0x06120a);
    hemi.intensity = day ? 1.3 : 0.8;
    key.color.setHex(day ? 0xfff0d2 : 0xe6eeff);
    key.intensity = day ? 2.5 : 1.9;
    // Gece tribün sönük: kale ve top öne çıksın
    standMat.color.setHex(day ? 0xdfe6ee : 0x4a546a);
    boardMat.emissiveIntensity = day ? 0.2 : 0.75;
    postMat.emissive.setHex(day ? 0x000000 : 0x1a222b);
    renderer.toneMappingExposure = day ? 1 : 0.95;
  };
  applyTheme();

  // ── Oyun durumu ────────────────────────────────────────────────────────────────────────────────────
  let width = 1;
  let height = 1;
  let seed = 0;
  let index = 0;
  let round: Round | null = null;
  let basis = { fx: 1, fz: 0, rx: 0, rz: 1 };
  let phase: 'idle' | 'aim' | 'flight' | 'hold' | 'done' = 'idle';
  let roundTick = 0;
  let shot: ShotState | null = null;
  let holdLeft = 0;
  let inputs: ShotInput[] = [];
  let results: ShotResult[] = [];
  let total = 0;
  /** Çekme: işaretçi örnekleri (px, topun ekrandaki yerine göre; zamanlı) ve son hesaplanan girdi. */
  let swiping: { id: number; samples: (ScreenPoint & { t: number })[]; input: ShotInput | null } | null = null;
  /** Yana kıvrım (falso) penceresi: yön bu kadar önceki çekme noktasından, falso o andan beri yana kaymadan. */
  const FLICK_WINDOW_MS = 130;
  const ballPos = new Vector3();
  const camPos = new Vector3();
  const camLook = new Vector3();
  const camPosTarget = new Vector3();
  const camLookTarget = new Vector3();
  let camSnap = true;
  const qTmp = new Quaternion();
  const axis = new Vector3();
  const projected = new Vector3();
  const ballScreen = { x: 0, y: 0, r: 24 };

  const render = () => {
    renderer.render(scene, camera);
    canvas.setAttribute('data-ready', '');
  };

  const frameCamera = () => {
    if (!round) return;
    const portrait = width / height < 1;
    // Dar açılı (tele) kamera topun epey arkasında: kale büyük görünür, top kadrajın altında (kaydırma yukarı doğru).
    const back = portrait ? 9 : 10;
    const up = portrait ? 2.9 : 2.5;
    camera.fov = portrait ? 46 : 28;
    camera.updateProjectionMatrix();
    camPosTarget.set(round.ball.x - basis.fx * back, up, round.ball.z - basis.fz * back);
    // Bakış yüksekliği: top kadrajın ~%75–80'inde, kale orta-üst bölgede (üstte boş gökyüzü az) kalacak şekilde
    const lookY = portrait ? 0.2 : 0.3;
    camLookTarget.set(0, lookY, 0);
  };

  const beginRound = (i: number) => {
    index = i;
    round = makeRound(seed, i);
    basis = aimBasis(round);
    roundTick = 0;
    shot = null;
    swiping = null;
    handle.removeAttribute('data-dragging');
    trail.style.visibility = 'hidden';
    ballPos.set(round.ball.x, BALL_R, round.ball.z);
    wallPegs.forEach((w, k) => {
      const f = round!.wall[k];
      w.peg.visible = w.shadow.visible = Boolean(f);
      if (!f) return;
      w.peg.position.set(f.x, 0, f.z);
      w.shadow.position.set(f.x, 0.008, f.z);
    });
    const win = powerWindow(round);
    barWeak.setAttribute('width', String(BAR_W * win.weak));
    barOk.setAttribute('x', String(BAR_W * win.weak));
    barOk.setAttribute('width', String(Math.max(0, BAR_W * (win.over - win.weak))));
    barOver.setAttribute('x', String(BAR_W * win.over));
    barOver.setAttribute('width', String(BAR_W * (1 - win.over)));
    frameCamera();
    phase = 'aim';
    opts.onRound(i);
  };

  const placeHandle = () => {
    projected.copy(ballPos).project(camera);
    ballScreen.x = (projected.x * 0.5 + 0.5) * width;
    ballScreen.y = (-projected.y * 0.5 + 0.5) * height;
    const dist = camera.position.distanceTo(ballPos);
    const rPx = ((BALL_R / (dist * Math.tan((camera.fov * Math.PI) / 360))) * height) / 2;
    // Dokunma hedefi: en az 64 px çap
    ballScreen.r = Math.max(32, rPx * 1.6);
    const show = phase === 'aim' && projected.z < 1;
    handle.style.visibility = show ? '' : 'hidden';
    if (!show) return;
    handle.style.width = handle.style.height = `${ballScreen.r * 2}px`;
    handle.style.transform = `translate(${ballScreen.x - ballScreen.r}px, ${ballScreen.y - ballScreen.r}px)`;
  };

  const toScreen = (x: number, y: number, z: number) => {
    projected.set(x, y, z).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height };
  };

  /** Tam güç için çekme mesafesi (px): alanın yüksekliğine göre, dokunmaya uygun aralıkta. */
  const maxPullPx = () => Math.min(170, Math.max(90, height * 0.26));

  /**
   * Çekmeden girdi: yön / güç `FLICK_WINDOW_MS` önceki çekme noktasından (yol oraya kadar), falso o andan beri yana
   * kaymadan. Parmak durunca pencere kayar → falso sıfırlanır, nişan son konuma oturur.
   */
  const computeInput = (now: number): ShotInput | null => {
    if (!swiping) return null;
    const s = swiping.samples;
    let anchorIdx = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i]!.t <= now - FLICK_WINDOW_MS) {
        anchorIdx = i;
        break;
      }
    }
    const anchor = s[anchorIdx]!;
    return pullToInput(s.slice(0, anchorIdx + 1), flickPx(anchor, s[s.length - 1]!), maxPullPx(), roundTick);
  };

  /** Girdiyi günceller; kısa yön okunu (sapmasız nişan, ilk ~1,8 m, falso yönünde hafif eğik) ve güç çubuğunu çizer. */
  const updateSwipe = (now: number) => {
    if (!swiping || !round) return;
    swiping.input = computeInput(now);
    const params = swiping.input ? shotParams(round, swiping.input) : null;
    if (!params) {
      trail.style.visibility = 'hidden';
      return;
    }
    const pts: { x: number; y: number }[] = [];
    const LEN = 1.8;
    for (let i = 0; i <= 6; i++) {
      const u = (i / 6) * LEN;
      const lat = params.curve * 0.12 * u * u;
      const d = BALL_R * 1.8 + u;
      pts.push(toScreen(round.ball.x + params.aim.x * d - params.aim.z * lat, 0.05, round.ball.z + params.aim.z * d + params.aim.x * lat));
    }
    const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    arrowLine.setAttribute('points', line);
    arrowShadow.setAttribute('points', line);
    const tip = pts[6]!;
    const prev = pts[5]!;
    const l = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
    const ux = (tip.x - prev.x) / l;
    const uy = (tip.y - prev.y) / l;
    arrowHead.setAttribute(
      'points',
      `${(tip.x + ux * 14).toFixed(1)},${(tip.y + uy * 14).toFixed(1)} ${(tip.x - uy * 9).toFixed(1)},${(tip.y + ux * 9).toFixed(1)} ${(tip.x + uy * 9).toFixed(1)},${(tip.y - ux * 9).toFixed(1)}`,
    );
    bar.setAttribute('transform', `translate(${(width - BAR_W) / 2}, ${height - 26})`);
    barMarker.setAttribute('x', String(params.power * BAR_W - 2));
    trail.style.visibility = '';
  };

  const rotateBall = (spin: { x: number; y: number; z: number }, dt: number) => {
    const w = Math.hypot(spin.x, spin.y, spin.z);
    if (w < 1e-6) return;
    axis.set(spin.x / w, spin.y / w, spin.z / w);
    ballView.spin.quaternion.premultiply(qTmp.setFromAxisAngle(axis, w * dt));
  };

  const onResult = (result: ShotResult) => {
    results.push(result);
    total += result.points;
    holdLeft = result.kind === 'goal' ? HOLD_TICKS.goal : HOLD_TICKS.other;
    phase = 'hold';
    if (result.kind === 'goal' && shot) {
      goal.ripple = { t: 0, at: { ...shot.pos }, dir: { x: 1, y: 0, z: 0 }, amp: 0.2 };
      confetti.burst({ x: -0.4, y: GOAL.height * 0.8, z: shot.pos.z }, -1);
      goalText.removeAttribute('data-show');
      void goalText.offsetWidth; // animasyonu baştan başlat
      goalText.setAttribute('data-show', '');
    }
    opts.onShot(index, result, total);
  };

  /** Bir sabit adım (TICK). */
  const tick = () => {
    if (!round) return;
    if (phase === 'aim') {
      // 10 dk'dan uzun beklenirse kaleci durur (girdi sınırı: MAX_RELEASE_TICK)
      if (roundTick < MAX_RELEASE_TICK) roundTick++;
      return;
    }
    if ((phase === 'flight' || phase === 'hold') && shot) {
      stepShot(shot);
      rotateBall(shot.spin, TICK);
      for (const e of shot.events) {
        if (e.type === 'net' && e.speed > 1.5) {
          const side = Math.abs(Math.abs(e.z) - GOAL.halfW) < 0.05;
          goal.ripple = { t: 0, at: { x: shot.pos.x, y: e.y, z: e.z }, dir: side ? { x: 0, y: 0, z: Math.sign(e.z) } : { x: 1, y: 0, z: 0 }, amp: Math.min(0.28, 0.02 * e.speed) };
        }
      }
      ballPos.set(shot.pos.x, shot.pos.y, shot.pos.z);
      if (phase === 'flight' && shot.result) onResult(shot.result);
      else if (phase === 'hold' && --holdLeft <= 0) {
        if (index + 1 < SHOTS_PER_SERIES) beginRound(index + 1);
        else {
          phase = 'done';
          opts.onFinish({ seed, inputs: [...inputs], results: [...results], total });
        }
      }
    }
  };

  let acc = 0;
  const update = (dt: number, now: number) => {
    acc += Math.min(dt, 0.1);
    while (acc >= TICK) {
      acc -= TICK;
      tick();
    }
    if (round) {
      const kz = shot ? shot.keeperZ : keeperZ(round, roundTick);
      keeperPeg.position.z = kz;
      keeperShadow.position.set(KEEPER.x, 0.008, kz);
    }
    ballView.group.position.copy(ballPos);
    const hgt = Math.max(0, ballPos.y - BALL_R);
    ballShadow.position.set(ballPos.x, 0.008, ballPos.z);
    ballShadow.scale.setScalar(BALL_R * 2.8 * (1 + hgt * 0.35));
    (ballShadow.material as MeshBasicMaterial).opacity = 0.5 / (1 + hgt * 0.9);
    rippleNet(goal, dt);
    confetti.step(dt);

    const k = camSnap ? 1 : 1 - 1 / (1 + 5 * dt);
    camSnap = false;
    camPos.lerp(camPosTarget, k);
    camLook.lerp(camLookTarget, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();

    placeHandle();
    updateSwipe(now);
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
    update(dt, ts);
    render();
  };
  const sync = () => {
    const run = !disposed && !contextLost && pageVisible && inView;
    if (run && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const resize = () => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, host.clientHeight);
    camera.aspect = width / height;
    renderer.setSize(width, height, false);
    frameCamera();
    camSnap = true;
    if (!raf) {
      update(0, performance.now());
      render();
    }
  };

  // ── Girdi ──────────────────────────────────────────────────────────────────────────────────────────
  const local = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return { t: e.timeStamp, x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** İşaretçi → topun ekrandaki yerine göre px. */
  const rel = (e: PointerEvent) => {
    const p = local(e);
    return { t: e.timeStamp, x: p.x - ballScreen.x, y: p.y - ballScreen.y };
  };
  const onDown = (e: PointerEvent) => {
    if (phase !== 'aim' || swiping) return;
    e.preventDefault();
    swiping = { id: e.pointerId, samples: [rel(e)], input: null };
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // yakalama olmadan da çalışır
    }
    handle.setAttribute('data-dragging', '');
    opts.onAimStart();
  };
  const onMove = (e: PointerEvent) => {
    if (!swiping || e.pointerId !== swiping.id) return;
    swiping.samples.push(rel(e));
    if (swiping.samples.length > 400) swiping.samples.splice(1, 1);
  };
  const onUp = (e: PointerEvent) => {
    if (!swiping || e.pointerId !== swiping.id) return;
    swiping.samples.push(rel(e));
    const input = e.type === 'pointercancel' ? null : computeInput(e.timeStamp);
    swiping = null;
    handle.removeAttribute('data-dragging');
    trail.style.visibility = 'hidden';
    if (!round || phase !== 'aim') return;
    // Geçersiz çekme (çok kısa / geriye doğru değil): vuruş harcanmaz, yeniden denenir.
    if (!input || !shotParams(round, input)) return;
    inputs.push(input);
    shot = startShot(round, input);
    phase = 'flight';
  };
  const onVisibility = () => {
    pageVisible = document.visibilityState === 'visible';
    sync();
  };
  const onContextLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    canvas.removeAttribute('data-ready');
    sync();
  };
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          inView = entries.some((en) => en.isIntersecting);
          sync();
        })
      : null;
  const ro = new ResizeObserver(resize);
  const themeObserver = new MutationObserver(() => {
    applyTheme();
    if (!raf && !disposed && !contextLost) render();
  });

  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onContextLost);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  io?.observe(host);
  ro.observe(host);

  loadBallLogos(
    ballView,
    pickLogoIds(HUB_LEAGUE_IDS, ballView.logoMaterials.length, [600])
      .map((id) => logoSrc(sportmonksLeagueLogoUrl(id), 64))
      .filter((u): u is string => Boolean(u)),
    { maxAnisotropy: maxAniso, isDisposed: () => disposed, onLoad: () => {} },
  );
  ballView.spin.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.5);

  return {
    start(nextSeed: number) {
      seed = nextSeed >>> 0;
      inputs = [];
      results = [];
      total = 0;
      camSnap = true;
      beginRound(0);
      resize();
      sync();
    },
    setGoalLabel(label: string) {
      goalText.textContent = label;
    },
    dispose() {
      disposed = true;
      sync();
      ro.disconnect();
      io?.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      handle.removeEventListener('pointerdown', onDown);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      scene.traverse((o: Object3D) => {
        const mesh = o as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      for (const d of disposables) d.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
      trail.remove();
      handle.remove();
      goalText.remove();
    },
  };
}

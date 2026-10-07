/**
 * /frikik sahnesi (three.js). Yalnız `Frikik` bileşeni dinamik olarak yükler → three.js bu sayfanın sonradan gelen
 * parçasında kalır. Yapı taşları giriş sahnesiyle ortak (components/pitch3d/pitchKit.ts); fizik ve skor
 * lib/frikik/sim.ts'te (belirlenimci; sunucu aynı kodu çalıştırır) — burası yalnız çizer ve girdiyi toplar.
 *
 * Kamera topun arkasında, kaleye bakar. Baraj ve kaleci insan oranlı düşük poligonlu figürler (figures.ts); kaleci
 * vuruşa kadar hazır duruşta bekler, hamlesinde tahminine doğru dalış pozu alır. Reklam panoları tek atlas + tek
 * geometri (adBoards.ts; içerik lib/frikik/ads.json), panoya tıklanınca URL açılır. Kontrol: topun üstünden hedefe doğru
 * kaydır (swipe) — genel yön hedef, en yüksek kaydırma hızı güç, yolun bombesi falso. Kaydırırken yalnız parmağın
 * çizdiği iz (ince çizgi) ve güç çubuğu görünür; topun yolu / hedef halkası ÇİZİLMEZ. Parmak titremesi yumuşatılır. Yol
 * 16 noktalı tam sayı girdiye çevrilir (lib/frikik/swipe.ts); bırakınca son girdi aynen şut olur.
 * Akış: tur (nişan) → uçuş → sonuç beklemesi → sıradaki tur. Seri modunda 5 vuruş → `onFinish`; seviye modunda gol →
 * sonraki seviye, kaçırma → 1 can, canlar bitince `onFinish`. Seviye kaldıraçları (rüzgâr, daralan kale, hareketli
 * baraj) turdan okunur; kale grubu z'de ölçeklenir, baraj figürleri her karede `wallOffset` ile kayar.
 * Sekme gizliyken / sahne ekran dışındayken döngü durur. `dispose()` GPU kaynaklarını bırakır.
 */
import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Fog,
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
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildAdBoards } from './adBoards';
import { makeFigure, makeShared, setKeeperPose } from './figures';
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
  LIVES,
  MAX_RELEASE_TICK,
  SHOTS_PER_SERIES,
  TICK,
  aimBasis,
  ballDistance,
  keeperZ,
  levelPoints,
  POWER_ZONES,
  makeLevelRound,
  makeRound,
  shotParams,
  startShot,
  stepShot,
  wallOffset,
  type Round,
  type ShotInput,
  type ShotResult,
  type ShotState,
} from '@/lib/frikik/sim';
import { effectiveMs, smoothPoint, swipeToInput, type GoalFrame, type ScreenPoint } from '@/lib/frikik/swipe';

export type FrikikMode = 'series' | 'level';
/** Seri ya da seviye koşusu özeti. `results[i].points` seviye çarpanı uygulanmış puandır. */
export type FrikikSummary = { mode: FrikikMode; seed: number; inputs: ShotInput[]; results: ShotResult[]; total: number; level: number; cleared: number };
/** Tur başı bilgisi (HUD): seri indeksi, seviye, can, rüzgâr (m/sn², + sağa), kale ortasına uzaklık (m). */
export type RoundInfo = { index: number; level: number; lives: number; wind: number; dist: number };

export type FrikikOptions = {
  /** Mobil: düşük pixelRatio, ucuz malzeme, küçük dokular. */
  lite: boolean;
  /** Reklam panolarındaki boş pano metni için dil. */
  lang: 'tr' | 'en';
  canvasClassName: string;
  handleClassName: string;
  goalClassName: string;
  /** Nişan katmanı (SVG: parmak izi, güç çubuğu) sınıfı. */
  trailClassName: string;
  goalLabel: string;
  onRound: (info: RoundInfo) => void;
  /** `result.points` seviye çarpanı uygulanmış. */
  onShot: (index: number, result: ShotResult, total: number) => void;
  onFinish: (summary: FrikikSummary) => void;
  /** İlk kaydırma (ipucu kapansın). */
  onAimStart: () => void;
};

export type FrikikHandle = {
  dispose: () => void;
  /** Seri (5 vuruş) başlat. */
  start: (seed: number) => void;
  /** Seviye koşusu (3 can) başlat. */
  startLevels: (seed: number) => void;
  setGoalLabel: (label: string) => void;
};

const CONFETTI_COLORS = [0x00a76f, 0x2fe3a0, 0xffffff, 0xffc83d, 0x007b55];
/** Sonuçtan sonra bekleme (tick): gol kutlaması daha uzun. */
const HOLD_TICKS = { goal: 210, other: 130 };
const LINES = { minX: -46, maxX: 2, halfZ: 26 };

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
  // Nişan katmanı (ekran uzayı, SVG): parmağın izi (ince çizgi) + güç çubuğu. Yalnız kaydırırken görünür.
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
  const pathShadow = el('polyline', { fill: 'none', stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, trail);
  const pathLine = el('polyline', { fill: 'none', stroke: 'rgba(255,255,255,0.9)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, trail);
  const pathTip = el('circle', { r: 4, fill: '#fff' }, trail);
  // Güç çubuğu: çok güçsüz | uygun | aşırı güçlü bölgeleri + imleç
  const BAR_W = 150;
  const BAR_H = 6;
  const bar = el('g', {}, trail);
  el('rect', { x: -3, y: -3, width: BAR_W + 6, height: BAR_H + 6, rx: 6, fill: 'rgba(6,12,20,0.6)' }, bar);
  el('rect', { x: 0, y: 0, width: BAR_W * POWER_ZONES.weak, height: BAR_H, fill: '#e5a23d' }, bar);
  el('rect', { x: BAR_W * POWER_ZONES.weak, y: 0, width: BAR_W * (POWER_ZONES.over - POWER_ZONES.weak), height: BAR_H, fill: '#00a76f' }, bar);
  el('rect', { x: BAR_W * POWER_ZONES.over, y: 0, width: BAR_W * (1 - POWER_ZONES.over), height: BAR_H, fill: '#e5322d' }, bar);
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

  // ── Baraj ve kaleci (insan oranlı figürler) ────────────────────────────────────────────────────────
  const figGeos: BufferGeometry[] = [];
  const figMats: Material[] = [];
  const shared = makeShared(figGeos);
  const SKINS = [0xf3dcc0, 0xd9a877, 0x8d5a3b, 0xf0c9a0, 0x6b3f25];
  const wallPegs = Array.from({ length: 5 }, (_, k) => {
    const fig = makeFigure(shared, { kit: 0x2a4fb0, shorts: 0xffffff, skin: SKINS[k % SKINS.length]!, hair: k % 2 ? 0x2a1b12 : 0x0c0a08, socks: 0x2a4fb0 }, false, figMats, FIGURE.height);
    scene.add(fig.group);
    return { fig, shadow: makeShadow(0.95, 0.4) };
  });
  // Kaleci görselde fiziğinden (2,08 m silindir) ~%17 büyük: üst direğe (2,44) yakın boy, hazır duruşta çömelik
  const keeperFig = makeFigure(shared, { kit: 0xffc83d, shorts: 0x0b1511, skin: 0xe8b98a, hair: 0x1a120c, socks: 0x0b1511, glove: 0xff7a1a }, true, figMats, KEEPER.height * 1.17);
  const KEEPER_SCALE = (KEEPER.height * 1.17) / 1.8;
  keeperFig.group.position.x = KEEPER.x;
  scene.add(keeperFig.group);
  const keeperShadow = makeShadow(1.3, 0.4);
  for (const x of [...figGeos, ...figMats]) track(x);

  // ── Reklam panoları (tek atlas, tek geometri) ──────────────────────────────────────────────────────
  const ads = track(buildAdBoards({ lite, lang: opts.lang }));
  scene.add(ads.mesh);

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
  let mode: FrikikMode = 'series';
  let index = 0;
  let level = 1;
  let lives = LIVES;
  let cleared = 0;
  let round: Round | null = null;
  /** Baraj sırasının doğrultusu (hareketli baraj bu eksende kayar). */
  let wallRow = { x: 0, z: 1 };
  /**
   * Kaleci animasyon planı (yalnız görsel; sonuç sim.ts'in): hamle yönü, dalış mı uzanma mı, dalışın başladığı z
   * (yan adımın sonu; dalışta gövde sabit kalır, kayma yok) ve süresi (sim kalecisinin hedefe varış süresi).
   */
  let keeperAnim: { dir: number; dive: boolean; diveZ: number; diveDur: number; tiltMax: number } | null = null;
  const READY_POSE = { crouch: 0.35, tilt: 0, lift: 0, dir: 1, reach: 0 };
  /** Yan adım / çömelme süresi (tick ≈ 0,15 sn) ve kalecinin görsel uzunluğu (m; dalışta direğe girmemesi için). */
  const KEEPER_STEP_TICKS = 18;
  let basis = { fx: 1, fz: 0, rx: 0, rz: 1 };
  let phase: 'idle' | 'aim' | 'flight' | 'hold' | 'done' = 'idle';
  let roundTick = 0;
  let shot: ShotState | null = null;
  let holdLeft = 0;
  let inputs: ShotInput[] = [];
  let results: ShotResult[] = [];
  let total = 0;
  /**
   * Kaydırma: `raw` son işaretçi konumu; `path` yumuşatılmış yol (ilk nokta top; ekranda iz olarak çizilir); `peak` en
   * yüksek hız (px/ms, ~60 ms pencere); `input` son girdi (bırakınca aynen kullanılır).
   */
  let swiping: {
    id: number;
    raw: ScreenPoint & { t: number };
    recent: (ScreenPoint & { t: number })[];
    path: ScreenPoint[];
    peak: number;
    input: ShotInput | null;
  } | null = null;
  /** Yan hassasiyet: hedef, parmağın toptan yatay uzaklığının bu kadarı kayar (ince ayar). */
  const AIM_GAIN_X = 0.8;
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
    round = mode === 'level' ? makeLevelRound(seed, level) : makeRound(seed, i);
    basis = aimBasis(round);
    goal.group.scale.z = round.goalScale;
    const w = round.wall;
    if (w.length > 1) {
      const l = Math.hypot(w[1]!.x - w[0]!.x, w[1]!.z - w[0]!.z);
      wallRow = { x: (w[1]!.x - w[0]!.x) / l, z: (w[1]!.z - w[0]!.z) / l };
    } else wallRow = { x: 0, z: 1 };
    roundTick = 0;
    shot = null;
    swiping = null;
    handle.removeAttribute('data-dragging');
    trail.style.visibility = 'hidden';
    ballPos.set(round.ball.x, BALL_R, round.ball.z);
    wallPegs.forEach((w, k) => {
      const f = round!.wall[k];
      w.fig.group.visible = w.shadow.visible = Boolean(f);
      // Figür topa döner (önü −x): (−1,0,0) yönünü a kadar çevir → (−cos a, 0, sin a) = top yönü
      if (f) w.fig.group.rotation.y = Math.atan2(round!.ball.z - f.z, -(round!.ball.x - f.x));
    });
    placeWall(0);
    keeperFig.group.rotation.y = Math.atan2(round.ball.z - round.keeper.z0, -(round.ball.x - KEEPER.x));
    keeperAnim = null;
    setKeeperPose(keeperFig, READY_POSE);
    frameCamera();
    phase = 'aim';
    opts.onRound({ index: i, level, lives, wind: round.wind, dist: ballDistance(round) });
  };

  /** Baraj figürlerini sıra boyunca `off` kadar kaymış çizer (hareketli baraj; sabitte 0). */
  const placeWall = (off: number) => {
    if (!round) return;
    wallPegs.forEach((w, k) => {
      const f = round!.wall[k];
      if (!f) return;
      const x = f.x + wallRow.x * off;
      const z = f.z + wallRow.z * off;
      w.fig.group.position.set(x, 0, z);
      w.shadow.position.set(x, 0.008, z);
    });
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

  /** Ekran → kale düzlemi ölçeği: kale çizgisi ortası ve direklerin / üst direğin ekrandaki izdüşümünden. */
  const goalFrame = (): GoalFrame => {
    const at = (x: number, y: number, z: number) => {
      projected.set(x, y, z).project(camera);
      return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height };
    };
    const o = at(0, 0, 0);
    const top = at(0, GOAL.height, 0);
    const l = at(0, 0, -GOAL.halfW);
    const r = at(0, 0, GOAL.halfW);
    return { originX: o.x, originY: o.y, pxPerMX: Math.max(1, (r.x - l.x) / (2 * GOAL.halfW)), pxPerMY: Math.max(1, (o.y - top.y) / GOAL.height) };
  };

  /** Yumuşatmayı bir adım ilerletir, girdiyi günceller, izi ve güç çubuğunu çizer. Her karede çağrılır. */
  const updateSwipe = () => {
    if (!swiping || !round) return;
    const sw = swiping;
    const last = sw.path[sw.path.length - 1]!;
    const aimed = { x: ballScreen.x + (sw.raw.x - ballScreen.x) * AIM_GAIN_X, y: sw.raw.y };
    const old = sw.recent[0]!;
    const span = Math.max(16, sw.raw.t - old.t);
    const speed = Math.hypot(sw.raw.x - old.x, sw.raw.y - old.y) / span;
    const next = smoothPoint(last, aimed, speed);
    if (next !== last) {
      sw.path.push(next);
      if (sw.path.length > 240) sw.path.splice(1, 1);
    }
    sw.input = swipeToInput(sw.path, effectiveMs(sw.path, sw.peak), goalFrame(), roundTick);
    const params = sw.input ? shotParams(round, sw.input) : null;
    if (!sw.input || !params) {
      trail.style.visibility = 'hidden';
      return;
    }
    // Yalnız parmağın izi (yumuşatılmış yol); topun yolu çizilmez
    const line = sw.path.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    pathLine.setAttribute('points', line);
    pathShadow.setAttribute('points', line);
    const tip = sw.path[sw.path.length - 1]!;
    pathTip.setAttribute('cx', tip.x.toFixed(1));
    pathTip.setAttribute('cy', tip.y.toFixed(1));
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

  const onResult = (base: ShotResult) => {
    const result = mode === 'level' ? { ...base, points: levelPoints(base.points, level) } : base;
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
          const side = Math.abs(Math.abs(e.z) - shot.goal.halfW) < 0.05;
          goal.ripple = { t: 0, at: { x: shot.pos.x, y: e.y, z: e.z }, dir: side ? { x: 0, y: 0, z: Math.sign(e.z) } : { x: 1, y: 0, z: 0 }, amp: Math.min(0.28, 0.02 * e.speed) };
        }
      }
      ballPos.set(shot.pos.x, shot.pos.y, shot.pos.z);
      if (phase === 'flight' && shot.result) onResult(shot.result);
      else if (phase === 'hold' && --holdLeft <= 0) {
        const finish = () => {
          phase = 'done';
          opts.onFinish({ mode, seed, inputs: [...inputs], results: [...results], total, level, cleared });
        };
        if (mode === 'level') {
          if (shot.result!.kind === 'goal') {
            cleared++;
            level++;
          } else lives--;
          if (lives <= 0) finish();
          else beginRound(index + 1);
        } else if (index + 1 < SHOTS_PER_SERIES) beginRound(index + 1);
        else finish();
      }
    }
  };

  let acc = 0;
  const update = (dt: number) => {
    acc += Math.min(dt, 0.1);
    while (acc >= TICK) {
      acc -= TICK;
      tick();
    }
    if (round) {
      let kz = shot ? shot.keeperZ : keeperZ(round, roundTick);
      if (shot && shot.tick >= round.keeper.react) {
        // Hamle: yan adım / çömelme (~0,15 sn) → uzak-yavaş topta yan adım + uzanma, köşeye giden sert topta dalış.
        const r = round.keeper;
        if (!keeperAnim) {
          const dir = shot.keeperTarget >= r.z0 ? 1 : -1;
          const travel = Math.abs(shot.keeperTarget - r.z0);
          const speedH = Math.hypot(shot.vel.x, shot.vel.z);
          const stepDist = Math.min(travel, KEEPER_STEP_TICKS * r.speed * TICK);
          const dive = travel > 1.3 || (travel > 0.7 && speedH > 21);
          const diveZ = r.z0 + dir * stepDist;
          const diveDur = Math.max(24, Math.min(54, Math.ceil((travel - stepDist) / (r.speed * TICK))));
          // Dalışta uzanan gövde (≈1,9 m × ölçek) iç direği geçmesin
          const room = Math.max(0, shot.goal.halfW - 0.2 - dir * diveZ);
          const tiltMax = Math.min(1.1, Math.asin(Math.min(1, room / (1.9 * KEEPER_SCALE))));
          keeperAnim = { dir, dive, diveZ, diveDur, tiltMax };
        }
        const a = keeperAnim;
        const t = shot.tick - r.react;
        if (t < KEEPER_STEP_TICKS) {
          const u = t / KEEPER_STEP_TICKS;
          setKeeperPose(keeperFig, { crouch: 0.35 + 0.5 * u, tilt: 0.1 * u, lift: 0, dir: a.dir, reach: 0.35 * u });
        } else if (a.dive) {
          kz = a.diveZ;
          const p = Math.min(1, (t - KEEPER_STEP_TICKS) / a.diveDur);
          const e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
          const landed = t - KEEPER_STEP_TICKS - a.diveDur;
          // Havada: yay (tepe ~0,4 m); inişte kısa sekme, sonra yerde kalır
          const lift = p < 1 ? 0.4 * Math.sin(Math.PI * p) : landed < 10 ? 0.05 * Math.sin((Math.PI * landed) / 10) : 0;
          // İnişte dizler bükülü kalır (yerde yan yatış), kayma yok: gövde z'si diveZ'de sabit
          setKeeperPose(keeperFig, { crouch: 0.85 - 0.45 * e, tilt: a.tiltMax * e, lift: lift / KEEPER_SCALE, dir: a.dir, reach: 1 });
        } else {
          const p = Math.min(1, (t - KEEPER_STEP_TICKS) / 20);
          setKeeperPose(keeperFig, { crouch: 0.85, tilt: 0.3 * p, lift: 0, dir: a.dir, reach: 0.35 + 0.65 * p });
        }
      }
      keeperFig.group.position.z = kz;
      keeperShadow.position.set(KEEPER.x, 0.008, kz);
      if (round.wallMotion.amp > 0) placeWall(wallOffset(round, shot ? shot.releaseTick + shot.tick : roundTick));
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
    updateSwipe();
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
      update(0);
      render();
    }
  };

  // ── Girdi ──────────────────────────────────────────────────────────────────────────────────────────
  const local = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    return { t: e.timeStamp, x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onDown = (e: PointerEvent) => {
    if (phase !== 'aim' || swiping) return;
    e.preventDefault();
    const p = local(e);
    // Yol topun üstünden başlar (nereden tutulursa tutulsun)
    swiping = { id: e.pointerId, raw: p, recent: [p], path: [{ x: ballScreen.x, y: ballScreen.y }], peak: 0, input: null };
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
    const p = local(e);
    swiping.raw = p;
    swiping.recent.push(p);
    // ~60 ms'lik pencere: en yüksek hız (güç) buradan
    while (swiping.recent.length > 2 && p.t - swiping.recent[1]!.t >= 60) swiping.recent.shift();
    const old = swiping.recent[0]!;
    if (p.t - old.t >= 24) swiping.peak = Math.max(swiping.peak, Math.hypot(p.x - old.x, p.y - old.y) / (p.t - old.t));
  };
  const onUp = (e: PointerEvent) => {
    if (!swiping || e.pointerId !== swiping.id) return;
    // Bırakma: son girdi aynen şut olur (yalnız tick güncellenir: kalecinin o andaki yeri).
    const input = swiping.input ? { ...swiping.input, tick: roundTick } : null;
    swiping = null;
    handle.removeAttribute('data-dragging');
    trail.style.visibility = 'hidden';
    if (e.type === 'pointercancel' || !round || phase !== 'aim') return;
    // Geçersiz kaydırma (çok kısa / kaleye doğru değil): vuruş harcanmaz, yeniden denenir.
    if (!input || !shotParams(round, input)) return;
    inputs.push(input);
    shot = startShot(round, input);
    phase = 'flight';
  };
  /** Panoya tıklama: reklamın URL'si yeni sekmede (kaydırma tutamağın üstünde olduğundan tuvale gelmez). */
  const ndc = new Vector2();
  const onCanvasClick = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ad = ads.pick(ndc, camera);
    if (ad?.url) window.open(ad.url, '_blank', 'noopener');
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
  canvas.addEventListener('click', onCanvasClick);
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

  const begin = (nextMode: FrikikMode, nextSeed: number) => {
    mode = nextMode;
    seed = nextSeed >>> 0;
    inputs = [];
    results = [];
    total = 0;
    level = 1;
    lives = LIVES;
    cleared = 0;
    camSnap = true;
    beginRound(0);
    resize();
    sync();
  };

  return {
    start(nextSeed: number) {
      begin('series', nextSeed);
    },
    startLevels(nextSeed: number) {
      begin('level', nextSeed);
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
      canvas.removeEventListener('click', onCanvasClick);
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

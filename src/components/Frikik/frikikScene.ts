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
 * Akış: tur (nişan) → uçuş → sonuç beklemesi → sıradaki tur. Tek mod (Günün frikiği): gol →
 * sonraki seviye, kaçırma → 1 can, canlar bitince `onFinish` (tek mod: Günün frikiği). Seviye kaldıraçları (rüzgâr, daralan kale, hareketli
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
  Scene,
  SRGBColorSpace,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildAdBoards } from './adBoards';
import { makeFigure, makeShared, setKeeperPose } from './figures';
import { keeperPoseAt, mixPose, planKeeperMove, READY_POSE, type KeeperPlan, type KeeperPose } from './keeperMove';
import { buildStands } from './stands';
import { HUB_LEAGUE_IDS } from '@/config/hubLeagueGroups';
import { sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import { logoSrc } from '@/utils/logoUrl';
import { pickLogoIds } from '@/components/AuthStage/stageMotion';
import {
  boardTexture,
  buildBall,
  buildGoal,
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
  TICK,
  WALL_DISTANCE,
  aimBasis,
  ballDistance,
  keeperZ,
  levelPoints,
  POWER_ZONES,
  makeLevelRound,
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

/** Seviye koşusu özeti. `results[i].points` seviye çarpanı uygulanmış puandır. */
export type FrikikSummary = { seed: number; inputs: ShotInput[]; results: ShotResult[]; total: number; level: number; cleared: number };
/** Tur başı bilgisi (HUD): seri indeksi, seviye, can, rüzgâr (m/sn², + sağa), kale ortasına uzaklık (m). */
export type RoundInfo = { index: number; level: number; lives: number; wind: number; dist: number };

export type FrikikOptions = {
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
  /** Son karenin draw call / üçgen sayısı (renderer.info). */
  stats: () => { calls: number; triangles: number };
  /** Seviye koşusu (3 can) başlat. */
  start: (seed: number) => void;
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

export function mountFrikik(host: HTMLElement, opts: FrikikOptions): FrikikHandle {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  let disposed = false;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  // Her zaman yüksek kalite; tek güvenlik ağı: kare süresi sürekli yüksekse (bkz. frame) sessizce hafifletilir
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
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
  const envTex: Texture | null = track(createEnvTexture(renderer));

  // ── Zemin, çizgiler, tribün, pano ─────────────────────────────────────────────────────────────────
  const grass = track(grassTexture(512));
  grass.repeat.set(160 / 4, 110 / 4);
  grass.anisotropy = maxAniso;
  const ground = new Mesh(track(new PlaneGeometry(160, 110)), track(new MeshStandardMaterial({ map: grass, roughness: 0.95, metalness: 0 })));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-40, 0, 0);
  scene.add(ground);
  const linesTex = track(boxLinesTexture(32));
  linesTex.anisotropy = maxAniso;
  const lines = new Mesh(
    track(new PlaneGeometry(LINES.maxX - LINES.minX, LINES.halfZ * 2)),
    track(new MeshStandardMaterial({ map: linesTex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })),
  );
  lines.rotation.x = -Math.PI / 2;
  lines.position.set((LINES.minX + LINES.maxX) / 2, 0.004, 0);
  scene.add(lines);

  // Kale arkası tribün + taraftarlar (stands.ts: 3–4 draw call, gölge yok)
  const stands = track(buildStands({}));
  scene.add(stands.group);
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

  const ballView = track(buildBall({ lite: false, envTex, logoCount: 4 }));
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
  // Kaleci boyu 1,88 m (üst direğin ~%77'si), barajla aynı ölçek sistemi; fizik silindiri (2,08 m) görselden bağımsız
  const KEEPER_VISUAL_HEIGHT = 1.88;
  const keeperFig = makeFigure(shared, { kit: 0xffc83d, shorts: 0x0b1511, skin: 0xe8b98a, hair: 0x1a120c, socks: 0x0b1511, glove: 0xff7a1a }, true, figMats, KEEPER_VISUAL_HEIGHT);
  const KEEPER_SCALE = KEEPER_VISUAL_HEIGHT / 1.8;
  keeperFig.group.position.x = KEEPER.x;
  scene.add(keeperFig.group);
  const keeperShadow = makeShadow(1.3, 0.4);
  for (const x of [...figGeos, ...figMats]) track(x);

  // ── Reklam panoları (tek atlas, tek geometri) ──────────────────────────────────────────────────────
  const ads = track(buildAdBoards({ lang: opts.lang }));
  scene.add(ads.mesh);

  const confetti = makeConfetti(120, 0.16, CONFETTI_COLORS);
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
    stands.setDay(day);
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
  let level = 1;
  let lives = LIVES;
  let cleared = 0;
  let round: Round | null = null;
  /** Baraj sırasının doğrultusu (hareketli baraj bu eksende kayar). */
  let wallRow = { x: 0, z: 1 };
  /**
   * Kaleci animasyon planı (yalnız görsel; sonuç sim.ts'in). Vuruştan `KEEPER_REACT_TICKS` sonra çömelme / yan adım;
   * dalış, sim kalecisinin hedefine (ya da topun kaleye varışına) `diveDur` önce başlar ve parmak uçları o anda sim
   * silindirinin merkezine ulaşır → sim "kurtardı" diyorsa top ellerin yanındadır, "gol" diyorsa top silindirin
   * dışından (parmak ucunun ötesinden) geçer. Ayaklar dalışta `feetEnd`'e sıçrar, iniş sonrası kayma yok.
   */
  let keeperAnim: KeeperPlan | null = null;
  /** Vuruş sonrası toparlanma: son pozdan hazır duruşa 36 tick'te yumuşak geçiş (yeni turda). */
  let keeperRecover: { from: KeeperPose; t: number } | null = null;
  let keeperFaceYaw = 0;
  const applyKeeperPose = (p: KeeperPose, dir: number) => {
    keeperFig.group.position.z = p.root;
    keeperFig.group.rotation.y = keeperFaceYaw + dir * p.yaw;
    keeperShadow.position.set(KEEPER.x, 0.008, p.root);
    setKeeperPose(keeperFig, { crouch: p.crouch, tilt: p.tilt, lift: p.lift / KEEPER_SCALE, dir, reach: p.reach, armUp: p.armUp });
  };
  let keeperLastPose: KeeperPose = READY_POSE;
  let keeperLastDir = 1;
  /** Vuruş anında sim'i ileri sarar (deterministik, ≤ 840 adım): topun kaleci düzlemini kestiği z / tick ve sonuç. */
  const probeShot = (r: Round, input: ShotInput) => {
    const p = startShot(r, input);
    let crossed = false;
    let ballZ = 0;
    let ballY = 0;
    let tCross = 0;
    let tSeen: number | undefined;
    const wallX = r.wall[0]?.x ?? r.ball.x + WALL_DISTANCE;
    while (!p.result || p.tick < 2) {
      stepShot(p);
      if (tSeen == null && p.pos.x >= wallX) tSeen = p.tick;
      // Kurtarış: temas noktası ve anı (sim kararı); gol: topun kaleci düzlemini (x = KEEPER.x) kestiği nokta
      if (!crossed && (p.touchedKeeper || p.pos.x >= KEEPER.x)) {
        crossed = true;
        ballZ = p.pos.z;
        ballY = p.pos.y;
        tCross = p.tick;
      }
      if (p.result && (crossed || p.tick > 840)) break;
    }
    return { crossed, ballZ, ballY, tCross, tSeen, saved: p.result?.kind === 'saved' };
  };
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
    round = makeLevelRound(seed, level);
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
    keeperFaceYaw = Math.atan2(round.ball.z - round.keeper.z0, -(round.ball.x - KEEPER.x));
    keeperAnim = null;
    // Önceki vuruşun pozundan yeni duruş yerine yumuşak dönüş (ilk turda anında)
    keeperRecover = index > 0 ? { from: { ...keeperLastPose, yaw: 0 }, t: 0 } : null;
    if (!keeperRecover) applyKeeperPose({ ...READY_POSE, root: round.keeper.z0 }, 1);
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
    const result = { ...base, points: levelPoints(base.points, level) };
    results.push(result);
    total += result.points;
    holdLeft = result.kind === 'goal' ? HOLD_TICKS.goal : HOLD_TICKS.other;
    phase = 'hold';
    if (result.kind === 'goal' && shot) {
      goal.ripple = { t: 0, at: { ...shot.pos }, dir: { x: 1, y: 0, z: 0 }, amp: 0.2 };
      stands.celebrate();
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
          opts.onFinish({ seed, inputs: [...inputs], results: [...results], total, level, cleared });
        };
        if (shot.result!.kind === 'goal') {
          cleared++;
          level++;
        } else lives--;
        if (lives <= 0) finish();
        else beginRound(index + 1);
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
      if (shot) {
        const r = round.keeper;
        if (!keeperAnim) {
          const probe = probeShot(round, inputs[inputs.length - 1]!);
          keeperAnim = planKeeperMove({ z0: r.z0, target: shot.keeperTarget, speed: r.speed, ...probe, halfW: shot.goal.halfW });
        }
        keeperLastPose = keeperPoseAt(keeperAnim, shot.tick);
        keeperLastDir = keeperAnim.dir;
        applyKeeperPose(keeperLastPose, keeperLastDir);
      } else if (keeperRecover) {
        keeperRecover.t += dt * 120;
        const ready = { ...READY_POSE, root: keeperZ(round, roundTick) };
        const u = Math.min(1, keeperRecover.t / 36);
        applyKeeperPose(mixPose(keeperRecover.from, ready, u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u)), keeperLastDir);
        if (u >= 1) keeperRecover = null;
      }
      if (round.wallMotion.amp > 0) placeWall(wallOffset(round, shot ? shot.releaseTick + shot.tick : roundTick));
    }
    ballView.group.position.copy(ballPos);
    const hgt = Math.max(0, ballPos.y - BALL_R);
    ballShadow.position.set(ballPos.x, 0.008, ballPos.z);
    ballShadow.scale.setScalar(BALL_R * 2.8 * (1 + hgt * 0.35));
    (ballShadow.material as MeshBasicMaterial).opacity = 0.5 / (1 + hgt * 0.9);
    rippleNet(goal, dt);
    confetti.step(dt);
    stands.update(dt);

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
  /**
   * Görünmez güvenlik ağı: 120 karelik pencerede medyan kare süresi iki pencere üst üste 30 ms'yi (≈ 33 fps) aşarsa
   * bir kez hafiflet: pixelRatio 1 ve taraftar sayısı yarı. Arayüz yok, varsayılan her zaman yüksek kalite.
   */
  const FRAME_WINDOW = 120;
  const SLOW_FRAME_MS = 30;
  const frameTimes: number[] = [];
  let slowWindows = 0;
  let degraded = false;
  const watchFrame = (ms: number) => {
    if (degraded || ms <= 0 || ms > 250) return;
    frameTimes.push(ms);
    if (frameTimes.length < FRAME_WINDOW) return;
    const sorted = [...frameTimes].sort((a, b) => a - b);
    frameTimes.length = 0;
    slowWindows = sorted[FRAME_WINDOW >> 1]! > SLOW_FRAME_MS ? slowWindows + 1 : 0;
    if (slowWindows >= 2) {
      degraded = true;
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      stands.setDensity(0.5);
    }
  };
  const frame = (ts: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? (ts - last) / 1000 : 0;
    last = ts;
    if (pageVisible && inView) watchFrame(dt * 1000);
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

  const begin = (nextSeed: number) => {
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
    stats() {
      return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    },
    start(nextSeed: number) {
      begin(nextSeed);
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

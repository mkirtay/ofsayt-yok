/**
 * Anlatım sahnesinin pozisyon planı — saf modül (hareket sceneMotion.ts'te, çizim CommentaryScene.tsx'te). Bir sahne olayını
 * "hazırlık → aksiyon → sonuç → kısa toparlanma" aşamalarına çevirir: kim nereye hangi tempoda koşar (Move), top hangi
 * aralıkta kimin ayağında / havada (BallSeg), hangi anda hangi efekt (gol ağı, kurtarış, blok, direk, düdük, kart…).
 *
 * Plan konum DEĞİL niyet üretir: oyuncular hedeflerine hız/ivme sınırlı yürür (sceneMotion), takım şekli canlı top
 * konumundan hesaplanır. Zamanlar ms; süreler mesafe ve tempodan (PACE, BALL) hesaplanır ki koşular yetişsin.
 *
 * KONUMLAR GERÇEK DEĞİL (ballCoordinates güvenilmez bulundu, 2026-10-21/22; olay satırlarında koordinat yok): diziliş
 * kadrodan (formation_field), vuruş bölgesi metinden, metinde yoksa olay kimliğinden tohumlanan belirlenimli seçim — aynı olay
 * her oynatışta aynı pozisyon. Metinde olmayan adlı pas zinciri / asist çizilmez: yalnız metinde adı geçen asist yapan
 * besleme pasını atar; kafa vuruşu ve kendi kalesine golde orta zorunlu olduğundan ortayı adsız (vurgusuz) temsili oyuncu yapar.
 *
 * Sahadakiler olay anındaki kadrodur (değişiklik / kırmızı kart, `squadsAt`); 2. devrede takımlar taraf değiştirir (`flip`,
 * geometri `lane` ile). Başlangıç ve duran top yerleşimleri sceneRules.ts kurallarından geçer (ofsayt, kaleci, çakışma…).
 */
import type { CommentaryItem, SceneSide, SceneType, SceneZone } from '@/services/sportmonks/matchCommentary';
import { changeKey, findPlayer, isSecondHalf, squadsAt, type SceneSquads } from '@/services/sportmonks/commentaryScene';
import { SCENE_H, SCENE_W, cornerPoint, lane, placeSquad, zonePoint } from './sceneLayout';
import { OFFSIDE_MARGIN, validateScene, type RuleBody, type ScenePhase } from './sceneRules';

export type Vec = { x: number; y: number };

/** Tempo → px/s (saha 504 px ≈ 105 m; okunurluk için gerçeğin ~1,5 katı). */
export type Pace = 'walk' | 'jog' | 'dribble' | 'run' | 'sprint' | 'dive';
export const PACE: Record<Pace, number> = { walk: 18, jog: 30, dribble: 36, run: 46, sprint: 60, dive: 130 };
/** Top hızları (px/s): oyunculardan bağımsız. */
export const BALL = { pass: 150, cross: 130, shot: 250, header: 170, deflect: 115, out: 190 } as const;

export type FlightStyle = 'pass' | 'cross' | 'shot' | 'deflect' | 'out';

/** `t0 ≤ t < t1` aralığında `i` numaralı ajanın hedefi `to`. `contact`: ayrıştırma (üst üste binme önleme) uygulanmaz. */
export type Move = { i: number; t0: number; t1: number; to: Vec; pace: Pace; contact?: boolean };

export type BallSeg =
  /** Top sürme: top `owner`ın ayağında; sahibi `to`ya sürer. Sahibi topa uzaksa önce topu alır. */
  | { kind: 'carry'; t0: number; t1: number; owner: number; to: Vec }
  /** Top kontrolde / kalecinin elinde. */
  | { kind: 'hold'; t0: number; t1: number; owner: number }
  /** Pas, orta, şut, sekme: top oyunculardan bağımsız `to`ya uçar (çıkış noktası o anki top). */
  | { kind: 'flight'; t0: number; t1: number; to: Vec; style: FlightStyle; lift: number; trail: number | null }
  /** Sahipsiz / ölü top: yerinde durur. */
  | { kind: 'loose'; t0: number; t1: number };

export type ScriptTrail = { from: Vec; to: Vec; t0: number; t1: number; kind: 'pass' | 'cross' | 'shot' };

export type ScriptEffect =
  | { kind: 'goal'; at: Vec; t: number }
  | { kind: 'save'; at: Vec; t: number }
  | { kind: 'block'; at: Vec; t: number }
  | { kind: 'post'; at: Vec; t: number }
  | { kind: 'whistle'; at: Vec; t: number }
  | { kind: 'flag'; at: Vec; t: number }
  | { kind: 'offsideLine'; x: number; t: number }
  | { kind: 'card'; at: Vec; t: number; red: boolean }
  | { kind: 'board'; at: Vec; t: number };

export type PlanAgent = {
  /** Kalıcı kimlik (sahneler arasında aynı nokta): `home-3`, `away-0`, `ref`, `sub`. */
  key: string;
  /** Kadrodaki ad (eşleme için; sahnede yazılmaz). */
  name: string;
  side: SceneSide | null;
  goalkeeper: boolean;
  referee?: boolean;
  /** Oyuncu değişikliğinde kenardan giren (yalnız o sahnede görünür). */
  sub?: boolean;
  /** Forma numarası (kadroda yoksa null). */
  number: number | null;
  /** Metinde adı geçen ve kadroda bulunan oyuncu — halkayla vurgulanır. Bulunamazsa kimse vurgulanmaz. */
  actor: boolean;
  /** Takım şekli için kendi hücum çerçevesindeki dizilişi (u: kale→rakip kale, s: sol→sağ). */
  u0: number;
  s0: number;
  /** Savunma hattından derinlik (u; savunma satırı 0, orta saha ~0,15, forvet ~0,3) — blok şekli bundan kurulur. */
  d0: number;
  /** Başlama dizilişi (golden sonra dönülen yer). */
  home: Vec;
};

export type ScenePlan = {
  type: SceneType;
  /** Hücum eden (topa sahip) takım. */
  side: SceneSide;
  /** 2. devre: takımlar taraf değiştirmiş (ev sahibi sola hücum eder). Geometri `lane(side, flip)`. */
  flip: boolean;
  /** Penaltı vuruşu (şut / gol satırı penaltıdan). */
  penalty: boolean;
  /** Sahadaki kişi sayısı (kırmızı karttan sonra 10). */
  expected: Record<SceneSide, number>;
  /** Kural denetim anı (şut / penaltı vuruşu, korner orta, ofsayt pası): testler ve geliştirme modu bu karede sceneRules çalıştırır. */
  check: { t: number; phase: ScenePhase; shooter: number | null; offsider: number | null } | null;
  /** Ofsayt sahnesi: ofsayttaki dışındaki hücumcuların geçmeyeceği sabit çizgi (u) — savunma hattı öne çıkarken geride kalırlar. */
  holdLine: number | null;
  /** Olayın oyuncusu (metindeki ilk ad, kadroda bulunduysa): başlıkta ad + numara. Değişiklikte giren. */
  lead: { name: string; number: number | null; side: SceneSide } | null;
  /** Oyun akıyor mu (kart/değişiklikte duruk: baskı yok, yürüme temposu). */
  inPlay: boolean;
  agents: PlanAgent[];
  start: { ball: Vec | null; ballDead: boolean; players: Vec[] };
  moves: Move[];
  ball: BallSeg[];
  trails: ScriptTrail[];
  effects: ScriptEffect[];
  falls: { i: number; t: number }[];
  fades: { i: number; t: number; to: 0 | 1 }[];
  /** Değişiklik bitince giren oyuncu çıkanın yerini (kimliğini) devralır. */
  swap: { from: number; into: number } | null;
  climaxMs: number;
  /** Rol hedefleri bu ana kadar; sonrası toparlanma (şekle dönüş). */
  actionEndMs: number;
  durationMs: number;
  settle: 'shape' | 'kickoff';
  disallowed: boolean;
};

const MID_Y = SCENE_H / 2;
const other = (s: SceneSide): SceneSide => (s === 'home' ? 'away' : 'home');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const inPitch = (p: Vec): Vec => ({ x: clamp(p.x, 10, SCENE_W - 10), y: clamp(p.y, 10, SCENE_H - 10) });

/** Olay kimliğinden tohumlanan belirlenimli rastgele sayı üreteci (mulberry32). */
export function rng(seed: number): () => number {
  let a = (Math.abs(seed) || 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hücum çerçevesi: u = 0 kendi kalesi … 1 rakip kale; s = -1 hücum edenin solu … +1 sağı. Ekrana çevirir. `side` takım,
 * `flip` 2. devre (takımlar taraf değiştirir: geometri `lane(side, flip)`; "home" geometrisi sağa hücum, solu ekranın üstü).
 */
export function frame(side: SceneSide, flip = false) {
  const geo = lane(side, flip);
  const k = geo === 'home' ? 1 : -1;
  return {
    P: (u: number, s: number): Vec => ({ x: geo === 'home' ? u * SCENE_W : (1 - u) * SCENE_W, y: MID_Y + s * k * (MID_Y - 14) }),
    u: (p: Vec) => (geo === 'home' ? p.x / SCENE_W : 1 - p.x / SCENE_W),
    s: (p: Vec) => ((p.y - MID_Y) / (MID_Y - 14)) * k,
  };
}

/** Savunan takımın savunma hattı (kendi çerçevesinde u): top kaleye yaklaştıkça ceza sahası çizgisine iner. */
export const backLine = (ubd: number) => clamp(0.08 + 0.4 * ubd, 0.12, 0.44);
/** Hücum edenin en ileri gidebileceği yer (u): ikinci son savunmacı (savunma hattı) ya da top, eksi pay — ofsayt yok. */
export const onsideLimit = (ballU: number) => Math.max(1 - backLine(1 - ballU), ballU) - OFFSIDE_MARGIN;

/**
 * Takım şekli: top konumuna göre blok ileri/geri ve yana kayar. Hücum eden yayılır, savunma hattı orta sahaya yaklaşır,
 * forvetler ofsayt çizgisinde durur; savunan kendi yarısında daralır, top ceza sahasına gelince savunma hattı ceza sahası
 * çizgisine iner. Uzaktaki oyuncular şekli korur; yalnız topa en yakın savunmacı baskıya çıkar (sceneMotion).
 */
export function shapeAt(b: Pick<PlanAgent, 'side' | 'goalkeeper' | 's0' | 'd0'>, attack: SceneSide, ball: Vec, flip = false): Vec {
  const A = frame(attack, flip);
  const ub = clamp(A.u(ball), 0, 1);
  const sb = clamp(A.s(ball), -1, 1);
  if (b.side === attack) {
    if (b.goalkeeper) return A.P(0.04 + 0.14 * ub, sb * 0.08);
    const bl = clamp(0.18 + 0.48 * ub, 0.3, 0.6);
    const u = clamp(Math.min(bl + b.d0 * (0.95 + 0.35 * ub), onsideLimit(ub)), 0.1, 0.94);
    const s = clamp(b.s0 * (0.92 + 0.08 * ub) + sb * 0.15, -0.96, 0.96);
    return A.P(u, s);
  }
  const D = frame(b.side ?? other(attack), flip);
  const ubd = 1 - ub;
  if (b.goalkeeper) return D.P(0.025 + 0.025 * clamp(ubd * 2 - 0.4, 0, 1), clamp(-sb * 0.22, -0.16, 0.16));
  const u = clamp(backLine(ubd) + b.d0 * (0.45 + 0.55 * ubd), 0.1, 0.75);
  const s = clamp(b.s0 * (0.6 + 0.3 * ubd) - sb * 0.28 * (1 - 0.4 * ubd), -0.9, 0.9);
  return D.P(u, s);
}

/** Hakem: oyunu çaprazdan, 60–90 px geriden izler. */
export function refereeSpot(attack: SceneSide, ball: Vec, flip = false): Vec {
  const A = frame(attack, flip);
  return A.P(clamp(A.u(ball) - 0.16, 0.2, 0.78), clamp(-A.s(ball) * 0.4 + 0.25, -0.7, 0.7));
}

/** Sahne başlama dizilişi (oyuncular, sonra hakem ve kenardaki yedek). Kadro olay anındaki sahadakilerdir. */
export function buildAgents(squads: SceneSquads | null, flip = false): PlanAgent[] {
  const out: PlanAgent[] = [];
  for (const side of ['home', 'away'] as const) {
    const F = frame(side, flip);
    const placed = placeSquad(squads, side, lane(side, flip));
    const backU = Math.min(...placed.filter((p) => !p.goalkeeper).map((p) => F.u(p)));
    placed.forEach((p) => {
      const at = { x: p.x, y: p.y };
      const u0 = F.u(at);
      out.push({ key: p.key, name: p.name, number: p.number, side, goalkeeper: p.goalkeeper, actor: false, u0, s0: F.s(at), d0: p.goalkeeper ? 0 : Math.max(0, u0 - backU), home: at });
    });
  }
  out.push({ key: 'ref', name: '', number: null, side: null, goalkeeper: false, referee: true, actor: false, u0: 0.5, s0: 0, d0: 0, home: { x: SCENE_W / 2 - 30, y: MID_Y + 40 } });
  out.push({ key: 'sub', name: '', number: null, side: null, goalkeeper: false, sub: true, actor: false, u0: 0.5, s0: 0, d0: 0, home: { x: SCENE_W / 2, y: 4 } });
  return out;
}

/** Sürüş / koşu süresi tahmini (ms): mesafe + ivmelenme payı. */
export const eta = (a: Vec, b: Vec, pace: Pace) => (dist(a, b) / PACE[pace]) * 1000 + (dist(a, b) > 2 ? 300 : 0);
const flightMs = (a: Vec, b: Vec, speed: number, min: number) => Math.round(Math.max(min, (dist(a, b) / speed) * 1000));

const ZONE_SIDE: Partial<Record<SceneZone, -1 | 1>> = { box_left: -1, outside_box_left: -1, box_right: 1, outside_box_right: 1 };

/**
 * Satır → plan. Sahnesi olmayan satır için null. `seed` olay anahtarı (birleşmiş satırlarda en küçük kimlik).
 */
export function buildPlan(
  item: CommentaryItem,
  squads: SceneSquads | null,
  { seed = item.id, disallowed = false }: { seed?: number; disallowed?: boolean } = {},
): ScenePlan | null {
  const scene = item.scene;
  if (!scene) return null;
  const type = scene.type;
  // Kart/faulde `side` faul yapan / kart gören takım; akış rakibin hücumu.
  const attack: SceneSide = type === 'foul' || type === 'card_yellow' || type === 'card_red' ? other(scene.side ?? 'away') : (scene.side ?? 'home');
  const defend = other(attack);
  const flip = isSecondHalf(item.minute);
  // Olay anında sahadakiler. Aynı dakikadaki değişiklik ancak olayın oyuncusu o an giren ise uygulanır.
  let squadsNow = squads ? squadsAt(squads, item.minute, item.extraMinute) : null;
  if (squads && squadsNow && type !== 'substitution' && scene.actors[0]) {
    const hit = findPlayer(squadsNow, scene.actors[0]);
    if (hit && !squadsNow[hit.side].players[hit.index]!.starter) squadsNow = squadsAt(squads, item.minute, item.extraMinute, true);
  }
  const agents = buildAgents(squadsNow, flip);
  const n = agents.length - 2;
  const REF = n;
  const SUB = n + 1;
  const A = frame(attack, flip);
  const geo = lane(attack, flip);
  /** Ekranda hücum yönü (+1 sağa). */
  const dir = geo === 'home' ? 1 : -1;
  const r = rng(seed);
  const penalty = !!scene.penalty && (type === 'goal' || type === 'shot_saved' || type === 'shot_off') && !scene.ownGoal;
  const fromCorner = !!scene.fromCorner && !penalty && !scene.ownGoal;

  const moves: Move[] = [];
  const ball: BallSeg[] = [];
  const trails: ScriptTrail[] = [];
  const effects: ScriptEffect[] = [];
  const falls: ScenePlan['falls'] = [];
  const fades: ScenePlan['fades'] = [];
  const startAt = new Map<number, Vec>();
  let swap: ScenePlan['swap'] = null;
  let ball0: Vec | null = null;
  let ballDead = false;
  let inPlay = true;
  let climax = 0;
  let actionEnd = 0;
  let duration = 0;
  let settle: ScenePlan['settle'] = 'shape';
  let check: ScenePlan['check'] = null;
  let holdLine: number | null = null;

  const players = agents.slice(0, n);
  const shapeOf = (i: number, ref: Vec) => shapeAt(agents[i]!, attack, ref, flip);
  /** Hücum edenin rol konumu, top `ballAt`teyken ofsayta düşmesin. */
  const onside = (p: Vec, ballAt: Vec): Vec => (A.u(p) > onsideLimit(A.u(ballAt)) ? A.P(onsideLimit(A.u(ballAt)), A.s(p)) : p);
  const keeperOf = (side: SceneSide) => players.findIndex((b) => b.side === side && b.goalkeeper);
  /** Bir noktaya (top `ref`teyken) şekilde en yakın saha oyuncusu. */
  const nearest = (side: SceneSide, at: Vec, ref: Vec, exclude: ReadonlySet<number> = new Set()) => {
    let best = -1;
    let bestD = Infinity;
    players.forEach((b, i) => {
      if (b.side !== side || b.goalkeeper || exclude.has(i)) return;
      const d = dist(shapeOf(i, ref), at);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  /** Metindeki ad → kadrodaki oyuncunun noktası; bulunamaz ya da taraf uyuşmazsa null (isim uydurulmaz). */
  const named = (name: string | undefined, side: SceneSide): number | null => {
    if (!name || !squadsNow) return null;
    const hit = findPlayer(squadsNow, name);
    if (!hit || hit.side !== side) return null;
    const player = squadsNow[hit.side].players[hit.index];
    const i = players.findIndex((b) => b.side === hit.side && b.name === player?.name);
    return i >= 0 ? i : null;
  };
  const markActor = (i: number | null) => {
    if (i != null && i >= 0) agents[i]!.actor = true;
  };
  const move = (i: number, t0: number, t1: number, to: Vec, pace: Pace, contact?: boolean) => {
    if (i < 0) return;
    moves.push({ i, t0: Math.round(t0), t1: Math.round(t1), to: inPitch(to), pace, ...(contact ? { contact } : {}) });
  };
  const flight = (t0: number, to: Vec, style: FlightStyle, speed: number, lift: number, trail: ScriptTrail['kind'] | null, from: Vec, min = 380) => {
    const dur = flightMs(from, to, speed, min);
    t0 = Math.round(t0);
    let ti: number | null = null;
    if (trail) {
      ti = trails.length;
      trails.push({ from, to, t0: Math.round(t0), t1: Math.round(t0 + dur), kind: trail });
    }
    ball.push({ kind: 'flight', t0: Math.round(t0), t1: Math.round(t0 + dur), to, style, lift, trail: ti });
    return t0 + dur;
  };
  const seg = (s: BallSeg) => ball.push({ ...s, t0: Math.round(s.t0), t1: Math.round(s.t1) });
  // Olay anındaki beklenen kişi sayısı: ilk 11 (kadroda 11'den azsa o kadar) eksi önceki kırmızı kartlar.
  const expected = {} as Record<SceneSide, number>;
  for (const side of ['home', 'away'] as const) {
    const starters = squads ? Math.min(11, squads[side].players.filter((p) => p.starter).length) || 11 : 11;
    const at = changeKey(item.minute, item.extraMinute);
    expected[side] = starters - (squads?.changes ?? []).filter((c) => c.side === side && c.kind === 'red' && changeKey(c.minute, c.extra) < at).length;
  }
  /** Oyuncu karesini sceneRules'tan geçirir (düzeltilmiş konumlar). `fixed`: rolüyle yerleşenler. */
  const settled = (pos: Vec[], fixed: ReadonlySet<number>, phase: ScenePhase, ballAt: Vec | null, shooter: number | null = null): Vec[] => {
    const bodies: RuleBody[] = players.map((b, i) => ({ side: b.side!, goalkeeper: b.goalkeeper, pos: pos[i]!, ...(fixed.has(i) ? { fixed: true } : {}) }));
    return validateScene({ bodies, ball: ballAt, attack, geo, phase, shooter, lateGame: (item.minute ?? 0) >= 88 }).positions;
  };

  switch (type) {
    case 'goal':
    case 'shot_saved':
    case 'shot_blocked':
    case 'shot_off': {
      const ownGoal = !!scene.ownGoal;
      const zone: SceneZone = ownGoal ? 'six_yard' : (scene.zone ?? 'box_centre');
      // Penaltı: vuruş noktası (kale çizgisinden 56 px ≈ 11 m).
      const from = penalty ? A.P(1 - 62 / SCENE_W, 0) : zonePoint(zone, geo);
      const s0 = A.s(from);
      const shooterSide = ownGoal ? defend : attack;
      const shooterNamed = named(scene.actors[0], shooterSide);
      const shooter = shooterNamed ?? nearest(shooterSide, from, from);
      markActor(shooterNamed);
      const assist = ownGoal ? null : named(scene.assist, attack);
      const keeper = keeperOf(defend);
      const back = (p: Vec, du: number, ds = 0) => A.P(A.u(p) - du, clamp(A.s(p) + ds, -0.95, 0.95));
      let tReady: number;
      let receiver = shooter;

      if (penalty) {
        // Penaltı: top noktada, kullanan hemen arkasında, kaleci çizgide; diğerleri ceza sahası ve yay dışında (başlangıç
        // sceneRules "penalty" kuralından geçer). Kısa bekleme, koşu, vuruş.
        ball0 = from;
        ballDead = true;
        const runFrom = A.P(A.u(from) - 0.028, 0.03);
        startAt.set(shooter, runFrom);
        startAt.set(keeper, A.P(0.99, 0));
        seg({ kind: 'loose', t0: 0, t1: 1600 });
        move(shooter, 0, 1600, runFrom, 'walk');
        move(keeper, 0, 2600, A.P(0.99, 0), 'walk');
        const kickAt = A.P(A.u(from) - 0.012, 0.004);
        tReady = 1600 + eta(runFrom, kickAt, 'jog');
        move(shooter, 1600, tReady, kickAt, 'jog');
        seg({ kind: 'loose', t0: 1600, t1: tReady });
        // Bekleyenler vuruşa kadar ceza sahası ve yay dışında yerinde durur (kural yerleşimi).
        const waitAt = settled(
          players.map((_, i) => (i === shooter ? runFrom : i === keeper ? A.P(0.99, 0) : shapeOf(i, from))),
          new Set([shooter, keeper]),
          'penalty',
          from,
          shooter,
        );
        waitAt.forEach((p, i) => {
          if (i === shooter || i === keeper) return;
          startAt.set(i, p);
          move(i, 0, tReady + 150, p, 'walk');
        });
        // Vuruşla birlikte iki takım dönen topa / pozisyona ceza sahasına girer.
        players.forEach((b, i) => {
          if (i === shooter || b.goalkeeper || dist(shapeOf(i, from), from) > 140) return;
          const at = shapeOf(i, from);
          move(i, tReady + 150, tReady + 2200, lerp(at, from, 0.25), 'run');
        });
      } else if (fromCorner) {
        // Korner: top köşede, kullanan bayrakta, iki takım ceza sahasında; orta vuranın noktasına iner, vuruş oradan.
        const flag = cornerPoint(null, geo, seed);
        const inward = { x: flag.x - dir * 5, y: flag.y + (flag.y < MID_Y ? 5 : -5) };
        const taker = assist != null && assist !== shooter ? assist : nearest(attack, flag, flag, new Set([shooter]));
        markActor(assist != null && assist === taker ? taker : null);
        ball0 = flag;
        ballDead = true;
        startAt.set(taker, inward);
        const spots: [number, Vec][] = [[shooter, back(from, 0.05, (r() - 0.5) * 0.2)]];
        players
          .map((b, i) => ({ b, i }))
          .filter(({ b, i }) => b.side === attack && !b.goalkeeper && i !== taker && i !== shooter)
          .sort((a, b) => b.b.u0 - a.b.u0)
          .slice(0, 4)
          .forEach(({ i }, k) => spots.push([i, A.P(0.8 + (k % 3) * 0.05, -0.4 + k * 0.25)]));
        players
          .map((b, i) => ({ b, i }))
          .filter(({ b }) => b.side === defend && !b.goalkeeper)
          .sort((a, b) => a.b.u0 - b.b.u0)
          .slice(0, 7)
          .forEach(({ i }, k) => spots.push([i, A.P(0.84 + (k % 3) * 0.045, -0.42 + k * 0.14)]));
        spots.push([keeper, A.P(0.978, 0)]);
        // Ceza sahasındaki kalabalık: çakışma ve sınır kurallarıyla aralanır.
        const spotOf = new Map(spots);
        const atCross = settled(players.map((_, i) => (i === taker ? inward : (spotOf.get(i) ?? shapeOf(i, flag)))), new Set([taker]), 'corner', flag);
        spots.forEach((sp) => (sp[1] = atCross[sp[0]]!));
        let tCross = 2400;
        for (const [i, to] of spots) tCross = Math.max(tCross, 200 + eta(shapeOf(i, flag), to, 'run'));
        tCross = Math.min(tCross, 4200);
        seg({ kind: 'loose', t0: 0, t1: tCross - 300 });
        seg({ kind: 'hold', t0: tCross - 300, t1: tCross, owner: taker });
        const tArrive = flight(tCross, from, 'cross', BALL.cross, 32, 'cross', flag, 900);
        for (const [i, to] of spots) move(i, 200, tArrive + 300, to, 'run');
        // Vuran ortayla noktaya atılır; blok dışındaki sonuçlarda en yakın savunmacı onunla mücadele eder.
        move(shooter, tCross, tArrive + 300, from, 'sprint', true);
        if (type !== 'shot_blocked') {
          const marker = nearest(defend, from, from, new Set([keeper]));
          move(marker, tCross, tArrive + 300, { x: from.x + dir * 5, y: from.y + 3 }, 'sprint', true);
        }
        tReady = tArrive;
      } else if (scene.header || ownGoal) {
        // Orta: kanattan (bölge tarafı; yoksa tohum). Ortayı yapan metinde adı geçen asist ya da adsız temsili oyuncu.
        const wing = ZONE_SIDE[zone] ?? (r() < 0.5 ? -1 : 1);
        const W0 = A.P(0.7 + r() * 0.04, wing * 0.82);
        const W = A.P(0.81 + r() * 0.04, wing * 0.86);
        const ex = new Set([shooter]);
        const crosser = assist != null && assist !== shooter ? assist : nearest(attack, W0, W0, ex);
        markActor(assist != null && assist === crosser ? crosser : null);
        if (ownGoal) receiver = nearest(attack, from, W0, new Set([crosser]));
        startAt.set(crosser, W0);
        ball0 = W0;
        seg({ kind: 'hold', t0: 0, t1: 500, owner: crosser });
        const tCarry = 500 + eta(W0, W, 'dribble');
        seg({ kind: 'carry', t0: 500, t1: tCarry, owner: crosser, to: W });
        // Koşucu ceza sahasında bekler, orta kalkınca vuruş noktasına sprint.
        const wait = onside(back(from, 0.07, -wing * 0.12), W0);
        startAt.set(receiver, onside(back(from, 0.1, -wing * 0.2), W0));
        move(receiver, 0, tCarry, wait, 'jog');
        // Orta, koşucunun vuruş noktasına varışıyla aynı anda iner (top beklemez, koşucu topa yetişir).
        const run = eta(wait, from, 'sprint');
        const tArrive = flight(tCarry, from, 'cross', BALL.cross, 30, 'cross', W, Math.max(700, run));
        move(receiver, tCarry, tArrive + 300, from, 'sprint');
        if (ownGoal) {
          // Savunmacı ortaya müdahale eder; top ayağından/vücudundan kendi kalesine.
          move(shooter, tCarry, tArrive + 700, { x: from.x + dir * 5, y: from.y + 3 }, 'sprint', true);
          move(receiver, tCarry, tArrive + 700, { x: from.x - dir * 6, y: from.y - 4 }, 'sprint', true);
        }
        tReady = tArrive;
      } else if (assist != null && assist !== shooter) {
        // Metinde adı geçen asist: o oyuncu topla başlar, vuruş noktasına pas atar.
        markActor(assist);
        const F = A.P(0.62 + r() * 0.08, clamp(s0 * 0.4 + (r() - 0.5) * 0.6, -0.7, 0.7));
        const F2 = lerp(F, from, 0.16);
        startAt.set(assist, F);
        ball0 = F;
        seg({ kind: 'hold', t0: 0, t1: 500, owner: assist });
        const tCarry = 500 + eta(F, F2, 'dribble');
        seg({ kind: 'carry', t0: 500, t1: tCarry, owner: assist, to: F2 });
        const wait = onside(back(from, 0.06, (r() - 0.5) * 0.2), F2);
        startAt.set(shooter, onside(back(from, 0.1, (r() - 0.5) * 0.2), F));
        move(shooter, 0, tCarry, wait, 'jog');
        // Pas, vuranın koşusuyla buluşacak hızda (ofsayt için geride bekleyen koşucu topa yetişir).
        const run = eta(wait, from, 'sprint');
        const tArrive = flight(tCarry, from, 'pass', BALL.pass, 0, 'pass', F2, Math.max(550, run - 150));
        move(shooter, tCarry, tArrive + 400, from, 'sprint');
        // İlk dokunuş: kısa kontrol.
        const ctrl = A.P(A.u(from) + 0.01, s0);
        tReady = Math.max(tArrive, tCarry + run) + 400;
        seg({ kind: 'carry', t0: tArrive, t1: tReady, owner: shooter, to: ctrl });
      } else {
        // Asist adı yok: vuran topu kısa sürer, vuruş noktasına gelir (pas zinciri uydurulmaz).
        const C0 = inPitch(back(from, 0.11 + r() * 0.04, (r() - 0.5) * 0.3));
        startAt.set(shooter, C0);
        ball0 = C0;
        seg({ kind: 'hold', t0: 0, t1: 450, owner: shooter });
        tReady = 450 + eta(C0, from, 'dribble');
        seg({ kind: 'carry', t0: 450, t1: tReady, owner: shooter, to: from });
      }

      // Savunma: blokta savunmacı vuruş yoluna, vuruştan önce yetişecek şekilde.
      const aimS = clamp(s0 * 0.35 + (r() - 0.5) * 0.18, -0.13, 0.13);
      const goalLine = (s: number): Vec => A.P(0.995, s);
      let tShot = tReady + (scene.header || ownGoal || penalty ? 0 : 250);
      let blocker = -1;
      let blockAt: Vec | null = null;
      if (type === 'shot_blocked') {
        blockAt = lerp(from, goalLine(aimS), 0.28);
        blocker = nearest(defend, blockAt, from, new Set([keeper]));
        const t0 = Math.max(300, tReady - 1800);
        tShot = Math.max(tShot, t0 + eta(shapeOf(blocker, from), blockAt, 'sprint'));
        move(blocker, t0, tShot + 1200, blockAt, 'sprint', true);
      }
      if (tShot > tReady && !(scene.header || ownGoal || penalty)) seg({ kind: 'hold', t0: tReady, t1: tShot, owner: receiver });
      check = { t: tShot, phase: penalty ? 'penalty' : 'shot', shooter: ownGoal ? null : receiver, offsider: null };
      const shotSpeed = scene.header ? BALL.header : BALL.shot;
      const shotFrom = from;
      const react = tShot + 120;

      if (type === 'goal') {
        const target = { x: goalLine(aimS).x + dir * 6, y: goalLine(aimS).y };
        const tGoal = flight(tShot, target, 'shot', ownGoal ? BALL.header : shotSpeed, scene.header ? 6 : 2, 'shot', shotFrom, 420);
        // Kaleci uzanır ama yetişemez (penaltıda yarı yarıya ters köşeye).
        move(keeper, react, tGoal + 1300, A.P(0.975, penalty && r() < 0.5 ? -Math.sign(aimS || 1) * 0.1 : aimS * 0.45), 'dive');
        climax = tGoal;
        if (disallowed) {
          // Sayılmayan gol: kutlama yok, düdük; oyuncular yerine döner.
          effects.push({ kind: 'whistle', at: target, t: tGoal + 500 });
          seg({ kind: 'loose', t0: tGoal, t1: tGoal + 2400 });
          actionEnd = tGoal + 1300;
          duration = tGoal + 2600;
        } else {
          effects.push({ kind: 'goal', at: goalLine(aimS), t: tGoal });
          seg({ kind: 'loose', t0: tGoal, t1: tGoal + 3200 });
          // Kutlama: golcü köşeye koşar, en yakın 3 takım arkadaşı yanına (kendi kalesine golde kutlama hücum edende).
          const celebSide = attack;
          const scorer = ownGoal ? receiver : shooter;
          const corner = A.P(0.86, (s0 >= 0 ? 1 : -1) * 0.78);
          move(scorer, tGoal + 250, tGoal + 3000, corner, 'run');
          const mates = players
            .map((b, i) => ({ b, i }))
            .filter(({ b, i }) => b.side === celebSide && !b.goalkeeper && i !== scorer)
            .sort((a, b) => dist(shapeOf(a.i, from), corner) - dist(shapeOf(b.i, from), corner))
            .slice(0, 3);
          mates.forEach(({ i }, k) => {
            const ang = (k / 3) * Math.PI * 2 + 0.6;
            move(i, tGoal + 450 + k * 150, tGoal + 3000, { x: corner.x + Math.cos(ang) * 13, y: corner.y + Math.sin(ang) * 13 }, 'run');
          });
          actionEnd = tGoal + 3000;
          duration = tGoal + 3800;
          settle = 'kickoff';
        }
      } else if (type === 'shot_saved') {
        const stop = A.P(0.966, aimS * 0.9);
        const tSave = flight(tShot, stop, 'shot', shotSpeed, scene.header ? 6 : 3, 'shot', shotFrom, 420);
        move(keeper, react, tSave + 200, stop, 'dive', true);
        effects.push({ kind: 'save', at: stop, t: tSave });
        climax = tSave;
        if (r() < 0.5) {
          // Kaleci topu tutar.
          seg({ kind: 'hold', t0: tSave, t1: tSave + 2600, owner: keeper });
          move(keeper, tSave + 200, tSave + 2000, A.P(0.95, aimS), 'walk');
          actionEnd = tSave + 1500;
        } else {
          // Çeler: top kısa sekip sahipsiz kalır; en yakın hücumcu ve savunmacı topa koşar (kimin aldığı uydurulmaz).
          const parry = A.P(0.88, clamp(aimS * 3 + (aimS >= 0 ? 0.32 : -0.32), -0.62, 0.62));
          const tLoose = flight(tSave, parry, 'deflect', BALL.deflect, 4, null, stop, 450);
          seg({ kind: 'loose', t0: tLoose, t1: tLoose + 2000 });
          const ex = new Set([keeper, shooter]);
          move(nearest(attack, parry, parry, ex), tSave + 150, tLoose + 900, lerp(parry, A.P(0.8, A.s(parry)), 0.12), 'sprint');
          move(nearest(defend, parry, parry, ex), tSave + 150, tLoose + 900, lerp(parry, A.P(0.95, A.s(parry)), 0.1), 'sprint');
          actionEnd = tLoose + 900;
        }
        duration = actionEnd + 1500;
      } else if (type === 'shot_blocked') {
        const tBlock = flight(tShot, blockAt!, 'shot', shotSpeed, 0, 'shot', shotFrom, 200);
        effects.push({ kind: 'block', at: blockAt!, t: tBlock });
        climax = tBlock;
        const away = inPitch(A.P(A.u(blockAt!) - 0.09, clamp(A.s(blockAt!) + (r() < 0.5 ? -0.42 : 0.42), -0.9, 0.9)));
        const tLoose = flight(tBlock, away, 'deflect', BALL.deflect, 5, null, blockAt!, 450);
        seg({ kind: 'loose', t0: tLoose, t1: tLoose + 2000 });
        const ex = new Set([keeper, shooter, blocker]);
        move(nearest(attack, away, away, ex), tBlock + 150, tLoose + 900, away, 'sprint');
        move(nearest(defend, away, away, ex), tBlock + 150, tLoose + 900, lerp(away, A.P(0.95, A.s(away)), 0.08), 'sprint');
        actionEnd = tLoose + 900;
        duration = actionEnd + 1500;
      } else {
        const wideSign = aimS >= 0 ? 1 : -1;
        if (scene.post) {
          // Direk: top direğe çarpar, sahaya geri seker; yakındakiler sekene koşar.
          const post = goalLine(wideSign * 0.205);
          const tPost = flight(tShot, post, 'shot', shotSpeed, 4, 'shot', shotFrom, 420);
          move(keeper, react, tPost + 600, A.P(0.975, wideSign * 0.13), 'dive');
          effects.push({ kind: 'post', at: post, t: tPost });
          climax = tPost;
          const rebound = A.P(0.84 - r() * 0.04, wideSign * (0.3 + r() * 0.15));
          const tLoose = flight(tPost, rebound, 'deflect', BALL.deflect + 25, 6, null, post, 450);
          seg({ kind: 'loose', t0: tLoose, t1: tLoose + 2000 });
          const ex = new Set([keeper]);
          move(nearest(attack, rebound, rebound, ex), tPost + 150, tLoose + 900, rebound, 'sprint');
          move(nearest(defend, rebound, rebound, ex), tPost + 150, tLoose + 900, lerp(rebound, A.P(0.95, wideSign * 0.2), 0.12), 'sprint');
          actionEnd = tLoose + 900;
        } else {
          // İsabetsiz: top kale dışından (ya da üstünden) taç/aut çizgisini geçer, oyun durur.
          const over = r() < 0.4;
          const out = over ? A.P(1.015, aimS * 1.6) : A.P(1.015, wideSign * (0.3 + r() * 0.25));
          const tOut = flight(tShot, out, 'shot', shotSpeed, over ? 16 : 3, 'shot', shotFrom, 420);
          move(keeper, react, tOut + 400, A.P(0.975, clamp(A.s(out), -0.12, 0.12) * 0.7), 'run');
          seg({ kind: 'loose', t0: tOut, t1: tOut + 2000 });
          climax = tOut;
          actionEnd = tOut + 600;
        }
        duration = actionEnd + 1500;
      }
      break;
    }

    case 'card_yellow':
    case 'card_red': {
      // Oyun durmuş: hakem kartı gören oyuncuya gider, kartı gösterir. Hücum akışı üretilmez.
      inPlay = false;
      const team = defend;
      const actor = named(scene.actors[0], team);
      markActor(actor);
      const centre = { x: SCENE_W / 2, y: MID_Y };
      const spot = inPitch(actor != null ? shapeOf(actor, centre) : A.P(0.42 + r() * 0.2, (r() - 0.5) * 1.1));
      if (actor != null) startAt.set(actor, spot);
      ball0 = { x: spot.x + dir * 8, y: spot.y + 6 };
      ballDead = true;
      seg({ kind: 'loose', t0: 0, t1: 6000 });
      const refAt = inPitch({ x: spot.x - dir * 18, y: spot.y + (spot.y > MID_Y ? -16 : 16) });
      const refFrom = refereeSpot(attack, ball0, flip);
      const tArrive = 300 + eta(refFrom, refAt, 'run');
      move(REF, 300, tArrive + 1800, refAt, 'run');
      if (actor != null) move(actor, 600, tArrive + 1800, lerp(spot, refAt, 0.35), 'walk');
      const tCard = tArrive + 300;
      effects.push({ kind: 'card', at: { x: refAt.x, y: refAt.y - 16 }, t: tCard, red: type === 'card_red' });
      climax = tCard;
      actionEnd = tCard + 1500;
      if (type === 'card_red' && actor != null) {
        // Kırmızı kart: oyuncu en yakın kenar çizgisine yürür ve sahadan çıkar (sonraki sahnelerde takım bir eksik).
        const exit = { x: spot.x, y: spot.y > MID_Y ? SCENE_H - 8 : 8 };
        const tExit = tCard + 700 + eta(spot, exit, 'walk');
        move(actor, tCard + 700, tExit + 400, exit, 'walk');
        fades.push({ i: actor, t: tExit - 300, to: 0 });
        actionEnd = Math.max(actionEnd, tExit);
      }
      duration = actionEnd + 800;
      break;
    }

    case 'substitution': {
      // Oyun durmuş: çıkan kenara yürür, giren kenardan onun yerine; 4. hakem tabelası. Top yerinde kalır.
      inPlay = false;
      const team = scene.side ?? attack;
      agents[SUB]!.side = team;
      const own = lane(team, flip) === 'home' ? -1 : 1;
      const touch = { x: SCENE_W / 2 + own * 18, y: 8 };
      const off = named(scene.actors[1], team);
      const inHit = squadsNow && scene.actors[0] ? findPlayer(squadsNow, scene.actors[0]) : null;
      if (inHit) {
        const p = squadsNow![inHit.side].players[inHit.index]!;
        Object.assign(agents[SUB]!, { actor: true, name: p.name, number: p.number });
      }
      startAt.set(SUB, touch);
      fades.push({ i: SUB, t: 0, to: 1 });
      seg({ kind: 'loose', t0: 0, t1: 6000 });
      effects.push({ kind: 'board', at: { x: SCENE_W / 2, y: 4 }, t: 200 });
      const centre = { x: SCENE_W / 2, y: MID_Y };
      if (off != null) {
        markActor(off);
        const slot = shapeOf(off, centre);
        const tOff = 500 + eta(slot, touch, 'jog');
        move(off, 500, tOff + 400, { x: touch.x + own * 10, y: touch.y + 2 }, 'jog');
        fades.push({ i: off, t: tOff, to: 0 });
        move(SUB, tOff - 600, tOff + 6000, slot, 'jog');
        swap = { from: SUB, into: off };
        climax = tOff;
        actionEnd = tOff + eta(touch, slot, 'jog');
      } else {
        // Çıkan kadroda bulunamadı: giren kenarda görünür, yerine eşleme uydurulmaz.
        move(SUB, 600, 3000, { x: touch.x, y: touch.y + 18 }, 'walk');
        fades.push({ i: SUB, t: 3400, to: 0 });
        climax = 600;
        actionEnd = 3200;
      }
      duration = actionEnd + 500;
      break;
    }

    case 'foul':
    case 'free_kick': {
      // Faule uğrayan topu sürer, savunmacı müdahale eder: düdük, oyuncu yere düşer, hakem koşar.
      const spot = A.P(0.45 + r() * 0.25, (r() - 0.5) * 1.3);
      const isFk = type === 'free_kick';
      const victimNamed = named(isFk ? scene.actors[0] : scene.actors[1], attack);
      const victim = victimNamed ?? nearest(attack, spot, spot);
      const foulerNamed = isFk ? null : named(scene.actors[0], defend);
      const keeper = keeperOf(defend);
      const fouler = foulerNamed ?? nearest(defend, spot, spot, new Set([keeper]));
      markActor(victimNamed);
      markActor(foulerNamed);
      const C0 = inPitch(A.P(A.u(spot) - 0.1, A.s(spot) + (r() - 0.5) * 0.2));
      startAt.set(victim, C0);
      ball0 = C0;
      seg({ kind: 'hold', t0: 0, t1: 400, owner: victim });
      const tContact = Math.max(400 + eta(C0, spot, 'dribble'), 300 + eta(shapeOf(fouler, C0), spot, 'sprint'));
      seg({ kind: 'carry', t0: 400, t1: tContact, owner: victim, to: spot });
      move(fouler, 300, tContact + 1400, { x: spot.x + dir * 5, y: spot.y + 4 }, 'sprint', true);
      move(victim, tContact, tContact + 1400, spot, 'walk', true);
      falls.push({ i: victim, t: tContact });
      effects.push({ kind: 'whistle', at: spot, t: tContact + 100 });
      const roll = A.P(A.u(spot) + 0.03, A.s(spot));
      const tStop = flight(tContact, roll, 'deflect', 60, 0, null, spot, 400);
      seg({ kind: 'loose', t0: tStop, t1: tStop + 3000 });
      const refAt = inPitch({ x: spot.x - dir * 22, y: spot.y + (spot.y > MID_Y ? -18 : 18) });
      const tRef = tContact + 200 + eta(refereeSpot(attack, spot, flip), refAt, 'run');
      move(REF, tContact + 200, tRef + 1000, refAt, 'run');
      climax = tContact;
      actionEnd = tRef + 500;
      duration = actionEnd + 1200;
      break;
    }

    case 'offside': {
      // Pas savunma çizgisinin arkasına; koşucu pas anında çizgiyi geçmiş. Yan hakem bayrağı, düdük.
      const lineU = 0.72 + r() * 0.06;
      const runS = (r() - 0.5) * 0.9;
      const receive = A.P(lineU + 0.12, runS);
      const runnerNamed = named(scene.actors[0], attack);
      const runner = runnerNamed ?? nearest(attack, A.P(lineU - 0.04, runS), A.P(0.5, 0));
      markActor(runnerNamed);
      const P = A.P(0.5, -runS * 0.4);
      const passer = nearest(attack, P, P, new Set([runner]));
      startAt.set(passer, P);
      ball0 = P;
      const P2 = A.P(0.53, -runS * 0.35);
      seg({ kind: 'hold', t0: 0, t1: 500, owner: passer });
      const tPass = Math.max(500 + eta(P, P2, 'dribble'), 2200);
      seg({ kind: 'carry', t0: 500, t1: tPass, owner: passer, to: P2 });
      const line = players
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.side === defend && !b.goalkeeper)
        .sort((a, b) => a.b.u0 - b.b.u0)
        .slice(0, 4)
        .sort((a, b) => a.b.s0 - b.b.s0);
      line.forEach(({ i }, k) => move(i, 0, tPass + 1800, A.P(lineU, -0.6 + k * 0.4), 'run'));
      // Hattın gerisinde kalan başka savunan (5'li savunma, geri dönen orta saha) çizgiyi bozmasın: hattın önüne çıkar.
      const lineSet = new Set(line.map(({ i }) => i));
      players.forEach((b, i) => {
        if (b.side !== defend || b.goalkeeper || lineSet.has(i)) return;
        const at = shapeOf(i, P);
        if (A.u(at) > lineU - 0.03) move(i, 0, tPass + 1800, A.P(lineU - 0.05, A.s(at)), 'run');
      });
      holdLine = lineU - 0.02;
      startAt.set(runner, A.P(lineU - 0.04, runS * 0.8));
      move(runner, 0, tPass - 1400, A.P(lineU - 0.03, runS * 0.8), 'jog');
      move(runner, tPass - 1400, tPass + 200, A.P(lineU + 0.06, runS * 0.8), 'sprint');
      const tRecv = flight(tPass, receive, 'pass', BALL.pass, 0, 'pass', P2, 600);
      move(runner, tPass, tRecv + 1200, receive, 'sprint');
      effects.push({ kind: 'offsideLine', x: A.P(lineU, 0).x, t: tPass - 200 });
      check = { t: tPass, phase: 'open', shooter: null, offsider: runner };
      effects.push({ kind: 'flag', at: A.P(lineU, -1.06), t: tPass + 350 });
      effects.push({ kind: 'whistle', at: receive, t: tRecv + 150 });
      seg({ kind: 'loose', t0: tRecv, t1: tRecv + 2500 });
      climax = tPass + 350;
      actionEnd = tRecv + 1200;
      duration = actionEnd + 1000;
      break;
    }

    default:
      return null;
  }

  // Başlangıç: belirtilenler kendi yerinde, diğerleri top etrafındaki şekilde; hakem çaprazda. Sonra kurallar (ofsayt,
  // kaleci, çakışma, penaltı yerleşimi) — rolüyle yerleşenler sabit.
  const ref0 = ball0 ?? { x: SCENE_W / 2, y: MID_Y };
  const startPlayers: Vec[] = agents.map((b, i) => {
    const at = startAt.get(i);
    if (at) return inPitch(at);
    if (b.referee) return refereeSpot(attack, ref0, flip);
    if (b.sub) return b.home;
    return shapeAt(b, attack, ref0, flip);
  });
  const leadOf = (): ScenePlan['lead'] => {
    const hit = squadsNow && scene.actors[0] ? findPlayer(squadsNow, scene.actors[0]) : null;
    const p = hit ? squadsNow![hit.side].players[hit.index] : null;
    return p && hit ? { name: p.name, number: p.number, side: hit.side } : null;
  };
  const startPhase: ScenePhase = penalty ? 'penalty' : fromCorner ? 'corner' : inPlay ? 'open' : 'dead';
  const fixedStart = new Set([...startAt.keys()].filter((i) => i < n));
  settled(startPlayers.slice(0, n), fixedStart, startPhase, ball0, null).forEach((p, i) => (startPlayers[i] = p));
  ball.sort((a, b) => a.t0 - b.t0);

  return {
    type,
    side: attack,
    flip,
    penalty,
    expected,
    check,
    holdLine,
    lead: leadOf(),
    inPlay,
    agents,
    start: { ball: ball0, ballDead, players: startPlayers },
    moves,
    ball,
    trails,
    effects: effects.map((e) => ({ ...e, t: Math.round(e.t) })),
    falls: falls.map((f) => ({ ...f, t: Math.round(f.t) })),
    fades: fades.map((f) => ({ ...f, t: Math.round(f.t) })),
    swap,
    climaxMs: Math.round(climax),
    actionEndMs: Math.round(actionEnd),
    durationMs: Math.round(duration),
    settle,
    disallowed: type === 'goal' && disallowed,
  };
}

/** Efektin `t` anındaki görünümü: belirir (ölçek 0,4 → 1,15 → 1); anlık olanlar kısa süre sonra söner. */
export function effectState(e: ScriptEffect, t: number, actionEndMs: number): { opacity: number; scale: number } {
  if (t < e.t) return { opacity: 0, scale: 0.4 };
  const k = (t - e.t) / 180;
  const scale = k < 1 ? 0.4 + 0.75 * k : Math.max(1, 1.15 - (k - 1) * 0.15);
  const transient = e.kind === 'whistle' || e.kind === 'block' || e.kind === 'post' || e.kind === 'save' || e.kind === 'flag';
  const end = transient ? e.t + 1100 : Math.max(e.t + 1600, actionEndMs + 600);
  const opacity = t < e.t + 180 ? Math.min(1, k) : t < end ? 1 : Math.max(0, 1 - (t - end) / 400);
  return { opacity, scale };
}

/** İz: uçuş sırasında çizilir (dashoffset 1 → 0), sonra söner; şut izi toparlanmaya kadar kalır. */
export function trailState(tr: ScriptTrail, t: number, actionEndMs: number): { opacity: number; offset: number } {
  if (t < tr.t0) return { opacity: 0, offset: 1 };
  if (t < tr.t1) return { opacity: 0.9, offset: 1 - (t - tr.t0) / Math.max(1, tr.t1 - tr.t0) };
  const hold = tr.kind === 'shot' ? Math.max(tr.t1 + 900, actionEndMs) : tr.t1 + 700;
  return { opacity: t < hold ? 0.9 : Math.max(0, 0.9 - (t - hold) / 500), offset: 0 };
}

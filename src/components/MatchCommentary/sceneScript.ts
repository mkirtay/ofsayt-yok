/**
 * Anlatım sahnesinin "mini maç" senaryosu — saf modül (bileşen yalnız oynatır, test buradan). Football Manager'ın 2D
 * motorundaki gibi: olaydan önce kısa bir oyun akışı (paslar, koşular, savunmanın kayması), ardından olayın kendisi
 * (şut/gol/kurtarış/blok, korner, faul + hakem, ofsayt bayrağı…).
 *
 * KONUMLAR GERÇEK DEĞİL (ballCoordinates güvenilmez bulundu, kullanılmıyor): diziliş kadrodan (formation_field), hedef
 * bölge metinden ("from the left side of the box"), akışın geri kalanı olay kimliğinden tohumlanan belirlenimli
 * rastgelelikle. Aynı satır her oynatışta aynı sahneyi verir.
 *
 * Çıktı: her oyuncu, top, hakem için zaman damgalı konum izleri (Web Animations ile oynatılır; yalnız transform) ve
 * zamanlı efektler (pas izi, gol ağı, kurtarış, düdük, bayrak, kart…).
 */
import type { CommentaryItem, SceneSide, SceneZone } from '@/services/sportmonks/matchCommentary';
import { findPlayer, type SceneSquads } from '@/services/sportmonks/commentaryScene';
import { SCENE_H, SCENE_W, cornerPoint, placeSquad, zonePoint } from './sceneLayout';

export type Vec = { x: number; y: number };
/** Zaman damgalı konumlar (ms, artan). */
export type Track = { t: number[]; p: Vec[] };

export type ScriptPlayer = {
  side: SceneSide;
  name: string;
  number: number | null;
  goalkeeper: boolean;
  /** Olayın aktörü (vuran, faul yapan, kart gören, ofsayta düşen…) — halka ile vurgulanır. */
  actor: boolean;
  track: Track;
  /** Yere düşme anı (faul) — nokta kısa süre basılır. */
  fallAt?: number;
  /** Oyundan çıkan / giren (değişiklik). */
  goingOff?: boolean;
  comingOn?: boolean;
};

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

export type SceneScript = {
  durationMs: number;
  /** Hücum eden taraf (ev sahibi sağa hücum eder). */
  side: SceneSide;
  players: ScriptPlayer[];
  ball: { track: Track; lift: number[] };
  referee: Track;
  trails: ScriptTrail[];
  effects: ScriptEffect[];
};

const MID_Y = SCENE_H / 2;
const other = (s: SceneSide): SceneSide => (s === 'home' ? 'away' : 'home');
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const round = (v: Vec): Vec => ({ x: Math.round(v.x * 10) / 10, y: Math.round(v.y * 10) / 10 });

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
 * Hücum çerçevesi: u = 0 kendi kalesi … 1 rakip kale; s = -1 hücum edenin solu … +1 sağı. Ekrana çevirir
 * (ev sahibi sağa hücum eder; onun solu ekranın üstü).
 */
function frame(side: SceneSide) {
  const flip = side === 'home' ? 1 : -1;
  return {
    P: (u: number, s: number): Vec => ({ x: side === 'home' ? u * SCENE_W : (1 - u) * SCENE_W, y: MID_Y + s * flip * (MID_Y - 14) }),
    u: (p: Vec) => (side === 'home' ? p.x / SCENE_W : 1 - p.x / SCENE_W),
    s: (p: Vec) => ((p.y - MID_Y) / (MID_Y - 14)) * flip,
  };
}

type Beat = {
  t: number;
  ball: Vec;
  lift?: number;
  /** Topu süren / alan oyuncu (indeks) — top ayağında. */
  carrier?: number | null;
  /** Bu anda yeri sabitlenen oyuncular (alıcı koşusu, kaleci, baskı, kutlama…). */
  pin?: Map<number, Vec>;
};

type Base = { side: SceneSide; name: string; number: number | null; goalkeeper: boolean; u0: number; s0: number };

/** Takım şekli: top konumuna göre blok ileri/geri ve yana kayar (hücum eden yayılır, savunan daralır). */
function shapeAt(b: Base, attack: SceneSide, ball: Vec, jitter: number): Vec {
  const A = frame(attack);
  const ub = clamp(A.u(ball), 0, 1);
  const sb = clamp(A.s(ball), -1, 1);
  if (b.side === attack) {
    if (b.goalkeeper) return A.P(0.05 + 0.1 * ub, sb * 0.08);
    const u = clamp(b.u0 + 0.62 * ub - 0.1, 0.1, 0.9);
    const s = clamp(b.s0 * 0.95 + sb * 0.18 + jitter * 0.04, -0.98, 0.98);
    return A.P(u + jitter * 0.012, s);
  }
  // Savunan takım kendi çerçevesinde: kale u' = 0, top u' = 1 - ub.
  const D = frame(b.side);
  const ubd = 1 - ub;
  if (b.goalkeeper) return D.P(0.025 + 0.025 * clamp(1 - ubd * 3, 0, 1), clamp(-sb * 0.22, -0.16, 0.16));
  const u = clamp(0.07 + (b.u0 - 0.04) * 0.72 + 0.4 * ubd, 0.06, 0.7);
  // Savunanın s'i kendi bakışına göre; topun ekran yanına daralsın diye hücum eden çerçevesindeki s'i çevir.
  const s = clamp(b.s0 * 0.72 - sb * 0.3 + jitter * 0.03, -0.92, 0.92);
  return D.P(u + jitter * 0.01, s);
}

type Ctx = {
  item: CommentaryItem;
  squads: SceneSquads | null;
  attack: SceneSide;
  rand: () => number;
  bases: Base[];
};

function buildBases(squads: SceneSquads | null): Base[] {
  const out: Base[] = [];
  for (const side of ['home', 'away'] as const) {
    const F = frame(side);
    for (const p of placeSquad(squads, side)) {
      const at = { x: p.x, y: p.y };
      out.push({ side, name: p.name, number: p.number, goalkeeper: p.goalkeeper, u0: F.u(at), s0: F.s(at) });
    }
  }
  return out;
}

/** Ad → oyuncu indeksi (sahada); bulunamazsa null. */
function indexOf(ctx: Ctx, name: string | undefined): number | null {
  if (!name || !ctx.squads) return null;
  const hit = findPlayer(ctx.squads, name);
  if (!hit) return null;
  const player = ctx.squads[hit.side].players[hit.index];
  const i = ctx.bases.findIndex((b) => b.side === hit.side && b.name === player?.name);
  return i >= 0 ? i : null;
}

/** Bir noktaya en yakın oyuncu (taraf filtresiyle, kaleci hariç, dışlananlar hariç) — verilen beat'teki şekle göre. */
function nearest(ctx: Ctx, side: SceneSide, at: Vec, ball: Vec, exclude: ReadonlySet<number>): number {
  let best = -1;
  let bestD = Infinity;
  ctx.bases.forEach((b, i) => {
    if (b.side !== side || b.goalkeeper || exclude.has(i)) return;
    const d = dist(shapeAt(b, ctx.attack, ball, 0), at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

const keeperOf = (ctx: Ctx, side: SceneSide) => ctx.bases.findIndex((b) => b.side === side && b.goalkeeper);

/** Pas süresi: mesafeye göre (yaklaşık 0,5 px/ms; şut daha hızlı). */
const travel = (a: Vec, b: Vec, speed = 0.5) => clamp(dist(a, b) / speed, 260, 900);

/**
 * Hücum akışı: başlangıçtan son vuruş noktasına 2–3 pas. Dönüş: beat listesi, son beat'te top `end` noktasında
 * `shooter` ayağında. `wing`: kanattan orta ile biter (kafa vuruşu / korner sonrası).
 */
function buildUp(
  ctx: Ctx,
  end: Vec,
  shooter: number,
  { wing, fast, t0 = 0 }: { wing?: -1 | 1 | null; fast?: boolean; t0?: number },
  beats: Beat[],
  trails: ScriptTrail[],
): number {
  const A = frame(ctx.attack);
  const r = ctx.rand;
  const endS = A.s(end);
  const waypoints: { at: Vec; lift: number; kind: ScriptTrail['kind'] }[] = [];
  if (fast) {
    waypoints.push({ at: A.P(0.28 + r() * 0.06, (r() - 0.5) * 0.6), lift: 0, kind: 'pass' });
    waypoints.push({ at: A.P(0.6 + r() * 0.06, endS * 0.5 + (r() - 0.5) * 0.4), lift: 6, kind: 'pass' });
  } else {
    const startS = (r() - 0.5) * 0.9;
    waypoints.push({ at: A.P(0.36 + r() * 0.08, startS), lift: 0, kind: 'pass' });
    waypoints.push({ at: A.P(0.52 + r() * 0.06, clamp(startS * -0.6 + (r() - 0.5) * 0.5, -0.8, 0.8)), lift: 0, kind: 'pass' });
  }
  if (wing) waypoints.push({ at: A.P(0.8 + r() * 0.06, wing * (0.78 + r() * 0.12)), lift: 0, kind: 'pass' });
  else waypoints.push({ at: A.P(0.66 + r() * 0.06, clamp(endS * 0.4 + (r() - 0.5) * 0.7, -0.7, 0.7)), lift: 0, kind: 'pass' });

  // Pas zincirine oyuncu ata: her durağa ona en yakın hücumcu (vuran son durak için ayrılır).
  const used = new Set<number>([shooter]);
  const carriers = waypoints.map((w) => {
    const i = nearest(ctx, ctx.attack, w.at, w.at, used);
    used.add(i);
    return i;
  });

  let t = t0;
  let prev: Vec | null = null;
  waypoints.forEach((w, k) => {
    const carrier = carriers[k]!;
    if (prev) {
      // Pas: top önceki duraktan buna gider; alıcı oraya koşar.
      const dur = travel(prev, w.at, fast ? 0.62 : 0.5);
      trails.push({ from: prev, to: w.at, t0: t, t1: t + dur, kind: w.kind });
      t += dur;
    }
    beats.push({ t, ball: w.at, carrier, lift: 0 });
    // Kısa sürüş: top ileri doğru biraz taşınır.
    const carry = lerp(w.at, k + 1 < waypoints.length ? waypoints[k + 1]!.at : end, 0.14);
    t += fast ? 220 : 340;
    beats.push({ t, ball: carry, carrier });
    prev = carry;
  });
  // Son pas / orta vurana.
  const last = prev!;
  const crossing = !!wing;
  const dur = travel(last, end, crossing ? 0.42 : 0.5);
  trails.push({ from: last, to: end, t0: t, t1: t + dur, kind: crossing ? 'cross' : 'pass' });
  beats.push({ t: t + dur * 0.5, ball: lerp(last, end, 0.5), lift: crossing ? 22 : 0, carrier: null, pin: new Map([[shooter, end]]) });
  t += dur;
  beats.push({ t, ball: end, carrier: shooter });
  return t;
}

/** Beat'lerden oyuncu izleri: şekil + sabitlemeler + top taşıyıcısı. */
function tracksFrom(ctx: Ctx, beats: Beat[]): Track[] {
  const n = ctx.bases.length;
  const tracks: Track[] = Array.from({ length: n }, () => ({ t: [], p: [] }));
  const rand = rng(ctx.item.id * 31 + 7);
  const phase = ctx.bases.map(() => rand() * Math.PI * 2);
  for (const beat of beats) {
    ctx.bases.forEach((b, i) => {
      const jitter = Math.sin(beat.t / 480 + phase[i]!);
      let p = shapeAt(b, ctx.attack, beat.ball, jitter);
      const pinned = beat.pin?.get(i);
      if (pinned) p = pinned;
      else if (beat.carrier === i) {
        // Top ayağında: topun biraz gerisinde (kendi kalesi tarafında).
        const back = frame(b.side).P(0, 0).x < beat.ball.x ? -6 : 6;
        p = { x: beat.ball.x + back, y: beat.ball.y };
      }
      tracks[i]!.t.push(Math.round(beat.t));
      tracks[i]!.p.push(round({ x: clamp(p.x, 8, SCENE_W - 8), y: clamp(p.y, 8, SCENE_H - 8) }));
    });
  }
  return tracks;
}

/** Savunan takımdan topa en yakın oyuncu topa baskı yapar (beat'e sabitleme ekler). */
function addPress(ctx: Ctx, beats: Beat[], skip: ReadonlySet<number> = new Set()) {
  const def = other(ctx.attack);
  const D = frame(def);
  for (const beat of beats) {
    if (beat.carrier == null) continue;
    const i = nearest(ctx, def, beat.ball, beat.ball, skip);
    if (i < 0 || beat.pin?.has(i)) continue;
    // Topla kendi kalesi arasında, 16 px yakında.
    const towardGoal = D.P(0, D.s(beat.ball));
    const p = lerp(beat.ball, towardGoal, 16 / Math.max(16, dist(beat.ball, towardGoal)));
    beat.pin = new Map(beat.pin ?? []);
    beat.pin.set(i, p);
  }
}

/** Hakem: oyunu 60–90 px geriden izler; `to` verilirse son beat'te oraya koşar. */
function refereeTrack(ctx: Ctx, beats: Beat[], to?: { at: Vec; t: number }): Track {
  const A = frame(ctx.attack);
  const track: Track = { t: [], p: [] };
  for (const beat of beats) {
    const ub = A.u(beat.ball);
    const p = A.P(clamp(ub - 0.16, 0.2, 0.78), clamp(-A.s(beat.ball) * 0.4 + 0.25, -0.7, 0.7));
    track.t.push(Math.round(beat.t));
    track.p.push(round(p));
  }
  if (to) {
    track.t.push(Math.round(to.t));
    track.p.push(round(to.at));
  }
  return track;
}

const ZONE_SIDE: Partial<Record<SceneZone, -1 | 1>> = { box_left: -1, outside_box_left: -1, box_right: 1, outside_box_right: 1 };

/**
 * Satır → senaryo. Sahnesi olmayan satır için null. Aktör kadroda bulunamazsa rolü en uygun yerdeki oyuncu üstlenir
 * (sahne yine temsili; not kutusu sabit).
 */
export function buildScript(item: CommentaryItem, squads: SceneSquads | null): SceneScript | null {
  const scene = item.scene;
  if (!scene) return null;
  // Faulde `side` faul yapan takımdır; akış faule uğrayanın hücumudur.
  const attack: SceneSide = scene.type === 'foul' || scene.type === 'card_yellow' || scene.type === 'card_red' ? other(scene.side ?? 'away') : (scene.side ?? 'home');
  const ctx: Ctx = { item, squads, attack, rand: rng(item.id), bases: buildBases(squads) };
  const A = frame(attack);
  const D = frame(other(attack));
  const beats: Beat[] = [];
  const trails: ScriptTrail[] = [];
  const effects: ScriptEffect[] = [];
  const actors = new Set<number>();
  const extra: Partial<Record<number, Partial<ScriptPlayer>>> = {};
  let refTo: { at: Vec; t: number } | undefined;
  let end = 0;

  const actorIdx = (name: string | undefined, side: SceneSide, near: Vec): number => {
    const found = indexOf(ctx, name);
    const i = found != null && ctx.bases[found]!.side === side ? found : nearest(ctx, side, near, near, actors);
    actors.add(i);
    return i;
  };
  const markActor = (i: number) => {
    extra[i] = { ...extra[i], actor: true };
  };
  const goalLine = (s: number): Vec => A.P(0.995, s);
  const keeper = keeperOf(ctx, other(attack));

  switch (scene.type) {
    case 'goal':
    case 'shot_saved':
    case 'shot_blocked':
    case 'shot_off': {
      const zone = scene.ownGoal ? 'six_yard' : scene.zone;
      const from = zonePoint(zone, attack);
      const shooterSide = scene.ownGoal ? other(attack) : attack;
      const shooter = actorIdx(scene.actors[0], shooterSide, from);
      markActor(shooter);
      const wing = scene.header || scene.ownGoal ? (ZONE_SIDE[zone ?? 'box_centre'] ?? (ctx.rand() < 0.5 ? -1 : 1)) : ctx.rand() < 0.3 ? (ZONE_SIDE[zone ?? 'box_centre'] ?? null) : null;
      // Kendi kalesine: orta savunanın ayağına çarpar — akış hücum edenin, vuran savunan oyuncu.
      const runner = scene.ownGoal ? nearest(ctx, attack, from, from, actors) : shooter;
      let t = buildUp(ctx, from, runner, { wing, fast: ctx.rand() < 0.25 }, beats, trails);
      if (scene.ownGoal) {
        const last = beats[beats.length - 1]!;
        last.pin = new Map([[shooter, { x: from.x + (attack === 'home' ? -4 : 4), y: from.y + 6 }]]);
      }
      // Vuruş öncesi kısa an (topu kontrol + vuruş).
      t += scene.header ? 60 : 260;
      beats.push({ t, ball: from, carrier: scene.ownGoal ? null : shooter, pin: scene.ownGoal ? new Map([[shooter, from]]) : undefined });
      addPress(ctx, beats, new Set([keeper]));

      const s0 = A.s(from);
      const aimS = clamp(s0 * 0.35 + (ctx.rand() - 0.5) * 0.18, -0.13, 0.13);
      const kStart = A.P(0.975, clamp(s0 * 0.12, -0.08, 0.08));
      if (scene.type === 'goal') {
        const target = goalLine(aimS);
        const dur = travel(from, target, 1.05);
        trails.push({ from, to: target, t0: t, t1: t + dur, kind: 'shot' });
        // Kaleci geç uzanır, yetişemez.
        const dive = A.P(0.975, aimS * 0.45);
        beats.push({ t: t + dur, ball: { x: target.x + (attack === 'home' ? 4 : -4), y: target.y }, lift: scene.header ? 6 : 2, carrier: null, pin: new Map([[keeper, dive]]) });
        effects.push({ kind: 'goal', at: target, t: t + dur });
        t += dur;
        // Kutlama: hücumcular golcüye koşar.
        const scorer = shooter;
        const meet = A.P(0.86, clamp(s0, -0.75, 0.75) * 0.9);
        const pin = new Map<number, Vec>([[keeper, dive]]);
        let k = 0;
        ctx.bases.forEach((b, i) => {
          if (b.side !== (scene.ownGoal ? other(attack) : attack) || b.goalkeeper) return;
          if (i === scorer) return;
          if (!scene.ownGoal && k < 5) pin.set(i, { x: meet.x + Math.cos(k * 1.3) * 16, y: meet.y + Math.sin(k * 1.3) * 16 });
          k++;
        });
        if (!scene.ownGoal) pin.set(scorer, meet);
        beats.push({ t: t + 1400, ball: { x: target.x + (attack === 'home' ? 4 : -4), y: target.y }, carrier: null, pin });
        end = t + 1700;
      } else if (scene.type === 'shot_saved') {
        const stop = A.P(0.965, aimS * 0.9);
        const dur = travel(from, stop, 1.0);
        trails.push({ from, to: stop, t0: t, t1: t + dur, kind: 'shot' });
        beats.push({ t: t + dur, ball: stop, lift: scene.header ? 6 : 3, carrier: null, pin: new Map([[keeper, stop]]) });
        effects.push({ kind: 'save', at: stop, t: t + dur });
        t += dur;
        // Kaleci topu kucaklar ya da çeler: top kısa sekme.
        const parry = A.P(0.9, clamp(aimS * 3 + (aimS >= 0 ? 0.25 : -0.25), -0.6, 0.6));
        const caught = ctx.rand() < 0.5;
        beats.push({ t: t + 520, ball: caught ? stop : parry, carrier: caught ? keeper : null, pin: new Map([[keeper, caught ? stop : A.P(0.97, aimS)]]) });
        end = t + 1300;
      } else if (scene.type === 'shot_blocked') {
        const target = goalLine(aimS);
        const blockAt = lerp(from, target, 0.3);
        const blocker = nearest(ctx, other(attack), blockAt, from, new Set([keeper]));
        const dur = travel(from, blockAt, 1.0);
        trails.push({ from, to: blockAt, t0: t, t1: t + dur, kind: 'shot' });
        beats.push({ t: t + dur, ball: blockAt, carrier: null, pin: new Map([[blocker, blockAt]]) });
        effects.push({ kind: 'block', at: blockAt, t: t + dur });
        t += dur;
        const away = A.P(A.u(blockAt) - 0.08, clamp(A.s(blockAt) + (ctx.rand() < 0.5 ? -0.45 : 0.45), -0.95, 0.95));
        beats.push({ t: t + 650, ball: away, carrier: null, pin: new Map([[blocker, lerp(blockAt, away, 0.2)]]) });
        end = t + 1300;
      } else {
        const wideSign = aimS >= 0 ? 1 : -1;
        if (scene.post) {
          const post = goalLine(wideSign * 0.205);
          const dur = travel(from, post, 1.05);
          trails.push({ from, to: post, t0: t, t1: t + dur, kind: 'shot' });
          beats.push({ t: t + dur, ball: post, lift: 4, carrier: null, pin: new Map([[keeper, A.P(0.975, wideSign * 0.12)]]) });
          effects.push({ kind: 'post', at: post, t: t + dur });
          t += dur;
          beats.push({ t: t + 600, ball: A.P(0.84, wideSign * 0.4), carrier: null });
        } else {
          const out = A.P(1.01, wideSign * (0.3 + ctx.rand() * 0.25));
          const dur = travel(from, out, 1.05);
          trails.push({ from, to: out, t0: t, t1: t + dur, kind: 'shot' });
          beats.push({ t: t + dur, ball: out, lift: ctx.rand() < 0.5 ? 10 : 2, carrier: null, pin: new Map([[keeper, A.P(0.975, wideSign * 0.1)]]) });
          t += dur;
        }
        end = t + 1100;
      }
      void kStart;
      break;
    }

    case 'corner': {
      const flag = cornerPoint(scene.zone, attack, item.id);
      const box = zonePoint('box_centre', attack);
      const taker = nearest(ctx, attack, flag, flag, new Set());
      // Duran top: hücumcular ceza sahasına dolar, savunanlar adam adama.
      const set = new Map<number, Vec>([[taker, flag]]);
      let ai = 0;
      let di = 0;
      ctx.bases.forEach((b, i) => {
        if (b.goalkeeper || i === taker) return;
        if (b.side === attack) {
          if (ai < 6) set.set(i, A.P(0.8 + (ai % 3) * 0.05, -0.32 + (ai % 4) * 0.2));
          ai++;
        } else {
          if (di < 8) set.set(i, A.P(0.83 + (di % 3) * 0.045, -0.36 + (di % 5) * 0.18));
          di++;
        }
      });
      set.set(keeper, A.P(0.98, 0));
      beats.push({ t: 0, ball: flag, carrier: taker, pin: set });
      beats.push({ t: 900, ball: flag, carrier: taker, pin: new Map(set) });
      // Orta: top kavisle ceza sahasına; bir savunmacı kafayla uzaklaştırır.
      const meet = lerp(box, A.P(0.92, 0), ctx.rand() * 0.5);
      const header = nearest(ctx, other(attack), meet, meet, new Set([keeper]));
      const runIn = new Map(set);
      runIn.set(header, meet);
      const dur = travel(flag, meet, 0.4);
      trails.push({ from: flag, to: meet, t0: 900, t1: 900 + dur, kind: 'cross' });
      beats.push({ t: 900 + dur * 0.5, ball: lerp(flag, meet, 0.5), lift: 30, carrier: null, pin: runIn });
      beats.push({ t: 900 + dur, ball: meet, lift: 8, carrier: null, pin: runIn });
      const clear = A.P(0.6, (ctx.rand() - 0.5) * 1.2);
      trails.push({ from: meet, to: clear, t0: 900 + dur, t1: 900 + dur + 700, kind: 'pass' });
      beats.push({ t: 900 + dur + 700, ball: clear, lift: 10, carrier: null });
      end = 900 + dur + 1300;
      break;
    }

    case 'foul':
    case 'card_yellow':
    case 'card_red':
    case 'free_kick': {
      // Hücum eden (faule uğrayan) top sürerken savunmacı müdahale eder; düdük, hakem koşar.
      const r = ctx.rand;
      const spot = A.P(0.5 + r() * 0.25, (r() - 0.5) * 1.4);
      const isFk = scene.type === 'free_kick';
      const victim = isFk ? actorIdx(scene.actors[0], attack, spot) : actorIdx(scene.actors[1], attack, spot);
      let t = buildUp(ctx, lerp(spot, A.P(0.3, A.s(spot)), 0.25), victim, { wing: null }, beats, trails);
      const fouler = isFk ? nearest(ctx, other(attack), spot, spot, new Set([keeper])) : actorIdx(scene.actors[0], other(attack), spot);
      markActor(isFk ? victim : fouler);
      if (isFk && scene.actors[0]) markActor(victim);
      // Sürüş + müdahale
      const approach = D.P(D.u(spot) + 0.05, D.s(spot) + 0.08);
      beats.push({ t: t + 700, ball: spot, carrier: victim, pin: new Map([[fouler, approach]]) });
      t += 1000;
      beats.push({ t, ball: lerp(spot, A.P(A.u(spot) + 0.05, A.s(spot)), 1), carrier: null, pin: new Map([[fouler, spot], [victim, spot]]) });
      effects.push({ kind: 'whistle', at: spot, t });
      extra[victim] = { ...extra[victim], fallAt: t };
      const ref = { x: spot.x + (attack === 'home' ? -22 : 22), y: spot.y + (spot.y > MID_Y ? -18 : 18) };
      refTo = { at: ref, t: t + 900 };
      beats.push({ t: t + 900, ball: lerp(spot, A.P(A.u(spot) + 0.05, A.s(spot)), 1), carrier: null, pin: new Map([[fouler, lerp(spot, ref, 0.4)], [victim, spot]]) });
      if (scene.type === 'card_yellow' || scene.type === 'card_red') {
        effects.push({ kind: 'card', at: { x: ref.x, y: ref.y - 16 }, t: t + 1000, red: scene.type === 'card_red' });
        end = t + 2300;
      } else end = t + 1600;
      break;
    }

    case 'offside': {
      // Ara pas savunma çizgisinin arkasına; forvet çizgiyi erken geçmiş. Yan hakem bayrağı, ofsayt çizgisi.
      const runner = actorIdx(scene.actors[0], attack, A.P(0.74, 0));
      markActor(runner);
      const lineU = 0.72 + ctx.rand() * 0.06;
      const runS = (ctx.rand() - 0.5) * 0.9;
      const receive = A.P(lineU + 0.13, runS);
      const passer = nearest(ctx, attack, A.P(0.5, -runS * 0.5), A.P(0.5, 0), new Set([runner]));
      let t = buildUp(ctx, A.P(0.52, -runS * 0.4), passer, { wing: null }, beats, trails);
      // Savunma çizgisi lineU'da sabit; koşucu çizginin önünde (bir adım ileride) bekler.
      const defLine = new Map<number, Vec>();
      let k = 0;
      ctx.bases.forEach((b, i) => {
        if (b.side === attack || b.goalkeeper) return;
        if (b.u0 < 0.26 && k < 4) defLine.set(i, A.P(lineU, -0.6 + k * 0.4));
        if (b.u0 < 0.26) k++;
      });
      // Koşucu akış boyunca çizginin hemen önünde (kurallı) bekler, pas anında çizgiyi erken geçmiş olur.
      const onside = A.P(lineU - 0.05, runS * 0.8);
      const early = A.P(lineU + 0.035, runS * 0.8);
      beats.forEach((b, k) => {
        b.pin = new Map([...(b.pin ?? []), ...defLine]);
        b.pin.set(runner, k === beats.length - 1 ? early : onside);
      });
      t += 200;
      const dur = travel(A.P(0.52, -runS * 0.4), receive, 0.55);
      trails.push({ from: A.P(0.52, -runS * 0.4), to: receive, t0: t, t1: t + dur, kind: 'pass' });
      effects.push({ kind: 'offsideLine', x: A.P(lineU, 0).x, t });
      beats.push({ t: t + dur, ball: receive, carrier: runner, pin: new Map([...defLine, [runner, receive]]) });
      t += dur;
      effects.push({ kind: 'flag', at: A.P(lineU, -1.06), t: t - dur * 0.3 });
      effects.push({ kind: 'whistle', at: receive, t: t + 150 });
      beats.push({ t: t + 900, ball: receive, carrier: null, pin: new Map([...defLine, [runner, receive]]) });
      end = t + 1500;
      break;
    }

    case 'substitution': {
      // Oyun durmuş: noktalar yerinde, çıkan kenara yürür, giren kenardan girer; 4. hakem tabelası.
      const team = scene.side ?? attack;
      const centre = { x: SCENE_W / 2, y: MID_Y };
      const off = indexOf(ctx, scene.actors[1]);
      beats.push({ t: 0, ball: centre, carrier: null });
      const touch = { x: SCENE_W / 2 + (team === 'home' ? -18 : 18), y: 10 };
      if (off != null) {
        extra[off] = { ...extra[off], goingOff: true, actor: true };
        beats.push({ t: 2200, ball: centre, carrier: null, pin: new Map([[off, touch]]) });
      } else beats.push({ t: 2200, ball: centre, carrier: null });
      effects.push({ kind: 'board', at: { x: SCENE_W / 2, y: 4 }, t: 200 });
      end = 2800;
      break;
    }
    default:
      return null;
  }

  // Değişiklikte giren oyuncu ayrı nokta (sahada değil, kenardan girer).
  const tracks = tracksFrom(ctx, beats);
  const players: ScriptPlayer[] = ctx.bases.map((b, i) => ({
    side: b.side,
    name: b.name,
    number: b.number,
    goalkeeper: b.goalkeeper,
    actor: false,
    ...extra[i],
    track: tracks[i]!,
  }));
  if (scene.type === 'substitution' && scene.actors[0] && ctx.squads) {
    const hit = findPlayer(ctx.squads, scene.actors[0]);
    const team = hit?.side ?? scene.side ?? 'home';
    const touch = { x: SCENE_W / 2 + (team === 'home' ? -18 : 18), y: 10 };
    const offP = players.find((p) => p.goingOff);
    const into = offP ? offP.track.p[0]! : { x: SCENE_W / 2 + (team === 'home' ? -60 : 60), y: 70 };
    players.push({
      side: team,
      name: hit ? (ctx.squads[hit.side].players[hit.index]?.name ?? scene.actors[0]) : scene.actors[0],
      number: null,
      goalkeeper: false,
      actor: true,
      comingOn: true,
      track: { t: [0, 1200, 2700], p: [touch, touch, into] },
    });
  }

  const ballTrack: Track = { t: beats.map((b) => Math.round(b.t)), p: beats.map((b) => round(b.ball)) };
  const lift = beats.map((b) => b.lift ?? 0);
  return {
    durationMs: Math.round(end),
    side: attack,
    players,
    ball: { track: ballTrack, lift },
    referee: refereeTrack(ctx, beats, refTo),
    trails,
    effects,
  };
}

/** İzin `t` anındaki konumu (doğrusal ara değer) — test ve ilk kare için. */
export function positionAt(track: Track, t: number): Vec {
  if (track.t.length === 0) return { x: 0, y: 0 };
  if (t <= track.t[0]!) return track.p[0]!;
  for (let i = 1; i < track.t.length; i++) {
    if (t <= track.t[i]!) {
      const k = (t - track.t[i - 1]!) / Math.max(1, track.t[i]! - track.t[i - 1]!);
      return lerp(track.p[i - 1]!, track.p[i]!, k);
    }
  }
  return track.p[track.p.length - 1]!;
}

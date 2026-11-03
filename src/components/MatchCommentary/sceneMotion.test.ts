import { describe, expect, it } from 'vitest';
import lineupSample from '@/services/sportmonks/__fixtures__/commentaryLineup19746587.json';
import { classifyScene, type CommentaryItem, type SceneSide } from '@/services/sportmonks/matchCommentary';
import { buildSceneSquads, type RawFormation, type RawLineupRow, type RawParticipant } from '@/services/sportmonks/commentaryScene';
import { PACE, buildPlan, dist, type ScenePlan, type Vec } from './scenePlan';
import { CUT_DISTANCE, MAX_DT, createWorld, simulate, steer, stepWorld, type Body, type World } from './sceneMotion';

const lineup = lineupSample as { participants: RawParticipant[]; formations: RawFormation[]; lineups: RawLineupRow[] };
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;
const homeFw = squads.home.players.find((p) => p.starter && p.pos === 'F')!.name;
const awayFw = squads.away.players.find((p) => p.starter && p.pos === 'F')!.name;

const item = (en: string, id = 7, side: SceneSide = 'home'): CommentaryItem => ({
  id,
  order: id,
  minute: 10,
  extraMinute: null,
  kind: 'shot',
  important: false,
  en,
  tr: null,
  scene: { ...classifyScene(en, id)!, side },
});
const plan = (en: string, id = 7, side: SceneSide = 'home') => buildPlan(item(en, id, side), squads)!;

const EVENTS: [string, SceneSide][] = [
  [`Goal! ${homeFw} scores, making it 1-0.`, 'home'],
  [`${homeFw} takes a left-footed shot, but it's saved.`, 'home'],
  [`${homeFw} takes a right-footed shot, but it is blocked.`, 'home'],
  [`${awayFw} takes a left-footed shot that hits the post.`, 'away'],
  [`${homeFw} attempts a header but misses the shot.`, 'home'],
  ['Corner awarded.', 'home'],
];

/** Planı adım adım işletir; her adımda gözlemciyi çağırır. */
function run(p: ScenePlan, ms: number, watch: (w: World, prev: { bodies: Vec[]; ball: Vec }, dt: number) => void, dt = 16, prevWorld: World | null = null) {
  const w = createWorld(p, prevWorld);
  let elapsed = 0;
  while (elapsed < ms) {
    const prev = { bodies: w.bodies.map((b) => ({ ...b.pos })), ball: { ...w.ball.pos } };
    stepWorld(w, dt);
    elapsed += dt;
    watch(w, prev, dt);
  }
  return w;
}

describe('steer — hız/ivme sınırı', () => {
  const body = (): Body => ({ key: 'x', pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, goal: null, filt: null, opacity: 1, off: { x: 0, y: 0 } });

  it('azami hızı ve ivmeyi aşmaz, hedefe frenleyerek varır (salınım yok)', () => {
    const b = body();
    let prevSpeed = 0;
    let overshoot = 0;
    for (let k = 0; k < 400; k++) {
      steer(b, { x: 100, y: 0 }, 50, 170, 0.016);
      const sp = Math.hypot(b.vel.x, b.vel.y);
      expect(sp).toBeLessThanOrEqual(50 + 1e-6);
      expect(Math.abs(sp - prevSpeed)).toBeLessThanOrEqual(170 * 0.016 + 1e-6);
      prevSpeed = sp;
      overshoot = Math.max(overshoot, b.pos.x - 100);
    }
    expect(Math.abs(b.pos.x - 100)).toBeLessThan(1);
    expect(overshoot).toBeLessThan(0.5);
    expect(Math.hypot(b.vel.x, b.vel.y)).toBe(0);
  });

  it('keskin dönüşte yavaşlar (anında ters yöne dönmez)', () => {
    const b = body();
    b.vel = { x: 50, y: 0 };
    steer(b, { x: -100, y: 0 }, 50, 170, 0.016);
    expect(b.vel.x).toBeGreaterThan(40);
  });
});

describe('stepWorld — sahne hareketi', () => {
  it('olay türlerinin hiçbirinde oyuncu ışınlanmaz, tempo sınırı aşılmaz, top uçuş hızında kalır', () => {
    for (const [en, side] of EVENTS) {
      const p = plan(en, 7, side);
      let maxPlayer = 0;
      let maxBall = 0;
      run(p, p.durationMs + 1500, (w, prev, dt) => {
        w.bodies.forEach((b, i) => {
          if (p.agents[i]!.goalkeeper || p.agents[i]!.sub) return;
          maxPlayer = Math.max(maxPlayer, dist(b.pos, prev.bodies[i]!) / (dt / 1000));
        });
        if (w.ball.opacity > 0.99) maxBall = Math.max(maxBall, dist(w.ball.pos, prev.ball) / (dt / 1000));
      });
      // Sprint + ölçülü ayrıştırma payı.
      expect(maxPlayer, en).toBeLessThan(PACE.sprint * 1.25);
      expect(maxBall, en).toBeLessThan(420);
    }
  });

  it('sekme arka plandan dönünce dev dt tek adımda en fazla MAX_DT ilerletir', () => {
    const p = plan(EVENTS[0]![0]);
    const w = createWorld(p, null);
    stepWorld(w, 16);
    const before = w.bodies.map((b) => ({ ...b.pos }));
    const t = w.t;
    stepWorld(w, 60_000);
    expect(w.t - t).toBe(MAX_DT);
    w.bodies.forEach((b, i) => expect(dist(b.pos, before[i]!)).toBeLessThan(PACE.dive * (MAX_DT / 1000) + 2));
  });

  it('kare hızından bağımsız: 16 ms ve 33 ms adımlarla aynı yere varılır', () => {
    const p = plan(EVENTS[1]![0]);
    const a = simulate(p, 6000, null, 16);
    const b = simulate(p, 6000, null, 33);
    // Rol oyuncuları ve top aynı yere varır; ayrıştırma itişmesindeki ufak sıra farkları için şekil oyuncularında pay.
    const gaps = a.bodies.map((x, i) => dist(x.pos, b.bodies[i]!.pos)).sort((x, y) => x - y);
    expect(gaps[Math.floor(gaps.length * 0.8)]!).toBeLessThan(6);
    expect(gaps.at(-1)!).toBeLessThan(20);
    expect(dist(a.ball.pos, b.ball.pos)).toBeLessThan(6);
  });

  it('top hedefe ulaşmadan alıcıya geçmez: uçuştaki top sahipsiz, varıştan sonra sahiplenilir', () => {
    const p = plan(`Goal! ${homeFw} scores to make it 1-0, assisted by ${squads.home.players.find((x) => x.starter && x.pos === 'M')!.name}.`);
    const pass = p.ball.find((s) => s.kind === 'flight' && s.style === 'pass')!;
    let ownedEarly = false;
    let ownedAfter = false;
    run(p, pass.t1 + 1200, (w) => {
      if (w.t >= pass.t0 && w.t < pass.t1 && w.ball.owner != null) ownedEarly = true;
      if (w.t > pass.t1 && w.ball.owner != null) ownedAfter = true;
    });
    expect(ownedEarly).toBe(false);
    expect(ownedAfter).toBe(true);
  });

  it('sürüşte top sahibinin dibinde kalır', () => {
    const p = plan(EVENTS[1]![0]);
    const carry = p.ball.find((s) => s.kind === 'carry')!;
    let far = 0;
    run(p, carry.t1, (w) => {
      if (w.t > carry.t0 + 300 && w.ball.owner === carry.owner) far = Math.max(far, dist(w.ball.pos, w.bodies[carry.owner]!.pos));
    });
    expect(far).toBeLessThan(7);
  });

  it('plan bitince sahne durulur (yeni veri yokken hareket üretmez)', () => {
    const w = simulate(plan(EVENTS[2]![0]), 20_000);
    expect(w.resting).toBe(true);
    const before = w.bodies.map((b) => ({ ...b.pos }));
    for (let k = 0; k < 60; k++) stepWorld(w, 16);
    w.bodies.forEach((b, i) => expect(dist(b.pos, before[i]!)).toBeLessThan(0.5));
  });
});

describe('createWorld — devamlılık', () => {
  it('yeni olay önceki konumlardan devam eder (sıfırlanmaz), yakın yerleşimde kararma yok', () => {
    const a = simulate(plan(EVENTS[1]![0], 7), 3000);
    const next = plan(EVENTS[2]![0], 9);
    const w = createWorld(next, a);
    w.bodies.forEach((b, i) => expect(b.pos).toEqual(a.bodies[i]!.pos));
    if (w.cut == null) expect(w.t).toBeLessThanOrEqual(0);
  });

  it('çok uzak yerleşimde kısa kararma: önce söner, sonra yeni başlangıçta belirir; görünürken sıçrama yok', () => {
    const a = simulate(plan(EVENTS[0]![0], 7), 3000);
    const away = plan(EVENTS[3]![0], 9, 'away');
    const w = createWorld(away, a);
    const gaps = w.bodies.map((b, i) => dist(b.pos, away.start.players[i]!)).sort((x, y) => y - x);
    expect(gaps[2]! > CUT_DISTANCE || gaps[0]! > CUT_DISTANCE * 1.8).toBe(true);
    expect(w.cut).toBe(0);
    let jumpWhileVisible = 0;
    let minOpacity = 1;
    for (let k = 0; k < 60; k++) {
      const prev = w.bodies.map((b) => ({ ...b.pos }));
      const before = w.layerOpacity;
      stepWorld(w, 16);
      minOpacity = Math.min(minOpacity, w.layerOpacity);
      if (before > 0.2 && w.layerOpacity > 0.2) w.bodies.forEach((b, i) => (jumpWhileVisible = Math.max(jumpWhileVisible, dist(b.pos, prev[i]!))));
    }
    expect(minOpacity).toBeLessThan(0.2);
    expect(jumpWhileVisible).toBeLessThan(2);
    expect(w.cut).toBeNull();
  });

  it('kimlikler korunur: değişiklikten sonra giren oyuncu çıkanın kimliğini (yerini) devralır', () => {
    const bench = squads.home.players.find((x) => !x.starter)!.name;
    const p = plan(`${bench} comes on for ${homeFw}.`);
    const w = simulate(p, p.durationMs + 100);
    const off = p.swap!.into;
    expect(w.swapped).toBe(true);
    expect(w.bodies[off]!.opacity).toBe(1);
    expect(w.bodies[p.swap!.from]!.opacity).toBe(0);
    const next = createWorld(plan(EVENTS[1]![0], 11), w);
    expect(next.bodies[off]!.pos).toEqual(w.bodies[off]!.pos);
  });
});

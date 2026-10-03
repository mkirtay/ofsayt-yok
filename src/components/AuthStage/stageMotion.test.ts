import { describe, expect, it } from 'vitest';
import {
  IDLE_SPIN,
  MAX_THROW_SPEED,
  THROW_PX_PER_SEC,
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
} from './stageMotion';

const bounds = { halfW: 4, halfH: 2.5 };
const run = (m: BallMotion, seconds: number, dt = 1 / 60) => {
  let s = m;
  for (let t = 0; t < seconds; t += dt) s = stepMotion(s, dt, bounds, 1);
  return s;
};

describe('sahne topu hareketi', () => {
  it('fırlatılan top kenardan seker, sınır içinde kalır ve merkeze döner', () => {
    let m: BallMotion = { ...restingMotion(), vel: { x: 12, y: 0 } };
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      m = stepMotion(m, 1 / 60, bounds, 1);
      expect(Math.abs(m.pos.x)).toBeLessThanOrEqual(3 + 1e-9);
      if (m.vel.x < 0 && m.pos.x > 2) bounced = true;
    }
    expect(bounced).toBe(true);
    const settled = run(m, 12);
    expect(Math.hypot(settled.pos.x, settled.pos.y)).toBeLessThan(0.02);
  });

  it('açısal hız ataletle sürer, sonra boştaki hafif dönüşe iner', () => {
    const m: BallMotion = { ...restingMotion(), spin: { x: 6, y: -8 } };
    const soon = run(m, 0.3);
    expect(Math.abs(soon.spin.y)).toBeGreaterThan(3); // hâlâ hızlı (atalet)
    const later = run(m, 10);
    expect(later.spin.x).toBeCloseTo(0, 2);
    expect(later.spin.y).toBeCloseTo(IDLE_SPIN, 2);
  });

  it('yavaş bırakma yalnız döndürür; hızlı bırakma fırlatır (ekran y aşağı → dünya y yukarı), hız sınırlı', () => {
    const slow = releaseMotion(restingMotion(), { x: 300, y: 0 }, 0.01);
    expect(slow.vel).toEqual({ x: 0, y: 0 });
    expect(slow.spin.y).toBeGreaterThan(0);
    const fast = releaseMotion(restingMotion(), { x: 0, y: THROW_PX_PER_SEC * 2 }, 0.01);
    expect(fast.vel.y).toBeLessThan(0);
    const huge = releaseMotion(restingMotion(), { x: 1e6, y: 0 }, 1);
    expect(Math.hypot(huge.vel.x, huge.vel.y)).toBeCloseTo(MAX_THROW_SPEED, 6);
  });

  it('işaretçi hızı son pencereden; tek örnekte 0', () => {
    expect(pointerVelocity([{ t: 0, x: 0, y: 0 }])).toEqual({ x: 0, y: 0 });
    const v = pointerVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 500, x: 0, y: 0 },
      { t: 550, x: 50, y: -25 },
      { t: 600, x: 100, y: -50 },
    ]);
    expect(v.x).toBeCloseTo(1000, 6);
    expect(v.y).toBeCloseTo(-500, 6);
  });

  it('sürükleme dönüşü, paralaks, yaklaşma ve düzlem sınırları', () => {
    const r = dragRotation(10, -5);
    expect(r.y).toBeGreaterThan(0);
    expect(r.x).toBeLessThan(0);
    expect(parallaxTarget(null, 0, 1)).toEqual({ x: 0, y: 0 });
    expect(parallaxTarget(2, -1, 0.5)).toEqual({ x: 0.5, y: 0.3 });
    expect(approach(0, 1, 3, 0)).toBe(0);
    expect(approach(0, 1, 3, 1 / 60)).toBeGreaterThan(0);
    const b = planeBounds(90, 2, 2);
    expect(b.halfH).toBeCloseTo(2, 6);
    expect(b.halfW).toBeCloseTo(4, 6);
  });

  it('logo seçimi: sabitlenen önce, tekrarsız, havuzdan, istenen sayıda', () => {
    const pool = [1, 2, 3, 4, 5, 600];
    let seed = 0.37;
    const rand = () => (seed = (seed * 9301 + 49297) % 233280 / 233280);
    const ids = pickLogoIds(pool, 4, [600, 999], rand);
    expect(ids[0]).toBe(600);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(pool).toContain(id);
    expect(pickLogoIds(pool, 20, [])).toHaveLength(6);
  });
});

import { GOAL_RESET_SEC, goalLayout, mix, mixColor, stepInNet, stepPlay, type GoalSpec, type PlayEvent } from './stageMotion';

describe('kaleler', () => {
  const b = { halfW: 3, halfH: 2.3 };
  const r = 0.6;
  const [left, right] = goalLayout(b, r, [-1, 1]) as [GoalSpec, GoalSpec];
  const play = (m: BallMotion, seconds: number) => {
    let s = m;
    const events: PlayEvent[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      const out = stepPlay(s, 1 / 60, b, r, [left, right]);
      s = out.motion;
      if (out.event) events.push(out.event);
      if (out.event?.type === 'goal') break;
    }
    return { m: s, events };
  };

  it('yerleşim: zeminde, kenarda, ağız merkeze dönük; top üst direğin altından rahat geçer', () => {
    expect(right.side).toBe(1);
    expect(left.lineX).toBeCloseTo(-right.lineX, 9);
    expect(right.backX).toBeGreaterThan(right.lineX);
    expect(right.backX).toBeLessThanOrEqual(b.halfW);
    expect(right.floorY).toBe(-b.halfH);
    expect(right.crossY - right.floorY).toBeGreaterThanOrEqual(2 * r * 1.2);
    expect(right.backX - right.lineX).toBeGreaterThan(r);
    expect(goalLayout(b, r, [1])).toHaveLength(1);
  });

  it('alçak ve hızlı atış kaleye girer (gol, doğru taraf)', () => {
    const start: BallMotion = { pos: { x: 0, y: -b.halfH + r + 0.05 }, vel: { x: 13, y: 0 }, spin: { x: 0, y: 0 } };
    const { events } = play(start, 2);
    expect(events.at(-1)).toEqual({ type: 'goal', side: 1 });
    const toLeft = play({ ...start, vel: { x: -13, y: 0 } }, 2);
    expect(toLeft.events.at(-1)).toEqual({ type: 'goal', side: -1 });
  });

  it('üst direğe çarpan top seker (gol yok, geri döner)', () => {
    const start: BallMotion = { pos: { x: 0, y: right.crossY }, vel: { x: 12, y: 0 }, spin: { x: 0, y: 0 } };
    let s = start;
    let bar = false;
    let goal = false;
    for (let i = 0; i < 60; i++) {
      const out = stepPlay(s, 1 / 60, b, r, [right]);
      s = out.motion;
      if (out.event?.type === 'bar') bar = true;
      if (out.event?.type === 'goal') goal = true;
    }
    expect(bar).toBe(true);
    expect(goal).toBe(false);
    expect(s.pos.x).toBeLessThan(right.lineX);
  });

  it('kale üstünden geçen top kenardan seker (gol yok); file çatısına düşen seker', () => {
    const high: BallMotion = { pos: { x: 0, y: b.halfH - r }, vel: { x: 13, y: 0 }, spin: { x: 0, y: 0 } };
    const { events, m } = play(high, 0.8);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(m.vel.x).toBeLessThan(0.01);
    // Çatının üstüne düşen top (file topun çapından derin olsun diye geniş sahne; dar sahnede çatı = üst direk)
    const wide = { halfW: 6, halfH: 2.3 };
    const [g] = goalLayout(wide, r, [1]) as [GoalSpec];
    const x = g.lineX + 0.55;
    const out = stepPlay({ pos: { x, y: g.crossY + r + 0.01 }, vel: { x: 0, y: -6 }, spin: { x: 0, y: 0 } }, 1 / 60, wide, r, [g]);
    expect(out.event).toBeNull();
    expect(out.motion.pos.y).toBeCloseTo(g.crossY + r, 6);
    expect(out.motion.vel.y).toBeGreaterThan(0);
  });

  it('filede: dışarı çıkmaz, arkaya çarpınca az seker (dalga için çarpma hızı), sönümlenir', () => {
    let s: BallMotion = { pos: { x: right.lineX + 0.1, y: -1.5 }, vel: { x: 8, y: 0 }, spin: { x: 0, y: 3 } };
    let hit = 0;
    for (let t = 0; t < GOAL_RESET_SEC; t += 1 / 60) {
      const out = stepInNet(s, 1 / 60, right, r);
      s = out.motion;
      hit = Math.max(hit, out.netHit);
      expect(s.pos.x).toBeLessThanOrEqual(right.backX - r + 1e-9);
      expect(s.pos.x).toBeGreaterThanOrEqual(right.lineX - 1e-9);
      expect(s.pos.y).toBeLessThanOrEqual(right.crossY - r + 1e-9);
    }
    expect(hit).toBeGreaterThan(1);
    expect(Math.hypot(s.vel.x, s.vel.y)).toBeLessThan(1);
  });
});

describe('tema renk geçişi', () => {
  it('uçlarda kendi rengi, ortada kanal kanal ara değer; sınır dışı kırpılır', () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0x000000, 0xff8040, 0.5)).toBe(0x804020);
    expect(mixColor(0x102030, 0x405060, 2)).toBe(0x405060);
    expect(mix(1, 3, 0.25)).toBe(1.5);
    expect(mix(1, 3, -1)).toBe(1);
  });
});

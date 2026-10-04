import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS as R,
  DEFAULT_GOAL,
  CEILING,
  GOAL_RESET_SEC,
  MAX_PULL,
  SHOT_SPEED,
  approach,
  arenaFor,
  canShoot,
  goalSpecs,
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
  type GoalSpec,
  type StepEvent,
  type Walls,
} from './stageMotion';

const DT = 1 / 60;
const simulate = (b: Ball, seconds: number, goals: GoalSpec[] = [], walls: Walls | null = null) => {
  let s = b;
  const events: StepEvent[] = [];
  const heights: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const out = stepBall(s, DT, goals, R, walls);
    s = out.ball;
    events.push(...out.events);
    heights.push(s.pos.y);
  }
  return { ball: s, events, heights };
};
const throwFrom = (x: number, z: number, vel: { x: number; y: number; z: number }): Ball => ({
  ...restingBall(x, z),
  vel,
});

describe('top fiziği', () => {
  it('fırlatılan top yay çizer, azalan sekmelerle zıplar, yuvarlanıp durur ve OLDUĞU YERDE kalır', () => {
    const { ball, heights } = simulate(throwFrom(0, 0, { x: 4, y: 6, z: -2 }), 12);
    // Tepe noktaları (yerel maksimumlar) giderek alçalır
    const peaks = heights.filter((h, i) => i > 0 && i < heights.length - 1 && h > heights[i - 1]! && h >= heights[i + 1]! && h > R + 0.01);
    expect(peaks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
    // Sonunda zeminde, durmuş, başladığı yerden uzakta (merkeze dönmez)
    expect(ball.pos.y).toBeCloseTo(R, 6);
    expect(Math.hypot(ball.vel.x, ball.vel.y, ball.vel.z)).toBe(0);
    expect(ball.pos.x).toBeGreaterThan(3);
    expect(ball.pos.z).toBeLessThan(-1);
  });

  it('yuvarlanırken açısal hız hıza uygun (ω = v / r, eksen yukarı × v)', () => {
    const { ball } = simulate(throwFrom(0, 0, { x: 3, y: 0, z: 0 }), 0.3);
    expect(ball.vel.x).toBeGreaterThan(0);
    expect(ball.spin.z).toBeCloseTo(-ball.vel.x / R, 6);
    expect(ball.spin.x).toBeCloseTo(0, 6);
    expect(rollingSpin(0, 2)).toEqual({ x: 2 / R, y: 0, z: -0 });
  });

  it('gölge: yükseldikçe büyür ve silikleşir', () => {
    const low = shadowFor(0);
    const high = shadowFor(2);
    expect(high.scale).toBeGreaterThan(low.scale);
    expect(high.opacity).toBeLessThan(low.opacity);
  });
});

describe('kaleler ve gol', () => {
  const [left, right] = goalSpecs([-1, 1]) as [GoalSpec, GoalSpec];

  it('yerleşim: iki uçta simetrik, ağız merkeze dönük, kale topa göre büyük', () => {
    expect(left.lineX).toBe(-right.lineX);
    expect(right.backX).toBeGreaterThan(right.lineX);
    expect(left.backX).toBeLessThan(left.lineX);
    expect((2 * right.halfW) / (2 * R)).toBeGreaterThanOrEqual(3.5);
    expect(right.height / (2 * R)).toBeGreaterThanOrEqual(1.5);
    // File topun çapından derin: top çizgiyi tamamen geçip içeride kalabilsin
    expect(right.backX - right.lineX).toBeGreaterThan(2 * R);
    expect(goalSpecs([1])).toHaveLength(1);
  });

  it('normal bir fırlatma kaleye ulaşır: direklerin arası, üst direğin altı → gol; top filede kalır', () => {
    // Güçlü şut (%80): file arkasına çarpar, sekip dışarı yuvarlanmaz
    const hard = simulate({ ...restingBall(0, 0), vel: shotFromPull(-MAX_PULL * 0.8, 0.3)!.vel }, GOAL_RESET_SEC + 0.3, [left, right]);
    expect(hard.events.some((e) => e.type === 'goal')).toBe(true);
    expect(hard.ball.pos.x).toBeGreaterThan(right.lineX + R);
    const { events, ball } = simulate(throwFrom(0, 0, { x: 9, y: 3, z: 0.4 }), GOAL_RESET_SEC + 1, [left, right]);
    expect(events.find((e) => e.type === 'goal')).toEqual({ type: 'goal', side: 1 });
    expect(ball.pos.x).toBeGreaterThan(right.lineX);
    expect(ball.pos.x).toBeLessThanOrEqual(right.backX - R + 1e-6);
    expect(Math.abs(ball.pos.z)).toBeLessThan(right.halfW);
    const toLeft = simulate(throwFrom(0, 0, { x: -9, y: 3, z: -0.4 }), 2, [left, right]);
    expect(toLeft.events.find((e) => e.type === 'goal')).toEqual({ type: 'goal', side: -1 });
  });

  it('direğe çarpan top seker (gol yok, geri döner)', () => {
    const { events, ball } = simulate(throwFrom(right.lineX - 2, right.halfW, { x: 8, y: 0, z: 0 }), 1, [right]);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(ball.pos.x).toBeLessThan(right.lineX);
  });

  it('üst direğe çarpan top seker (gol yok)', () => {
    const b: Ball = { pos: { x: right.lineX - 0.6, y: right.height, z: 0 }, vel: { x: 10, y: 0.4, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
    const { events } = simulate(b, 0.6, [right]);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
  });

  it('üst direğin üstünden geçen top gol değildir; file çatısından / arkasından içeri girmez', () => {
    const over = simulate(throwFrom(0, 0, { x: 9, y: 9, z: 0 }), 3, [right]);
    expect(over.events.some((e) => e.type === 'goal')).toBe(false);
    // Kalenin yanından file yan duvarına çarpan top dışarıda kalır
    const side = simulate(throwFrom(right.lineX + 0.5, right.halfW + 1.2, { x: 0, y: 0, z: -6 }), 1, [right]);
    expect(side.events.some((e) => e.type === 'goal')).toBe(false);
    expect(side.ball.pos.z).toBeGreaterThanOrEqual(right.halfW + R - 1e-6);
  });

  it('file arkasına çarpan top dalga için çarpma olayı verir ve az seker', () => {
    const b: Ball = { pos: { x: right.lineX + 0.5, y: R, z: 0 }, vel: { x: 6, y: 0, z: 0 }, spin: { x: 0, y: 0, z: 0 } };
    const { events, ball } = simulate(b, 0.5, [right]);
    const net = events.find((e) => e.type === 'net');
    expect(net && net.type === 'net' && net.speed).toBeGreaterThan(1);
    expect(ball.vel.x).toBeLessThanOrEqual(0);
  });
});

describe('panolar (görünmez duvar)', () => {
  const desk = arenaFor(false);
  const mobile = arenaFor(true);

  it('arena: masaüstünde iki kale panoların içinde; mobilde tek kale, sol pano orta çizginin gerisinde', () => {
    expect(desk.goals.map((g) => g.side)).toEqual([-1, 1]);
    for (const g of desk.goals) expect(Math.abs(g.backX)).toBeLessThan(desk.walls.maxX);
    expect(mobile.goals.map((g) => g.side)).toEqual([1]);
    expect(mobile.walls.minX).toBeLessThan(0);
    expect(mobile.walls.minX).toBeGreaterThan(-4);
  });

  it('hangi yöne ne güçte şutlanırsa şutlansın top panoların içinde ve tavanın altında kalır, seker', () => {
    const w = desk.walls;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      let s: Ball = { ...restingBall(0, 0), vel: { x: Math.cos(ang) * 16, y: 9, z: Math.sin(ang) * 16 } };
      for (let i = 0; i < 240; i++) {
        s = stepBall(s, DT, desk.goals, R, w).ball;
        expect(s.pos.x - R).toBeGreaterThanOrEqual(w.minX - 1e-6);
        expect(s.pos.x + R).toBeLessThanOrEqual(w.maxX + 1e-6);
        expect(s.pos.z - R).toBeGreaterThanOrEqual(w.minZ - 1e-6);
        expect(s.pos.z + R).toBeLessThanOrEqual(w.maxZ + 1e-6);
        expect(s.pos.y + R).toBeLessThanOrEqual(CEILING + 1e-6);
      }
    }
    // Panoya doğru yuvarlanan top geri seker
    const { ball } = simulate({ ...restingBall(0, 0), vel: { x: 0, y: 0, z: 9 } }, 0.8, [], w);
    expect(ball.vel.z).toBeLessThan(0);
  });
});

describe('şut ve yardımcılar', () => {
  it('geri çek → ters yöne şut; güç çekme mesafesiyle (üst sınırlı); çok kısa çekme iptal', () => {
    expect(shotFromPull(0.05, 0)).toBeNull();
    const half = shotFromPull(-MAX_PULL / 2, 0)!;
    expect(half.dirX).toBeCloseTo(1, 9);
    expect(half.power).toBeCloseTo(0.5, 9);
    expect(half.vel.x).toBeCloseTo((SHOT_SPEED.min + SHOT_SPEED.max) / 2, 9);
    expect(half.vel.y).toBeGreaterThan(0);
    const full = shotFromPull(0, MAX_PULL * 3)!;
    expect(full.power).toBe(1);
    expect(full.dirZ).toBeCloseTo(-1, 9);
    expect(full.vel.z).toBeCloseTo(-SHOT_SPEED.max, 9);
  });

  it('orta noktadan orta güçte şut kaleye ulaşır (gol)', () => {
    const shot = shotFromPull(-MAX_PULL * 0.6, 0)!;
    const { events } = simulate({ ...restingBall(0, 0), vel: shot.vel }, 2, arenaFor(false).goals, arenaFor(false).walls);
    expect(events.find((e) => e.type === 'goal')).toEqual({ type: 'goal', side: 1 });
  });

  it('yalnız yerde duran / çok yavaş top şutlanır', () => {
    expect(canShoot(restingBall(0, 0))).toBe(true);
    expect(canShoot({ ...restingBall(0, 0), vel: { x: 0.3, y: 0, z: 0 } })).toBe(true);
    expect(canShoot({ ...restingBall(0, 0), vel: { x: 3, y: 0, z: 0 } })).toBe(false);
    expect(canShoot({ ...restingBall(0, 0), pos: { x: 0, y: 1.5, z: 0 } })).toBe(false);
  });

  it('paralaks, yaklaşma, logo seçimi, renk karışımı', () => {
    expect(parallaxTarget(null, 0, 1)).toEqual({ x: 0, y: 0 });
    expect(parallaxTarget(2, -1, 0.5)).toEqual({ x: 0.5, y: 0.3 });
    expect(approach(0, 1, 3, 0)).toBe(0);
    expect(approach(0, 1, 3, DT)).toBeGreaterThan(0);
    let seed = 0.37;
    const rand = () => (seed = ((seed * 9301 + 49297) % 233280) / 233280);
    const ids = pickLogoIds([1, 2, 3, 4, 5, 600], 4, [600, 999], rand);
    expect(ids[0]).toBe(600);
    expect(new Set(ids).size).toBe(4);
    expect(mixColor(0x000000, 0xff8040, 0.5)).toBe(0x804020);
    expect(mixColor(0x102030, 0x405060, 2)).toBe(0x405060);
    expect(mix(1, 3, 0.25)).toBe(1.5);
    expect(DEFAULT_GOAL.lineX).toBeGreaterThan(0);
  });
});

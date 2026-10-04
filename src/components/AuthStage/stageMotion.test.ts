import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS as R,
  DEFAULT_GOAL,
  GOAL_RESET_SEC,
  MAX_LOFT,
  MAX_THROW_SPEED,
  approach,
  goalSpecs,
  mix,
  mixColor,
  offscreenTime,
  parallaxTarget,
  pickLogoIds,
  restingBall,
  rollingSpin,
  shadowFor,
  stepBall,
  throwVelocity,
  type Ball,
  type GoalSpec,
  type StepEvent,
} from './stageMotion';

const DT = 1 / 60;
const simulate = (b: Ball, seconds: number, goals: GoalSpec[] = []) => {
  let s = b;
  const events: StepEvent[] = [];
  const heights: number[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const out = stepBall(s, DT, goals);
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
    expect((2 * right.halfW) / (2 * R)).toBeGreaterThanOrEqual(6);
    expect(right.height / (2 * R)).toBeGreaterThanOrEqual(2.2);
    expect(goalSpecs([1])).toHaveLength(1);
  });

  it('normal bir fırlatma kaleye ulaşır: direklerin arası, üst direğin altı → gol; top filede kalır', () => {
    // Güçlü, havadan atış: file arkasına çarpar, sekip dışarı yuvarlanmaz
    const hard = simulate({ ...throwFrom(0.4, 0.5, { x: 15, y: 3.9, z: -1 }), pos: { x: 0.4, y: R + 0.4, z: 0.5 } }, GOAL_RESET_SEC + 0.3, [left, right]);
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

describe('fırlatma ve yardımcılar', () => {
  it('yön ve güç sürükleme hareketinden; hızlıda yay, yavaşta bırakma; hız sınırlı', () => {
    const slow = throwVelocity([
      { t: 0, x: 0, z: 0 },
      { t: 100, x: 0.05, z: 0 },
    ]);
    expect(slow).toEqual({ x: 0, y: 0, z: 0 });
    const v = throwVelocity([
      { t: 0, x: 0, z: 0 },
      { t: 500, x: 0, z: 0 },
      { t: 550, x: 0.3, z: -0.1 },
      { t: 600, x: 0.6, z: -0.2 },
    ]);
    expect(v.x).toBeCloseTo(6, 6);
    expect(v.z).toBeCloseTo(-2, 6);
    expect(v.y).toBeGreaterThan(0);
    const huge = throwVelocity([
      { t: 0, x: 0, z: 0 },
      { t: 10, x: 50, z: 0 },
    ]);
    expect(Math.hypot(huge.x, huge.z)).toBeCloseTo(MAX_THROW_SPEED, 6);
    expect(huge.y).toBeLessThanOrEqual(MAX_LOFT);
  });

  it('ekran dışı süresi: görünürken sıfır, değilken birikir', () => {
    expect(offscreenTime(3, true, 1)).toBe(0);
    expect(offscreenTime(3, false, 0.5)).toBe(3.5);
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

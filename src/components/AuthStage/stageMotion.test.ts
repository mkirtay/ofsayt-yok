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

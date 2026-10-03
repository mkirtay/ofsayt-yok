import { describe, expect, it } from 'vitest';
import {
  MAX_SPEED,
  clampToPitch,
  idleNudge,
  pitchCenter,
  pitchGeometry,
  pitchShapes,
  releaseVelocity,
  stepBall,
  type Ball,
} from './pitchPhysics';

const run = (ball: Ball, secs: number, g = pitchGeometry(1200, 700)) => {
  let b = ball;
  for (let t = 0; t < secs; t += 1 / 60) {
    const r = stepBall(b, 1 / 60, g);
    b = r.ball;
    if (r.goal) return { ball: b, goal: r.goal };
  }
  return { ball: b, goal: null };
};

describe('saha geometrisi', () => {
  it('geniş kap yatay, dar kap dikey; saha kenar paylı', () => {
    const land = pitchGeometry(1200, 700);
    expect(land.orientation).toBe('landscape');
    expect(land.x0).toBeGreaterThan(0);
    expect(land.x1).toBeLessThan(1200);
    expect(pitchGeometry(375, 700).orientation).toBe('portrait');
  });

  it('çizgiler: dış çizgi + orta çizgi + orta yuvarlak + 2 × (ceza, kale alanı, penaltı noktası, kale) + orta nokta', () => {
    const shapes = pitchShapes(pitchGeometry(1200, 700));
    expect(shapes).toHaveLength(1 + 1 + 2 + 2 * 4);
    // Kaleler sahanın dışında (yatay: sol / sağ)
    const g = pitchGeometry(1200, 700);
    const goals = shapes.filter((s) => s.kind === 'rect' && s.goal);
    expect(goals.map((s) => (s as { x: number }).x)).toEqual([g.x0 - g.goalDepth, g.x1]);
    // Dikeyde kaleler üstte / altta
    const p = pitchGeometry(375, 700);
    const pg = pitchShapes(p).filter((s) => s.kind === 'rect' && s.goal);
    expect(pg.map((s) => (s as { y: number }).y)).toEqual([p.y0 - p.goalDepth, p.y1]);
  });
});

describe('top fiziği', () => {
  it('sürtünmeyle yavaşlar ve durur; durmuş top hareket etmez', () => {
    const g = pitchGeometry(1200, 700);
    const c = pitchCenter(g);
    const r = run({ x: c.x, y: c.y, vx: 0, vy: 150 }, 0.2, g);
    expect(r.ball.vy).toBeLessThan(150);
    const rest = run({ x: c.x, y: c.y, vx: 0, vy: 0 }, 1, g).ball;
    expect([rest.x, rest.y]).toEqual([c.x, c.y]);
  });

  it('yan çizgiden seker (yön döner, enerji kaybı), saha dışına çıkmaz', () => {
    const g = pitchGeometry(1200, 700);
    const start: Ball = { x: 600, y: g.y1 - g.ballRadius - 1, vx: 0, vy: 400 };
    const b = stepBall(start, 1 / 60, g).ball;
    expect(b.vy).toBeLessThan(0);
    expect(Math.abs(b.vy)).toBeLessThan(400);
    expect(b.y + g.ballRadius).toBeLessThanOrEqual(g.y1);
  });

  it('kale ağzından geçen top gol (yatay: sağ = end); ağız dışında kale çizgisinden seker', () => {
    const g = pitchGeometry(1200, 700);
    const c = pitchCenter(g);
    expect(run({ x: c.x, y: c.y, vx: 2000, vy: 0 }, 3, g).goal).toBe('end');
    expect(run({ x: c.x, y: c.y, vx: -2000, vy: 0 }, 3, g).goal).toBe('start');
    const wide = run({ x: c.x, y: g.y0 + g.ballRadius + 2, vx: 2000, vy: 0 }, 0.6, g);
    expect(wide.goal).toBeNull();
    expect(wide.ball.vx).toBeLessThan(0);
  });

  it('dikey sahada kaleler üst / alt', () => {
    const g = pitchGeometry(375, 700);
    const c = pitchCenter(g);
    expect(run({ x: c.x, y: c.y, vx: 0, vy: -2000 }, 3, g).goal).toBe('start');
    expect(run({ x: c.x, y: c.y, vx: 0, vy: 2000 }, 3, g).goal).toBe('end');
  });

  it('sürüklenen top saha içinde tutulur', () => {
    const g = pitchGeometry(1200, 700);
    expect(clampToPitch(-50, 9999, g)).toEqual({ x: g.x0 + g.ballRadius, y: g.y1 - g.ballRadius });
  });
});

describe('bırakma hızı ve boşta itiş', () => {
  it('son ~90 ms\'lik harekete göre; azami hızla sınırlı; tek örnek → 0', () => {
    expect(releaseVelocity([{ t: 0, x: 0, y: 0 }])).toEqual({ vx: 0, vy: 0 });
    const v = releaseVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 50, y: 0 },
      { t: 200, x: 100, y: 0 },
    ]);
    expect(v.vx).toBeCloseTo(500);
    const fast = releaseVelocity([
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 1000, y: 0 },
    ]);
    expect(Math.hypot(fast.vx, fast.vy)).toBeCloseTo(MAX_SPEED);
  });

  it('boşta itiş yavaş (70–130 px/sn)', () => {
    for (const r of [0, 0.5, 0.99]) {
      const v = idleNudge(() => r);
      const s = Math.hypot(v.vx, v.vy);
      expect(s).toBeGreaterThanOrEqual(70);
      expect(s).toBeLessThanOrEqual(130);
    }
  });
});

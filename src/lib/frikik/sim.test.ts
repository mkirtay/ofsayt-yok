import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BALL_R,
  FIGURE,
  GOAL,
  MAX_SERIES_SCORE,
  MAX_SHOT_TICKS,
  POINTS,
  SHOT_SPEED,
  WALL_DISTANCE,
  keeperZ,
  makeRound,
  parseShotInput,
  scoreSeries,
  shotParams,
  simulateShot,
  startShot,
  stepShot,
  type ShotInput,
  type ShotResult,
} from './sim';

const SEED = 42;
const round0 = makeRound(SEED, 0);

/**
 * Test kaydırması (kale düzlemi, cm): toptan (kalenin 8 m "altı") hedefe 16 nokta; `bulge` > 0 yolu sağa bombeler
 * (kiriş uzunluğunun oranı). İstemcinin ürettiği biçimle aynı.
 */
function swipe(targetZ: number, targetY: number, ms: number, bulge = 0, tick = 0): ShotInput {
  const sz = 0;
  const sy = -800;
  const cz = targetZ * 100 - sz;
  const cy = targetY * 100 - sy;
  const len = Math.hypot(cz, cy);
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) {
    const u = i / 15;
    const off = bulge * len * Math.sin(Math.PI * u);
    pts.push([Math.round(sz + cz * u + (cy / len) * off), Math.round(sy + cy * u - (cz / len) * off)]);
  }
  return { tick, ms, pts };
}

/** Küçük ızgarada koşulu sağlayan ilk vuruş (belirlenimci arama). */
function find(pred: (r: ShotResult) => boolean): { input: ShotInput; result: ShotResult } {
  for (const tick of [0, 90, 180])
    for (let z = -3.4; z <= 3.41; z += 0.4)
      for (const y of [0.4, 1.2, 1.9, 2.05, 2.15])
        for (const ms of [140, 200, 280, 400])
          for (const bulge of [0, 0.15, -0.15, 0.3, -0.3]) {
            const input = swipe(z, y, ms, bulge, tick);
            const result = simulateShot(round0, input);
            if (pred(result)) return { input, result };
          }
  throw new Error('ızgarada bulunamadı');
}

describe('belirlenimcilik', () => {
  it('simülasyon kaynaklarında motorlar arası fark yaratabilecek işlev yok', () => {
    for (const f of ['src/lib/frikik/sim.ts', 'src/lib/pitchPhysics/core.ts']) {
      const src = readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|atan2?|asin|acos|exp|pow|log\w*|hypot|cbrt|random)\b/);
      expect(src, f).not.toMatch(/\bDate\b|performance\./);
    }
  });

  it('aynı tohum → aynı turlar; farklı tohum → farklı; aynı girdi → aynı sonuç', () => {
    expect(makeRound(SEED, 3)).toEqual(makeRound(SEED, 3));
    expect(makeRound(SEED, 3)).not.toEqual(makeRound(SEED + 1, 3));
    expect(makeRound(SEED, 3)).not.toEqual(makeRound(SEED, 4));
    const input = swipe(2.1, 1.7, 210, 0.12, 77);
    expect(simulateShot(round0, input)).toEqual(simulateShot(round0, input));
    // JSON'dan geçen girdi (sunucuya gidiş) aynı sonucu verir
    expect(simulateShot(round0, parseShotInput(JSON.parse(JSON.stringify(input)))!)).toEqual(simulateShot(round0, input));
  });

  it('sabit seri: skor değişmez (fizik değişirse bu test bilerek kırılır → sunucu / istemci birlikte güncellenir)', () => {
    const inputs = [swipe(3.1, 2.0, 160, 0.2, 120), swipe(-2.5, 1.2, 220, -0.1, 40), swipe(0, 1.0, 300), swipe(2.8, 0.5, 150, 0, 300), swipe(-3.2, 2.1, 180, 0.25, 10)];
    expect(scoreSeries(SEED, inputs)).toMatchInlineSnapshot(`
      {
        "shots": [
          {
            "corner": true,
            "kind": "goal",
            "points": 200,
            "viaPost": false,
          },
          {
            "corner": false,
            "kind": "goal",
            "points": 150,
            "viaPost": true,
          },
          {
            "corner": false,
            "kind": "wall",
            "points": 0,
            "viaPost": false,
          },
          {
            "corner": false,
            "kind": "saved",
            "points": 0,
            "viaPost": false,
          },
          {
            "corner": false,
            "kind": "saved",
            "points": 0,
            "viaPost": false,
          },
        ],
        "total": 350,
      }
    `);
  });
});

describe('tur üretimi', () => {
  it('mesafe 16–24 m, açı sınırlı, 3–5 kişilik baraj top ile kale arasında 9,15 m\'de, kaleci direklerin içinde', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (let i = 0; i < 5; i++) {
        const r = makeRound(seed, i);
        const dist = -r.ball.x;
        expect(dist).toBeGreaterThanOrEqual(16);
        expect(dist).toBeLessThanOrEqual(24);
        expect(Math.abs(r.ball.z)).toBeLessThanOrEqual(dist * 0.45);
        expect(r.wall.length).toBeGreaterThanOrEqual(3);
        expect(r.wall.length).toBeLessThanOrEqual(5);
        const last = r.wall[r.wall.length - 1]!;
        const cx = (r.wall[0]!.x + last.x) / 2;
        const cz = (r.wall[0]!.z + last.z) / 2;
        expect(Math.hypot(cx - r.ball.x, cz - r.ball.z)).toBeCloseTo(WALL_DISTANCE, 6);
        expect(cx).toBeGreaterThan(r.ball.x);
        expect(cx).toBeLessThan(0);
        expect(Math.hypot(r.wall[1]!.x - r.wall[0]!.x, r.wall[1]!.z - r.wall[0]!.z)).toBeCloseTo(FIGURE.spacing, 6);
        expect(r.keeper.amp).toBeLessThan(GOAL.halfW - 0.85);
        for (const t of [0, 1, 57, 999, 71999]) expect(Math.abs(keeperZ(r, t))).toBeLessThanOrEqual(r.keeper.amp + 1e-9);
        expect(keeperZ(r, 5)).toBe(keeperZ(r, 5 + r.keeper.period));
      }
    }
  });
});

describe('girdi doğrulama', () => {
  const ok = swipe(1, 1.5, 200);
  it('yalnız aralık içi tam sayılar; 12–20 nokta', () => {
    expect(parseShotInput(ok)).toEqual(ok);
    expect(parseShotInput({ ...ok, points: 999, score: 1250 })).toEqual(ok); // fazladan alan (ör. uydurma puan) yok sayılır
    const pts = ok.pts;
    for (const bad of [
      null,
      'x',
      [],
      { ...ok, tick: -1 },
      { ...ok, tick: 1e9 },
      { ...ok, ms: 29 },
      { ...ok, ms: 3001 },
      { ...ok, ms: 200.5 },
      { ...ok, ms: '200' },
      { ...ok, pts: pts.slice(0, 11) },
      { ...ok, pts: [...pts, ...pts] },
      { ...ok, pts: 'x' },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [p[0] + 0.5, p[1]] : p)) },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [p[0], 99999] : p)) },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [p[0]] : p)) },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [Number.NaN, p[1]] : p)) },
      { tick: 0, ms: 200 },
    ]) {
      expect(parseShotInput(bad), JSON.stringify(bad)?.slice(0, 60)).toBeNull();
    }
  });
});

describe('kaydırma → şut', () => {
  it('hız = güç (hızlı kaydırma daha sert); çok kısa / aşağı doğru kaydırma geçersiz', () => {
    const slow = shotParams(round0, swipe(0, 1.5, 600))!;
    const fast = shotParams(round0, swipe(0, 1.5, 140))!;
    expect(fast.power).toBeGreaterThan(slow.power);
    expect(Math.hypot(fast.vel.x, fast.vel.z)).toBeGreaterThan(Math.hypot(slow.vel.x, slow.vel.z));
    expect(Math.hypot(shotParams(round0, swipe(0, 1.5, 30))!.vel.x, shotParams(round0, swipe(0, 1.5, 30))!.vel.z)).toBeCloseTo(SHOT_SPEED.max, 6);
    // Yavaş şut aynı hedefe daha yüksek yay çizer
    expect(slow.vel.y).toBeGreaterThan(fast.vel.y * 0.9);
    const short: ShotInput = { tick: 0, ms: 200, pts: Array.from({ length: 16 }, (_, i) => [0, -800 + i * 5] as [number, number]) };
    expect(shotParams(round0, short)).toBeNull();
    const down: ShotInput = { tick: 0, ms: 200, pts: Array.from({ length: 16 }, (_, i) => [i * 40, -800 - i * 10] as [number, number]) };
    expect(shotParams(round0, down)).toBeNull();
    expect(simulateShot(round0, short)).toEqual({ kind: 'miss', points: 0, viaPost: false, corner: false });
  });

  it('eğrilik = falso: sağa bombeli yol → top sağdan çıkar, sola kıvrılır; düz yol falsosuz', () => {
    const straight = shotParams(round0, swipe(0, 1.5, 200))!;
    const right = shotParams(round0, swipe(0, 1.5, 200, 0.2))!;
    const left = shotParams(round0, swipe(0, 1.5, 200, -0.2))!;
    expect(straight.curve).toBe(0);
    expect(right.curve).toBeLessThan(0);
    expect(left.curve).toBeGreaterThan(0);
    expect(right.vel.z).toBeGreaterThan(straight.vel.z);
    expect(left.vel.z).toBeLessThan(straight.vel.z);
    expect(shotParams(round0, swipe(0, 1.5, 200, 0.9))!.curve).toBe(-1);
    expect(shotParams(round0, swipe(0, 1.5, 200, 0.02))!.curve).toBe(0); // ölü bölge
  });

  it('top hedef noktaya yönelir: barajsız / kalecisiz turda kale çizgisini hedefe yakın geçer (falsolu da)', () => {
    const open = { ...round0, wall: [], keeper: { amp: 0, period: 300, phase: 0 } };
    for (const [z, y, bulge] of [
      [2.5, 1.6, 0],
      [-3, 0.8, 0],
      [3.0, 1.9, 0.2],
      [-2.0, 1.4, -0.25],
    ] as const) {
      const far = { ...open, keeper: { amp: 0, period: 300, phase: 0 } };
      const st = startShot(far, swipe(z, y, 170, bulge));
      st.keeperTarget = st.keeperZ = 30; // kaleci sahnenin dışında
      while (st.pos.x < -0.05 && !st.result) stepShot(st);
      expect(Math.abs(st.pos.z - z), `z ${z}`).toBeLessThan(0.6);
      expect(Math.abs(st.pos.y - y), `y ${y}`).toBeLessThan(0.35);
    }
  });
});

describe('vuruş sonuçları ve puan', () => {
  it('gol 100; direkten gol +50; doksan +100; gol değilse 0', () => {
    expect(find((r) => r.kind === 'goal' && !r.viaPost && !r.corner).result.points).toBe(POINTS.goal);
    expect(find((r) => r.kind === 'goal' && r.corner && !r.viaPost).result.points).toBe(POINTS.goal + POINTS.corner);
    for (const kind of ['wall', 'saved'] as const) {
      const { result } = find((r) => r.kind === kind);
      expect(result).toEqual({ kind, points: 0, viaPost: false, corner: false });
    }
    // Direğe nişan: ya direkten döner (0) ya direkten gol (+50)
    let post = 0;
    let viaPost = 0;
    for (let z = 3.3; z <= 3.9; z += 0.02) {
      const st = startShot({ ...round0, wall: [] }, swipe(z, 1.0, 150));
      st.keeperTarget = st.keeperZ = -30;
      while (!st.result) stepShot(st);
      if (st.result.kind === 'post') post++;
      if (st.result.viaPost) {
        viaPost++;
        expect(st.result.points).toBe(POINTS.goal + POINTS.viaPost);
      }
    }
    expect(post).toBeGreaterThan(0);
    expect(viaPost).toBeGreaterThan(0);
    // Çok yukarı kaydırma: aut
    expect(simulateShot(round0, swipe(0, 4, 200))).toEqual({ kind: 'miss', points: 0, viaPost: false, corner: false });
  });

  it('kaleci şuta tepki verir: aynı köşeye yavaş şut kurtarılır, sert şut gol olur', () => {
    const noWall = { ...round0, wall: [], keeper: { amp: 0.0001, period: 300, phase: 0 } };
    expect(simulateShot(noWall, swipe(2.9, 1.0, 600)).kind).toBe('saved');
    expect(simulateShot(noWall, swipe(2.9, 1.0, 130)).kind).toBe('goal');
  });

  it('barajın ortasına alçak sert şut barajda kalır', () => {
    const mid = round0.wall[(round0.wall.length - 1) >> 1]!;
    // Topdan figüre giden doğrunun kale düzlemini kestiği nokta
    const zAtGoal = round0.ball.z + ((mid.z - round0.ball.z) * -round0.ball.x) / (mid.x - round0.ball.x);
    expect(simulateShot(round0, swipe(zAtGoal, 0.3, 130)).kind).toBe('wall');
  });

  it('karar verildikten sonraki adımlar sonucu değiştirmez; en uç girdiler de sonlanır', () => {
    const { input, result } = find((r) => r.kind === 'goal');
    const st = startShot(round0, input);
    while (!st.result) stepShot(st);
    const decidedAt = st.tick;
    for (let i = 0; i < 240; i++) stepShot(st);
    expect(st.result).toEqual(result);
    expect(decidedAt).toBeLessThanOrEqual(MAX_SHOT_TICKS);
    expect(st.pos.x).toBeGreaterThan(0); // top filede kalır
    expect(st.pos.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    for (const extreme of [swipe(50, 30, 30, 0.9), swipe(-50, -7, 3000, -0.9), swipe(0, 2, 30, 0, 72_000)]) {
      expect(['goal', 'saved', 'wall', 'post', 'miss']).toContain(simulateShot(round0, extreme).kind);
    }
  });

  it('seri skoru: yalnız ilk 5 vuruş, üst sınır 1250', () => {
    const { input } = find((r) => r.kind === 'goal');
    const s = scoreSeries(SEED, Array.from({ length: 9 }, () => input));
    expect(s.shots).toHaveLength(5);
    expect(s.total).toBe(s.shots.reduce((n, x) => n + x.points, 0));
    expect(s.total).toBeLessThanOrEqual(MAX_SERIES_SCORE);
    expect(MAX_SERIES_SCORE).toBe(1250);
    expect(scoreSeries(SEED, []).total).toBe(0);
  });
});

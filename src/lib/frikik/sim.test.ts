import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FIGURE,
  GOAL,
  MAX_SERIES_SCORE,
  MAX_SHOT_TICKS,
  POINTS,
  WALL_DISTANCE,
  aimToInput,
  keeperZ,
  makeRound,
  parseShotInput,
  scoreSeries,
  simulateShot,
  startShot,
  stepShot,
  type ShotInput,
  type ShotResult,
} from './sim';

const SEED = 42;
const round0 = makeRound(SEED, 0);

/** Küçük ızgarada koşulu sağlayan ilk vuruş (belirlenimci arama). */
function find(pred: (r: ShotResult) => boolean): { input: ShotInput; result: ShotResult } {
  for (let s = -900; s <= 900; s += 100)
    for (let power = 300; power <= 1000; power += 25)
      for (const curve of [0, -1000, 1000, -500, 500]) {
        const input: ShotInput = { f: 2000, s, power, curve, tick: 120 };
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
    const input: ShotInput = { f: 2000, s: 150, power: 700, curve: -400, tick: 77 };
    expect(simulateShot(round0, input)).toEqual(simulateShot(round0, input));
  });

  it('sabit seri: skor değişmez (fizik değişirse bu test bilerek kırılır → sunucu / istemci birlikte güncellenir)', () => {
    const inputs: ShotInput[] = [
      { f: 2000, s: 700, power: 725, curve: -1000, tick: 120 },
      { f: 2000, s: -200, power: 650, curve: 300, tick: 40 },
      { f: 2000, s: 0, power: 600, curve: 0, tick: 0 },
      { f: 2000, s: 300, power: 800, curve: -600, tick: 300 },
      { f: 2000, s: -500, power: 500, curve: 1000, tick: 10 },
    ];
    expect(scoreSeries(SEED, inputs)).toMatchInlineSnapshot(`
      {
        "shots": [
          {
            "corner": true,
            "kind": "goal",
            "points": 250,
            "viaPost": true,
          },
          {
            "corner": false,
            "kind": "goal",
            "points": 100,
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
            "kind": "post",
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
        const mid = r.wall[(r.wall.length - 1) >> 1]!;
        const last = r.wall[r.wall.length - 1]!;
        const cx = (r.wall[0]!.x + last.x) / 2;
        const cz = (r.wall[0]!.z + last.z) / 2;
        expect(Math.hypot(cx - r.ball.x, cz - r.ball.z)).toBeCloseTo(WALL_DISTANCE, 6);
        expect(mid.x).toBeGreaterThan(r.ball.x);
        expect(mid.x).toBeLessThan(0);
        expect(Math.hypot(r.wall[1]!.x - r.wall[0]!.x, r.wall[1]!.z - r.wall[0]!.z)).toBeCloseTo(FIGURE.spacing, 6);
        expect(r.keeper.amp).toBeLessThan(GOAL.halfW - 0.85);
        for (const t of [0, 1, 57, 999, 71999]) expect(Math.abs(keeperZ(r, t))).toBeLessThanOrEqual(r.keeper.amp + 1e-9);
        expect(keeperZ(r, 5)).toBe(keeperZ(r, 5 + r.keeper.period));
      }
    }
  });
});

describe('girdi doğrulama', () => {
  const ok = { f: 2000, s: -10, power: 500, curve: 0, tick: 3 };
  it('yalnız aralık içi tam sayılar', () => {
    expect(parseShotInput(ok)).toEqual(ok);
    expect(parseShotInput({ ...ok, extra: 'x', points: 999 })).toEqual(ok); // fazladan alan (ör. uydurma puan) yok sayılır
    for (const bad of [
      null,
      'x',
      [],
      { ...ok, f: 0 },
      { ...ok, f: 2000.5 },
      { ...ok, s: 4001 },
      { ...ok, power: 1001 },
      { ...ok, power: '500' },
      { ...ok, curve: -1001 },
      { ...ok, tick: -1 },
      { ...ok, tick: 1e9 },
      { ...ok, power: Number.NaN },
      { f: 2000, s: 0, power: 500, curve: 0 },
    ]) {
      expect(parseShotInput(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('nişan → girdi: aşağı çekilmemiş / çok kısa çekme yok; sağa çekmek sola nişan; yana kaydırma falso (ölü bölgeli)', () => {
    expect(aimToInput(0, -40, 0, 150, 0)).toBeNull();
    expect(aimToInput(0, 8, 0, 150, 0)).toBeNull();
    const a = aimToInput(30, 90, 0, 150, 12.7)!;
    expect(a.s).toBeLessThan(0);
    expect(a.f).toBeGreaterThan(0);
    expect(a.curve).toBe(0);
    expect(a.tick).toBe(12);
    expect(a.power).toBe(Math.round((Math.hypot(30, 90) / 150) * 1000));
    for (const v of Object.values(a)) expect(Number.isInteger(v)).toBe(true);
    expect(aimToInput(0, 90, 5, 150, 0)!.curve).toBe(0);
    expect(aimToInput(0, 90, 41, 150, 0)!.curve).toBe(500);
    expect(aimToInput(0, 90, -500, 150, 0)!.curve).toBe(-1000);
    expect(aimToInput(0, 900, 0, 150, 0)!.power).toBe(1000);
    expect(parseShotInput(a)).toEqual(a);
  });
});

describe('vuruş sonuçları ve puan', () => {
  it('gol 100; direkten gol +50; doksan +100; gol değilse 0', () => {
    expect(find((r) => r.kind === 'goal' && !r.viaPost && !r.corner).result.points).toBe(POINTS.goal);
    expect(find((r) => r.kind === 'goal' && r.viaPost && !r.corner).result.points).toBe(POINTS.goal + POINTS.viaPost);
    expect(find((r) => r.kind === 'goal' && r.corner && !r.viaPost).result.points).toBe(POINTS.goal + POINTS.corner);
    for (const kind of ['wall', 'saved', 'post', 'miss'] as const) {
      const { result } = find((r) => r.kind === kind);
      expect(result).toEqual({ kind, points: 0, viaPost: false, corner: false });
    }
  });

  it('barajın ortasına nişan alınan alçak şut barajda kalır', () => {
    // Barajın ortasına nişan: (figür − top) yönünün ileri / sağ bileşenleri
    const fig = round0.wall[(round0.wall.length - 1) >> 1]!;
    const dx = fig.x - round0.ball.x;
    const dz = fig.z - round0.ball.z;
    const d = Math.hypot(round0.ball.x, round0.ball.z);
    const fx = -round0.ball.x / d;
    const fz = -round0.ball.z / d;
    const f = Math.round((dx * fx + dz * fz) * 100);
    const s = Math.round((dx * -fz + dz * fx) * 100);
    expect(simulateShot(round0, { f, s, power: 450, curve: 0, tick: 0 }).kind).toBe('wall');
  });

  it('karar verildikten sonraki adımlar sonucu değiştirmez; en uç girdiler de sonlanır', () => {
    const { input, result } = find((r) => r.kind === 'goal');
    const st = startShot(round0, input);
    while (!st.result) stepShot(st);
    const decidedAt = st.tick;
    for (let i = 0; i < 240; i++) stepShot(st);
    expect(st.result).toEqual(result);
    expect(decidedAt).toBeLessThanOrEqual(MAX_SHOT_TICKS);
    // Gol sonrası top filede kalır (dışarı yuvarlanmaz)
    expect(st.pos.x).toBeGreaterThan(0);
    for (const extreme of [
      { f: 1, s: 4000, power: 1000, curve: 1000, tick: 72_000 },
      { f: 1, s: -4000, power: 0, curve: -1000, tick: 0 },
      { f: 4000, s: 0, power: 1000, curve: 0, tick: 1 },
    ]) {
      const r = simulateShot(round0, extreme);
      expect(['goal', 'saved', 'wall', 'post', 'miss']).toContain(r.kind);
    }
  });

  it('seri skoru: yalnız ilk 5 vuruş, üst sınır 1250', () => {
    const { input } = find((r) => r.kind === 'goal');
    const many = Array.from({ length: 9 }, () => input);
    const s = scoreSeries(SEED, many);
    expect(s.shots).toHaveLength(5);
    expect(s.total).toBe(s.shots.reduce((n, x) => n + x.points, 0));
    expect(s.total).toBeLessThanOrEqual(MAX_SERIES_SCORE);
    expect(MAX_SERIES_SCORE).toBe(1250);
    expect(scoreSeries(SEED, []).total).toBe(0);
  });
});

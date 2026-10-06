import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BALL_R,
  FIGURE,
  GOAL,
  MAX_SERIES_SCORE,
  KEEPER_LEVELS,
  MAX_SHOT_TICKS,
  POINTS,
  POWER_ZONES,
  SHOT_SPEED,
  SCATTER,
  SWIPE_SPEED,
  WALL_DISTANCE,
  keeperZ,
  makeRound,
  parseShotInput,
  rng,
  scatterAmplitude,
  scatterSeed,
  scoreSeries,
  shotParams,
  simulateShot,
  startShot,
  stepShot,
  swipeShake,
  type Round,
  type ShotInput,
  type ShotResult,
} from './sim';

const SEED = 42;
const round0 = makeRound(SEED, 0);
/** Zor seviye (3. vuruş ve sonrası) kalecisi, barajsız, kaleci ortada sabit başlar. */
const openHard = { ...makeRound(SEED, 3), wall: [], keeper: { amp: 0.0001, period: 300, phase: 0, react: KEEPER_LEVELS[1].react, speed: KEEPER_LEVELS[1].speed } };
/** Güç (0–1) → o gücü veren etkin süre (ms). */
const msFor = (targetZ: number, targetY: number, power: number) =>
  Math.round(Math.hypot(targetZ * 100, targetY * 100 + 800) / (SWIPE_SPEED.min + (SWIPE_SPEED.max - SWIPE_SPEED.min) * power));

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
            "corner": false,
            "kind": "miss",
            "points": 0,
            "viaPost": false,
          },
          {
            "corner": false,
            "kind": "goal",
            "points": 100,
            "viaPost": false,
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
            "kind": "miss",
            "points": 0,
            "viaPost": false,
          },
        ],
        "total": 100,
      }
    `);
  });
});

describe('tur üretimi', () => {
  it('mesafe 16–24 m, açı sınırlı, 3–5 kişilik baraj top ile kale arasında 9,15 m\'de, kaleci direklerin içinde; ilk 2 tur kolay', () => {
    for (let seed = 1; seed <= 300; seed++) {
      for (let i = 0; i < 5; i++) {
        const r = makeRound(seed, i);
        const dist = -r.ball.x;
        expect(dist).toBeGreaterThanOrEqual(16);
        expect(dist).toBeLessThanOrEqual(24);
        expect(Math.abs(r.ball.z)).toBeLessThanOrEqual(dist * 0.45);
        expect(r.wall.length).toBeGreaterThanOrEqual(3);
        expect(r.wall.length).toBeLessThanOrEqual(5);
        // İlk 2 vuruş: 3 kişilik baraj, geç ve yavaş kaleci
        if (i < 2) expect(r.wall.length).toBe(3);
        expect([r.keeper.react, r.keeper.speed]).toEqual(i < 2 ? [KEEPER_LEVELS[0].react, KEEPER_LEVELS[0].speed] : [KEEPER_LEVELS[1].react, KEEPER_LEVELS[1].speed]);
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

  it('top hedef noktaya yönelir: barajsız turda kale çizgisini hedefe yakın geçer (falsolu da)', () => {
    for (const [z, y, bulge] of [
      [2.5, 1.6, 0],
      [-2.6, 0.8, 0],
      [2.8, 1.9, 0.12],
      [-2.0, 1.4, -0.14],
    ] as const) {
      const input = swipe(z, y, msFor(z, y, 0.7), bulge);
      const p = shotParams(openHard, input)!;
      const st = startShot(openHard, input);
      st.keeperTarget = st.keeperZ = 30; // kaleci sahnenin dışında
      while (st.pos.x < -0.05 && !st.result) stepShot(st);
      // Tohumlu sapma payı: yaw × mesafe (yön), lift çarpanı (yükseklik); falsolu yolda varış daha yaklaşık
      const dist = Math.hypot(openHard.ball.x, z - openHard.ball.z);
      expect(Math.abs(st.pos.z - z), `z ${z}`).toBeLessThan((bulge === 0 ? 0.4 : 1.0) + Math.abs(p.scatter.yaw) * dist);
      expect(Math.abs(st.pos.y - y), `y ${y}`).toBeLessThan(0.35 + Math.abs(p.scatter.lift - 1) * (y + 8));
    }
  });

  it('nişan yardımı: direğin hemen dışına düşen hedef biraz içeri çekilir; içerideki ve uzaktaki hedefe dokunulmaz', () => {
    const tz = (z: number, y = 1.2) => shotParams(round0, swipe(z, y, 200))!.targetZ;
    expect(tz(2)).toBeCloseTo(2, 9);
    expect(tz(3.7)).toBeLessThan(3.7);
    expect(tz(3.7)).toBeGreaterThan(3.26); // çok küçük: güvenli kenarın (3,26) ötesinde kalır
    expect(tz(-3.7)).toBeCloseTo(-tz(3.7), 9);
    expect(tz(6)).toBeCloseTo(6, 9); // bariz aut → yardım yok
  });

  it('güç bölgeleri: aşırı güçte top yükselir (aynı hedefe uygun güçten daha yüksekten geçer)', () => {
    const height = (power: number) => {
      const st = startShot(openHard, swipe(0.5, 1.9, msFor(0.5, 1.9, power)));
      st.keeperTarget = st.keeperZ = 30;
      while (st.pos.x < -0.05 && !st.result) stepShot(st);
      return st.pos.y;
    };
    expect(shotParams(openHard, swipe(0.5, 1.9, msFor(0.5, 1.9, 0.6)))!.power).toBeCloseTo(0.6, 1);
    expect(Math.abs(height(POWER_ZONES.over - 0.05) - 1.9)).toBeLessThan(0.3);
    expect(height(1)).toBeGreaterThan(height(POWER_ZONES.over - 0.05) + 0.4);
    expect(simulateShot(openHard, swipe(0.5, 2.05, msFor(0.5, 2.05, 1))).kind).not.toBe('goal'); // üstten gider / direk
  });

  it('tohumlu sapma: aynı girdi aynı sapma; güçle ve titremeyle büyür; sınırlı; Math.random yok', () => {
    const input = swipe(2.0, 1.5, 200, 0.1, 40);
    const a = shotParams(round0, input)!;
    expect(a.scatter).toEqual(shotParams(round0, input)!.scatter);
    expect(scatterSeed(round0, input)).toBe(scatterSeed(round0, input));
    expect(scatterSeed(round0, input)).not.toBe(scatterSeed(round0, { ...input, ms: 201 }));
    expect(scatterSeed(round0, input)).not.toBe(scatterSeed(makeRound(SEED, 1), input));
    expect(Math.abs(a.scatter.yaw)).toBeLessThanOrEqual(scatterAmplitude(a.power, a.shake).yaw);
    expect(scatterAmplitude(1, 0).yaw).toBeGreaterThan(scatterAmplitude(0.3, 0).yaw * 3);
    expect(scatterAmplitude(0.5, 1).yaw - scatterAmplitude(0.5, 0).yaw).toBeCloseTo(SCATTER.byShake, 9);
    expect(scatterAmplitude(1, 1).yaw).toBeLessThan(0.1);
    // Pürüzsüz bombe titreme sayılmaz; zikzak sayılır
    expect(a.shake).toBe(0);
    expect(swipeShake(swipe(0, 1.5, 200).pts)).toBe(0);
    const zigzag = swipe(0, 1.5, 200).pts.map(([z, y], i) => [z + (i % 2 ? 25 : -25), y] as [number, number]);
    expect(swipeShake(zigzag)).toBe(1);
    expect(shotParams(round0, { tick: 0, ms: 200, pts: zigzag })!.shake).toBe(1);
    // Sapma yönü döndürür, hızı değiştirmez
    const v = a.vel;
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(SHOT_SPEED.min + (SHOT_SPEED.max - SHOT_SPEED.min) * a.power, 6);
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
        expect(st.result.points).toBe(POINTS.goal + POINTS.viaPost + (st.result.corner ? POINTS.corner : 0));
      }
    }
    expect(post).toBeGreaterThan(0);
    expect(viaPost).toBeGreaterThan(0);
    // Çok yukarı kaydırma: aut
    expect(simulateShot(round0, swipe(0, 4, 200))).toEqual({ kind: 'miss', points: 0, viaPost: false, corner: false });
  });

  it('kaleci şuta tepki verir: köşeye orta güçte şut kurtarılır, sert şut geçer; kolay seviyede orta güç yeter', () => {
    // Sapma tohumlu olduğundan tek vuruş yerine köşe hedefleri ızgarasının (z 2,6–3,3 × y 0,8–1,6) gol oranı sayılır
    const goals = (round: Round, power: number) => {
      let n = 0;
      let g = 0;
      for (const y of [0.8, 1.2, 1.6])
        for (let z = 2.6; z <= 3.31; z += 0.1) {
          n++;
          if (simulateShot(round, swipe(z, y, msFor(z, y, power))).kind === 'goal') g++;
        }
      return g / n;
    };
    expect(goals(openHard, 0.45)).toBeLessThanOrEqual(0.1); // orta güç: kaleci yetişir
    expect(goals(openHard, 0.8)).toBeGreaterThanOrEqual(0.4); // sert: çoğu geçer (sapma payıyla)
    // Kolay seviyede (ilk 2 vuruş) orta güç de yeter
    const easy = { ...openHard, keeper: { ...openHard.keeper, react: KEEPER_LEVELS[0].react, speed: KEEPER_LEVELS[0].speed } };
    expect(goals(easy, 0.45)).toBeGreaterThanOrEqual(0.6);
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

describe('zorluk dengesi (modellenmiş oyuncu, tohumlu)', () => {
  /** Yaklaşık normal dağılım (4 düzgün sayının toplamı), σ = 1. */
  const gauss = (r: () => number) => (r() + r() + r() + r() - 2) * Math.sqrt(3);

  /** Oyuncu barajı / direği "okur": kalecisiz simülasyonda top kaleye girmezse yol kapalı sayılır. */
  const blocked = (round: Round, input: ShotInput) => {
    const st = startShot(round, input);
    st.keeperTarget = st.keeperZ = 30;
    while (!st.result) stepShot(st);
    return st.result.kind !== 'goal';
  };

  /**
   * Oyuncu modeli: köşeye yakın hedef + nişan hatası (σ), güç aralığı. `smart`: kalecinin o anki tarafının tersine nişan
   * alır ve barajın kapattığını görürse falso / öbür tarafı dener (iyi oyuncu); değilse çoğu zaman olduğu gibi vurur.
   */
  function goalsPerSeries(p: { sigmaZ: number; sigmaY: number; power: [number, number]; smart: boolean }, series = 300): number {
    const r = rng(20261006);
    let goals = 0;
    for (let n = 0; n < series; n++) {
      const seed = Math.floor(r() * 4294967296);
      for (let i = 0; i < 5; i++) {
        const round = makeRound(seed, i);
        const tick = Math.floor(r() * 600);
        const kz = keeperZ(round, tick);
        let side = p.smart ? (kz > 0 ? -1 : 1) : r() < 0.5 ? -1 : 1;
        const power = p.power[0] + r() * (p.power[1] - p.power[0]);
        const mk = (s: number, bulge: number) => {
          const z = s * (2.2 + r() * 0.9) + gauss(r) * p.sigmaZ;
          const y = 0.5 + r() * 1.4 + gauss(r) * p.sigmaY;
          return swipe(z, y, msFor(z, y, power), bulge, tick);
        };
        let input = mk(side, 0);
        if (blocked(round, input) && (p.smart || r() < 0.4)) {
          const tries: [number, number][] = p.smart ? [[side, 0.18 * side], [side, -0.18 * side], [-side, 0]] : [[-side, 0]];
          for (const [s2, b] of tries) {
            side = s2;
            input = mk(s2, b);
            if (!blocked(round, input)) break;
          }
        }
        if (simulateShot(round, input).kind === 'goal') goals++;
      }
    }
    return goals / series;
  }

  it('ortalama oyuncu 5 vuruşta ~1–2 gol, iyi oyuncu ~3–4 gol', () => {
    const average = goalsPerSeries({ sigmaZ: 0.75, sigmaY: 0.45, power: [0.3, 0.95], smart: false });
    const good = goalsPerSeries({ sigmaZ: 0.3, sigmaY: 0.2, power: [0.7, 0.85], smart: true });
    expect(average, `ortalama ${average}`).toBeGreaterThanOrEqual(1);
    expect(average, `ortalama ${average}`).toBeLessThanOrEqual(2.1);
    expect(good, `iyi ${good}`).toBeGreaterThanOrEqual(3);
    expect(good, `iyi ${good}`).toBeLessThanOrEqual(4.1);
  }, 60_000);
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AIM_SIDE_GAIN,
  FIGURE,
  GOAL,
  KEEPER_LEVELS,
  LOFT,
  MAX_SERIES_SCORE,
  MAX_SHOT_TICKS,
  POINTS,
  SHOT_SPEED,
  WALL_DISTANCE,
  aimBasis,
  keeperZ,
  makeRound,
  parseShotInput,
  powerWindow,
  pullShake,
  rng,
  scatterAmplitude,
  scoreSeries,
  shotParams,
  simulateShot,
  startShot,
  stepShot,
  type Round,
  type ShotInput,
  type ShotResult,
} from './sim';

const SEED = 42;
const round0 = makeRound(SEED, 0);
/** Zor seviye (3. vuruş ve sonrası) kalecisi, barajsız, kaleci ortada sabit başlar. */
const openHard: Round = { ...makeRound(SEED, 3), wall: [], keeper: { amp: 0.0001, period: 300, phase: 0, react: KEEPER_LEVELS[1].react, speed: KEEPER_LEVELS[1].speed } };

/**
 * Test çekmesi (çekme birimi): kale düzleminde `targetZ`'ye nişan alacak yönde, `power` (0–1) kadar düz geri çekme;
 * 16 nokta, `flick` yana kıvrım. İstemcinin ürettiği biçimle aynı.
 */
function pull(round: Round, targetZ: number, power: number, flick = 0, tick = 0): ShotInput {
  const b = aimBasis(round);
  const dx = -round.ball.x;
  const dz = targetZ - round.ball.z;
  const d = Math.hypot(dx, dz);
  const df = (dx / d) * b.fx + (dz / d) * b.fz;
  const dr = (dx / d) * b.rx + (dz / d) * b.rz;
  const px = -dr / AIM_SIDE_GAIN;
  const py = df;
  const k = (1000 * power) / Math.hypot(px, py);
  const pts: [number, number][] = [];
  for (let i = 0; i < 16; i++) pts.push([Math.round((px * k * i) / 15), Math.round((py * k * i) / 15)]);
  return { tick, flick, pts };
}

/** Küçük ızgarada koşulu sağlayan ilk vuruş (belirlenimci arama). */
function find(pred: (r: ShotResult) => boolean, round: Round = round0): { input: ShotInput; result: ShotResult } {
  for (const tick of [0, 90, 180])
    for (let z = -3.6; z <= 3.61; z += 0.3)
      for (let power = 0.4; power <= 0.9; power += 0.02)
        for (const flick of [0, 250, -250]) {
          const input = pull(round, z, power, flick, tick);
          const result = simulateShot(round, input);
          if (pred(result)) return { input, result };
        }
  throw new Error('ızgarada bulunamadı');
}

describe('belirlenimcilik', () => {
  it('simülasyon kaynaklarında motorlar arası fark yaratabilecek işlev yok (Math.random dahil)', () => {
    for (const f of ['src/lib/frikik/sim.ts', 'src/lib/pitchPhysics/core.ts']) {
      const src = readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\/\*[^]*?\*\/|\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.(sin|cos|tan|atan2?|asin|acos|exp|pow|log\w*|hypot|cbrt|random)\b/);
      expect(src, f).not.toMatch(/\bDate\b|performance\./);
    }
  });

  it('aynı tohum → aynı turlar; aynı girdi → aynı sonuç ve aynı sapma (JSON\'dan geçse de)', () => {
    expect(makeRound(SEED, 3)).toEqual(makeRound(SEED, 3));
    expect(makeRound(SEED, 3)).not.toEqual(makeRound(SEED + 1, 3));
    expect(makeRound(SEED, 3)).not.toEqual(makeRound(SEED, 4));
    const input = pull(round0, 2.1, 0.7, 180, 77);
    expect(simulateShot(round0, input)).toEqual(simulateShot(round0, input));
    const viaJson = parseShotInput(JSON.parse(JSON.stringify(input)))!;
    expect(shotParams(round0, viaJson)).toEqual(shotParams(round0, input));
    expect(simulateShot(round0, viaJson)).toEqual(simulateShot(round0, input));
    // Sapma bırakma anına (tick) bağlı değil: yalnız çekmenin kendisine
    expect(shotParams(round0, { ...input, tick: 5 })!.scatter).toEqual(shotParams(round0, input)!.scatter);
  });

  it('sabit seri: skor değişmez (fizik değişirse bu test bilerek kırılır → sunucu / istemci birlikte güncellenir)', () => {
    const rounds = [0, 1, 2, 3, 4].map((i) => makeRound(SEED, i));
    const inputs = [pull(rounds[0]!, 2.8, 0.66, 0, 120), pull(rounds[1]!, -2.5, 0.7, 200, 40), pull(rounds[2]!, 0, 0.6), pull(rounds[3]!, 2.8, 0.72, 0, 300), pull(rounds[4]!, -3.0, 0.68, -150, 10)];
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
          {
            "corner": false,
            "kind": "saved",
            "points": 0,
            "viaPost": false,
          },
          {
            "corner": false,
            "kind": "goal",
            "points": 150,
            "viaPost": true,
          },
        ],
        "total": 350,
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
  const ok = pull(round0, 1, 0.6, 120, 3);
  it('yalnız aralık içi tam sayılar; 12–20 nokta', () => {
    expect(parseShotInput(ok)).toEqual(ok);
    expect(parseShotInput({ ...ok, points: 999, score: 1250, power: 1 })).toEqual(ok); // fazladan alan (ör. uydurma puan) yok sayılır
    const pts = ok.pts;
    for (const bad of [
      null,
      'x',
      [],
      { ...ok, tick: -1 },
      { ...ok, tick: 1e9 },
      { ...ok, flick: 2001 },
      { ...ok, flick: 1.5 },
      { ...ok, flick: '10' },
      { ...ok, pts: pts.slice(0, 11) },
      { ...ok, pts: [...pts, ...pts] },
      { ...ok, pts: 'x' },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [p[0] + 0.5, p[1]] : p)) },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [p[0], 99999] : p)) },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [p[0]] : p)) },
      { ...ok, pts: pts.map((p, i) => (i === 3 ? [Number.NaN, p[1]] : p)) },
      { tick: 0, flick: 0 },
    ]) {
      expect(parseShotInput(bad), JSON.stringify(bad)?.slice(0, 60)).toBeNull();
    }
  });
});

describe('geri çek – bırak → şut', () => {
  it('yön çekmenin tersi: düz aşağı çekme kale ortasına, sağa çekme sola nişan; yan hassasiyet düşük', () => {
    const b = aimBasis(round0);
    const straight = shotParams(round0, { tick: 0, flick: 0, pts: Array.from({ length: 16 }, (_, i) => [0, i * 40] as [number, number]) })!;
    expect(straight.aim.x).toBeCloseTo(b.fx, 9);
    expect(straight.aim.z).toBeCloseTo(b.fz, 9);
    const right = shotParams(round0, { tick: 0, flick: 0, pts: Array.from({ length: 16 }, (_, i) => [i * 20, i * 40] as [number, number]) })!;
    // Sağa çekildi → nişan F'nin soluna (R bileşeni negatif), çekme açısından daha az (kazanç < 1)
    const side = right.aim.x * b.rx + right.aim.z * b.rz;
    const fwd = right.aim.x * b.fx + right.aim.z * b.fz;
    expect(side).toBeLessThan(0);
    expect(-side / fwd).toBeCloseTo(0.5 * AIM_SIDE_GAIN, 9);
  });

  it('güç = çekme uzunluğu (hız ve yükseklik); çok kısa / yukarı doğru çekme geçersiz ve vuruş sayılmaz', () => {
    const weak = shotParams(openHard, pull(openHard, 0, 0.4))!;
    const strong = shotParams(openHard, pull(openHard, 0, 0.8))!;
    expect(weak.power).toBeCloseTo(0.4, 2);
    expect(strong.power).toBeCloseTo(0.8, 2);
    expect(Math.hypot(strong.vel.x, strong.vel.z)).toBeCloseTo(SHOT_SPEED.min + (SHOT_SPEED.max - SHOT_SPEED.min) * strong.power, 6);
    expect(strong.vel.y / Math.hypot(strong.vel.x, strong.vel.z)).toBeCloseTo(LOFT * strong.scatter.lift, 9);
    expect(shotParams(openHard, pull(openHard, 0, 3))!.power).toBe(1); // sınır
    const short: ShotInput = { tick: 0, flick: 0, pts: Array.from({ length: 16 }, (_, i) => [0, i * 5] as [number, number]) };
    const up: ShotInput = { tick: 0, flick: 0, pts: Array.from({ length: 16 }, (_, i) => [i * 10, -i * 40] as [number, number]) };
    expect(shotParams(openHard, short)).toBeNull();
    expect(shotParams(openHard, up)).toBeNull();
    expect(simulateShot(openHard, short)).toEqual({ kind: 'miss', points: 0, viaPost: false, corner: false });
  });

  it('bırakırken yana kıvrım = falso (sağa → sağa kıvrılır), ölü bölgeli ve sınırlı', () => {
    const c = (flick: number) => shotParams(openHard, pull(openHard, 0, 0.6, flick))!.curve;
    expect(c(0)).toBe(0);
    expect(c(30)).toBe(0);
    expect(c(230)).toBeCloseTo(0.5, 9);
    expect(c(-230)).toBeCloseTo(-0.5, 9);
    expect(c(1500)).toBe(1);
    // Sağa falso: top kale çizgisini falsosuz şuta göre daha sağdan (+R ≈ +z) geçer
    const crossZ = (flick: number) => {
      const st = startShot(openHard, pull(openHard, 0, 0.62, flick));
      st.keeperTarget = st.keeperZ = 30;
      while (st.pos.x < -0.05 && !st.result) stepShot(st);
      return st.pos.z;
    };
    expect(crossZ(300)).toBeGreaterThan(crossZ(0) + 1);
    expect(crossZ(-300)).toBeLessThan(crossZ(0) - 1);
  });

  it('güç çubuğunun "uygun" bölgesi: o aralıkta düz şut kale yüksekliğine varır; altında yerden, üstünde üstten gider', () => {
    for (const round of [openHard, { ...makeRound(7, 2), wall: [] }, { ...makeRound(9, 4), wall: [] }]) {
      const win = powerWindow(round);
      expect(win.weak).toBeGreaterThan(0.2);
      expect(win.over).toBeGreaterThan(win.weak + 0.08);
      expect(win.over).toBeLessThan(1);
      const heightAtGoal = (power: number) => {
        const st = startShot(round, pull(round, 0, power));
        // Sapmasız ölçüm: nişan yönünde, yükseklik hatası yok
        const p = shotParams(round, pull(round, 0, power))!;
        const vh = Math.hypot(p.vel.x, p.vel.z);
        st.vel = { x: p.aim.x * vh, y: LOFT * vh, z: p.aim.z * vh };
        st.keeperTarget = st.keeperZ = 30;
        while (st.pos.x < -0.05 && !st.result) stepShot(st);
        return st.pos.y;
      };
      const mid = (win.weak + win.over) / 2;
      expect(heightAtGoal(mid)).toBeGreaterThan(0.3);
      expect(heightAtGoal(mid)).toBeLessThan(GOAL.height - 0.3);
      expect(heightAtGoal(Math.min(1, win.over + 0.08))).toBeGreaterThan(GOAL.height - 0.35);
    }
  });
});

describe('sapma (risk / ödül) — tohumlu', () => {
  it('güç ve titreme arttıkça sapma sınırı büyür; uygulanan sapma sınırın içinde', () => {
    expect(scatterAmplitude(0.9, 0).yaw).toBeGreaterThan(scatterAmplitude(0.5, 0).yaw * 2);
    expect(scatterAmplitude(0.5, 1).yaw).toBeGreaterThan(scatterAmplitude(0.5, 0).yaw);
    expect(scatterAmplitude(0.9, 0).lift).toBeGreaterThan(scatterAmplitude(0.5, 0).lift);
    for (const power of [0.4, 0.6, 0.8, 1]) {
      const p = shotParams(openHard, pull(openHard, 1.5, power))!;
      const amp = scatterAmplitude(p.power, p.shake);
      expect(Math.abs(p.scatter.yaw)).toBeLessThanOrEqual(amp.yaw);
      expect(Math.abs(p.scatter.lift - 1)).toBeLessThanOrEqual(amp.lift);
    }
  });

  it('sert şutlar daha dağınık: aynı hedefe çok sayıda (1 birim farklı) çekmede varış noktalarının yayılımı güçle artar', () => {
    const spread = (power: number) => {
      const zs: number[] = [];
      for (let n = 0; n < 60; n++) {
        const input = pull(openHard, 0, power);
        input.pts[7] = [input.pts[7]![0] + (n % 2 ? 1 : -1) * Math.ceil(n / 2), input.pts[7]![1]]; // minik parmak farkı → başka tohum
        const st = startShot(openHard, input);
        st.keeperTarget = st.keeperZ = 30;
        while (st.pos.x < -0.05 && !st.result) stepShot(st);
        zs.push(st.pos.z);
      }
      return Math.max(...zs) - Math.min(...zs);
    };
    expect(spread(0.85)).toBeGreaterThan(spread(0.5) * 1.8);
    expect(spread(0.5)).toBeGreaterThan(0.05); // düşük güçte de küçük bir sapma var
  });

  it('titreme: zikzaklı çekme yolu → shake > 0 (düz ya da yumuşak kavisli yol 0)', () => {
    const straight = pull(openHard, 0, 0.6).pts;
    expect(pullShake(straight)).toBe(0);
    const arc: [number, number][] = Array.from({ length: 16 }, (_, i) => [Math.round(60 * Math.sin((Math.PI * i) / 15)), i * 40]);
    expect(pullShake(arc)).toBe(0);
    const zigzag: [number, number][] = [...straight.slice(0, 12), [10, 430], [-8, 418], [9, 431], [-7, 420]];
    expect(pullShake(zigzag)).toBeGreaterThan(0.4);
    expect(shotParams(openHard, { tick: 0, flick: 0, pts: zigzag })!.shake).toBeGreaterThan(0.4);
  });
});

describe('vuruş sonuçları ve puan', () => {
  it('gol 100; doksan +100; direkten gol +50; gol değilse 0', () => {
    expect(find((r) => r.kind === 'goal' && !r.viaPost && !r.corner).result.points).toBe(POINTS.goal);
    expect(find((r) => r.kind === 'goal' && r.corner && !r.viaPost, openHard).result.points).toBe(POINTS.goal + POINTS.corner);
    for (const kind of ['wall', 'saved', 'miss'] as const) {
      const { result } = find((r) => r.kind === kind);
      expect(result).toEqual({ kind, points: 0, viaPost: false, corner: false });
    }
    // Direğe nişan: ya direkten döner (0) ya direkten gol (+50)
    let post = 0;
    let viaPost = 0;
    for (let z = 3.2; z <= 4.0; z += 0.01) {
      const st = startShot(openHard, pull(openHard, z, 0.62));
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
  });

  it('kaleci şuta tepki verir: ortaya giden şut kurtarılır; kolay seviyede kaleci köşeye yetişemez', () => {
    const win = powerWindow(openHard);
    const p = win.weak + (win.over - win.weak) * 0.6;
    expect(simulateShot(openHard, pull(openHard, 0.3, p)).kind).toBe('saved');
    const easy = { ...openHard, keeper: { ...openHard.keeper, react: KEEPER_LEVELS[0].react, speed: KEEPER_LEVELS[0].speed } };
    let goals = 0;
    for (let z = 2.0; z <= 3.01; z += 0.1) if (simulateShot(easy, pull(easy, z, p)).kind === 'goal') goals++;
    expect(goals).toBeGreaterThanOrEqual(6); // 11 denemenin çoğu (sapma birkaçını direğe / dışarı atar)
  });

  it('barajın ortasına alçak şut barajda kalır', () => {
    const mid = round0.wall[1]!;
    const zAtGoal = round0.ball.z + ((mid.z - round0.ball.z) * -round0.ball.x) / (mid.x - round0.ball.x);
    expect(simulateShot(round0, pull(round0, zAtGoal, powerWindow(round0).weak - 0.05)).kind).toBe('wall');
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
    for (const extreme of [pull(round0, 60, 3, 2000), pull(round0, -60, 0.16, -2000), pull(round0, 0, 1, 0, 72_000)]) {
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

  /**
   * Oyuncu modeli (önizleme yok → tahmin): köşeye yakın bir noktaya nişan alır (yön hatası σ m, kale düzleminde), gücü
   * çubuğun "uygun" bölgesine göre seçer (hata σ). `smart`: kalecinin o anki tarafının tersine ve bölgenin üst yarısına
   * (sert, barajın üstünden) vurur.
   */
  function goalsPerSeries(p: { sigmaZ: number; sigmaP: number; smart: boolean }, series = 300): number {
    const r = rng(20261006);
    let goals = 0;
    for (let n = 0; n < series; n++) {
      const seed = Math.floor(r() * 4294967296);
      for (let i = 0; i < 5; i++) {
        const round = makeRound(seed, i);
        const tick = Math.floor(r() * 600);
        const side = p.smart ? (keeperZ(round, tick) > 0 ? -1 : 1) : r() < 0.5 ? -1 : 1;
        const win = powerWindow(round);
        const z = side * (2.3 + r() * 0.7) + gauss(r) * p.sigmaZ;
        const base = p.smart ? win.weak + (win.over - win.weak) * (0.55 + r() * 0.3) : win.weak + (win.over - win.weak) * r();
        const power = Math.min(1, Math.max(0.2, base + gauss(r) * p.sigmaP));
        const input = pull(round, z, power, 0, tick);
        // Elin doğal farkı: orta noktayı ±3 birim oynat (her vuruş başka sapma tohumu)
        input.pts[8] = [input.pts[8]![0] + Math.floor(r() * 7) - 3, input.pts[8]![1]];
        if (simulateShot(round, input).kind === 'goal') goals++;
      }
    }
    return goals / series;
  }

  it('ortalama oyuncu 5 vuruşta ~1–2 gol, iyi oyuncu ~3–4 gol', () => {
    const average = goalsPerSeries({ sigmaZ: 0.8, sigmaP: 0.06, smart: false });
    const good = goalsPerSeries({ sigmaZ: 0.3, sigmaP: 0.015, smart: true });
    expect(average, `ortalama ${average}`).toBeGreaterThanOrEqual(1);
    expect(average, `ortalama ${average}`).toBeLessThanOrEqual(2.1);
    expect(good, `iyi ${good}`).toBeGreaterThanOrEqual(2.9);
    expect(good, `iyi ${good}`).toBeLessThanOrEqual(4.1);
  }, 60_000);
});

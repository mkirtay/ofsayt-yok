import { describe, expect, it } from 'vitest';
import { CHAR_IDS } from './characters';
import { FIELD, TICK_HZ, bankAim, createWorld, lcg, stepWorld, type Difficulty, type Input } from './engine';

const IDLE: Input = { x: 0, y: 0, kick: false };

/** Hareketsiz insana karşı botun ilk gol saniyesi (gol yoksa null). Başlama vuruşu bota verilir. */
function firstBotGoal(diff: Difficulty, seed: number): number | null {
  const w = createWorld({ mode: '1v1', diff, durSec: 200, myChar: 'dengeli', rng: lcg(seed) });
  w.kickoffTeam = 1;
  w.lock = { team: 1 };
  for (let i = 0; i < 200 * TICK_HZ; i++) {
    stepWorld(w, IDLE);
    if (w.score[1] > 0) return i / TICK_HZ;
  }
  return null;
}

describe('miniSaha engine', () => {
  it('bot hareketsiz oyuncuya karşı her zorlukta gol atar (köşe/çizgi dibinde sıkışmaz)', () => {
    for (const diff of ['kolay', 'orta', 'zor'] as const) {
      const times: number[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const t = firstBotGoal(diff, seed * 97);
        expect(t, `${diff} tohum ${seed}`).not.toBeNull();
        times.push(t!);
      }
      // hepsi gol atar; tipik (ortanca) süre kısa
      times.sort((a, b) => a - b);
      expect(times[6], diff).toBeLessThan(40);
    }
  });

  it('top ve oyuncular sınır içinde, değerler sonlu kalır (2v2, bot-bot gibi uzun maç)', () => {
    const w = createWorld({ mode: '2v2', diff: 'zor', durSec: 90, myChar: 'duvar', rng: lcg(7) });
    const { HX, HY, GD, M } = FIELD;
    for (let i = 0; i < 90 * TICK_HZ; i++) {
      // insan rastgele koşturur ve vurur
      const t = i / 40;
      stepWorld(w, { x: Math.cos(t), y: Math.sin(t * 1.3), kick: i % 50 < 10 });
      w.events.length = 0;
      expect(Number.isFinite(w.ball.x) && Number.isFinite(w.ball.y)).toBe(true);
      expect(Math.abs(w.ball.x)).toBeLessThanOrEqual(HX + GD + 0.01);
      expect(Math.abs(w.ball.y)).toBeLessThanOrEqual(HY + 0.01);
      for (const p of w.players) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(HX + M);
        expect(Math.abs(p.y)).toBeLessThanOrEqual(HY + M);
      }
      if (w.phase === 'end') break;
    }
  });

  it('başlama vuruşu kilidi: rakip orta yuvarlağa giremez, kendi yarısında kalır', () => {
    const w = createWorld({ mode: '1v1', diff: 'orta', durSec: 60, myChar: 'ruzgar', rng: lcg(3) });
    w.kickoffTeam = 1;
    w.lock = { team: 1 };
    // insan topa doğru koşar
    for (let i = 0; i < 40; i++) stepWorld(w, { x: 1, y: 0, kick: false });
    const me = w.players[0];
    if (w.lock) {
      expect(me.x).toBeLessThanOrEqual(0);
      expect(Math.hypot(me.x, me.y)).toBeGreaterThanOrEqual(FIELD.CR + me.r - 0.01);
    }
  });

  it('süre bitince skor farklıysa maç biter; eşitse altın gol olayı gelir', () => {
    const w = createWorld({ mode: '1v1', diff: 'kolay', durSec: 1, myChar: 'dengeli', rng: lcg(11) });
    const events: string[] = [];
    for (let i = 0; i < 2 * TICK_HZ; i++) {
      stepWorld(w, IDLE);
      events.push(...w.events.map((e) => e.type));
      w.events.length = 0;
    }
    if (w.score[0] === w.score[1]) expect(events).toContain('golden');
    else expect(w.phase).toBe('end');
  });

  it('karakter çarpanları: Rüzgâr Duvar’dan hızlı koşar, Duvar daha zor itilir', () => {
    const top = (id: (typeof CHAR_IDS)[number]) => {
      const w = createWorld({ mode: '1v1', diff: 'kolay', durSec: 60, myChar: id, rng: lcg(5) });
      w.lock = null;
      w.players[1].x = 300; // botu uzaklaştır, tek başına koşsun
      for (let i = 0; i < 120; i++) { w.players[1].think = 99; w.players[1].ix = 0; w.players[1].iy = 0; stepWorld(w, { x: 0, y: 1, kick: false }); }
      return Math.hypot(w.players[0].vx, w.players[0].vy);
    };
    expect(top('ruzgar')).toBeGreaterThan(top('duvar'));
  });

  it('Sihirbaz topu sürerken Bomba’dan daha yakın tutar', () => {
    const dribble = (id: 'sihirbaz' | 'bomba') => {
      const w = createWorld({ mode: '1v1', diff: 'kolay', durSec: 60, myChar: id, rng: lcg(9) });
      w.lock = null;
      const me = w.players[0];
      w.players[1].x = 340; w.players[1].y = 150;
      me.x = -200; me.y = 0;
      w.ball.x = -200 + me.r + w.ball.r; w.ball.y = 0;
      let sum = 0;
      for (let i = 0; i < 180; i++) {
        w.players[1].think = 99; w.players[1].ix = 0; w.players[1].iy = 0;
        // zikzak sürüş
        stepWorld(w, { x: 1, y: Math.sin(i / 15), kick: false });
        sum += Math.hypot(w.ball.x - me.x, w.ball.y - me.y);
      }
      return sum / 180;
    };
    expect(dribble('sihirbaz')).toBeLessThan(dribble('bomba'));
  });
  it('2v2 bot takımları pas yapar ve gol atar (langırt gibi değil)', () => {
    let passes = 0;
    let goals = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const w = createWorld({ mode: '2v2', diff: 'zor', durSec: 120, myChar: 'dengeli', rng: lcg(seed * 31) });
      w.players[0].human = false; // insanı da bot yap
      for (let i = 0; i < 120 * TICK_HZ && w.phase !== 'end'; i++) {
        stepWorld(w, IDLE);
        w.events.length = 0;
      }
      passes += w.passes[0] + w.passes[1];
      goals += w.score[0] + w.score[1];
    }
    // 4 maç × 2 dk: her maçta ortalama en az birkaç isabetli pas ve gol
    expect(passes).toBeGreaterThanOrEqual(12);
    expect(goals).toBeGreaterThanOrEqual(4);
  });
  it('gol olayı golü atanı taşır; kendi kalesine golde scorer null', () => {
    const shoot = (fromTeam: 0 | 1) => {
      const w = createWorld({ mode: '1v1', diff: 'kolay', durSec: 60, myChar: 'bomba', rng: lcg(2) });
      w.lock = null;
      const me = w.players[0];
      const bot = w.players[1];
      bot.x = 0; bot.y = 140; bot.think = 1e9; bot.ix = bot.iy = 0;
      // insan sağdaki (rakip) kaleye ya da kendi kalesine doğru topun arkasında
      const sx = fromTeam === 0 ? 1 : -1;
      w.ball.x = sx * (FIELD.HX - 60); w.ball.y = 0;
      me.x = w.ball.x - sx * (me.r + w.ball.r + 1); me.y = 0;
      for (let i = 0; i < 240; i++) {
        bot.think = 1e9;
        stepWorld(w, { x: sx, y: 0, kick: true });
        const g = w.events.find((e) => e.type === 'goal');
        if (g && g.type === 'goal') return { team: g.team, scorer: g.scorer };
        w.events.length = 0;
      }
      return null;
    };
    const own = shoot(1);
    expect(own).toMatchObject({ team: 1, scorer: null });
    const mine = shoot(0);
    expect(mine?.team).toBe(0);
    expect(mine?.scorer?.c.id).toBe('bomba');
  });
  it('bant nişanı: duvardan sekip hedefe ulaşır (sekmede dik hız kaybı hesaba katılır)', () => {
    for (const [bx, by, tx, ty, side] of [[-150, 60, -20, 70, -1], [0, -80, 120, -40, 1], [100, 0, -40, 20, -1]] as const) {
      const aim = bankAim([], bx, by, tx, ty, side);
      expect(aim).not.toBeNull();
      const w = createWorld({ mode: '1v1', diff: 'kolay', durSec: 60, myChar: 'dengeli', rng: lcg(1) });
      w.lock = null;
      // oyuncuları yoldan çek, botu dondur
      w.players[0].x = -330; w.players[0].y = 175;
      w.players[1].x = 330; w.players[1].y = 175;
      w.ball.x = bx; w.ball.y = by;
      const l = Math.hypot(aim!.ax - bx, aim!.ay - by);
      // bant nişanının hesapladığı çıkış hızıyla
      w.ball.vx = ((aim!.ax - bx) / l) * aim!.speed;
      w.ball.vy = ((aim!.ay - by) / l) * aim!.speed;
      let best = Infinity;
      for (let i = 0; i < 240; i++) {
        w.players[1].think = 1e9; w.players[1].ix = w.players[1].iy = 0;
        stepWorld(w, IDLE);
        w.events.length = 0;
        best = Math.min(best, Math.hypot(w.ball.x - tx, w.ball.y - ty));
      }
      expect(best, `${bx},${by} → ${tx},${ty}`).toBeLessThan(14);
    }
  });

  it('denge: en hızlı / en yavaş koşu farkı %20 altında; topla koşan yavaşlar', () => {
    const run = (id: (typeof CHAR_IDS)[number], withBall: boolean) => {
      const w = createWorld({ mode: '1v1', diff: 'kolay', durSec: 60, myChar: id, rng: lcg(5) });
      w.lock = null;
      const me = w.players[0];
      w.players[1].x = 300; w.players[1].y = 170;
      me.x = -280; me.y = withBall ? 0 : -100;
      w.ball.x = withBall ? -280 + me.r + w.ball.r : 0; w.ball.y = withBall ? 0 : 140;
      const x0 = me.x;
      for (let i = 0; i < 180; i++) { w.players[1].think = 1e9; w.players[1].ix = w.players[1].iy = 0; stepWorld(w, { x: 1, y: 0, kick: false }); }
      return (me.x - x0) / 180;
    };
    const free = CHAR_IDS.map((id) => run(id, false));
    expect(Math.max(...free) / Math.min(...free)).toBeLessThan(1.2);
    for (const id of CHAR_IDS) expect(run(id, true)).toBeLessThan(run(id, false));
  });
  it('botlar kendi kalesine vurmaz; gövdeyle itme nadir (her zorlukta)', () => {
    const heading = (bx: number, by: number, vx: number, vy: number, gx: number) => {
      if (vx * (gx - bx) <= 0) return false;
      return Math.abs(by + (vy * (gx - bx)) / vx) < FIELD.GH + 10;
    };
    for (const diff of ['kolay', 'zor'] as const) {
      let goals = 0;
      let kickOwn = 0;
      let bodyOwn = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const w = createWorld({ mode: '1v1', diff, durSec: 180, myChar: 'dengeli', rng: lcg(seed * 31 + 7) });
        w.players[0].human = false; // bot-bot
        let last: { team: number; heading: boolean; kicked: boolean } | null = null;
        for (let i = 0; i < 180 * TICK_HZ && w.phase !== 'end'; i++) {
          const pre = { x: w.ball.x, y: w.ball.y, vx: w.ball.vx, vy: w.ball.vy };
          stepWorld(w, IDLE);
          const kicked = w.events.some((e) => e.type === 'kick');
          const t = w.lastTouch;
          if (t && (kicked || Math.hypot(t.x - w.ball.x, t.y - w.ball.y) <= t.r + w.ball.r + 1.5)) {
            const own = t.team === 0 ? -FIELD.HX : FIELD.HX;
            last = { team: t.team, heading: heading(pre.x, pre.y, pre.vx, pre.vy, own), kicked };
          }
          for (const e of w.events) {
            if (e.type !== 'goal') continue;
            goals++;
            // kaleye zaten giden şutu sektirmek hata sayılmaz
            if (last && last.team !== e.team && !last.heading) {
              if (last.kicked) kickOwn++;
              else bodyOwn++;
            }
            last = null;
          }
          w.events.length = 0;
        }
      }
      expect(kickOwn, diff).toBe(0);
      expect(bodyOwn / Math.max(1, goals), diff).toBeLessThan(0.15);
    }
  });
});

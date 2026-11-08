import { describe, expect, it } from 'vitest';
import lineupSample from '@/services/sportmonks/__fixtures__/commentaryLineup19746587.json';
import { classifyScene, type CommentaryItem, type SceneSide } from '@/services/sportmonks/matchCommentary';
import { buildSceneSquads, type RawFormation, type RawLineupRow, type RawParticipant } from '@/services/sportmonks/commentaryScene';
import { SCENE_W } from './sceneLayout';
import { BALL, buildPlan, dist, effectState, rng, type BallSeg, type ScenePlan } from './scenePlan';

const lineup = lineupSample as { participants: RawParticipant[]; formations: RawFormation[]; lineups: RawLineupRow[] };
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;
const starters = (side: SceneSide) => squads[side].players.filter((p) => p.starter);
const homeFw = starters('home').find((p) => p.pos === 'F')!.name;
const homeMid = starters('home').find((p) => p.pos === 'M')!.name;
const awayDef = starters('away').find((p) => p.pos === 'D')!.name;

const item = (en: string, { id = 7, side = 'home' as SceneSide } = {}): CommentaryItem => ({
  id,
  order: id,
  minute: 10,
  extraMinute: null,
  kind: 'shot',
  important: false,
  en,
  tr: null,
  scene: { ...classifyScene(en, id)!, side },
});
const plan = (en: string, opts?: { id?: number; side?: SceneSide }, extra?: { disallowed?: boolean }) => buildPlan(item(en, opts), squads, extra)!;
const flights = (p: ScenePlan) => p.ball.filter((s): s is Extract<BallSeg, { kind: 'flight' }> => s.kind === 'flight');
const actors = (p: ScenePlan) => p.agents.filter((a) => a.actor);

const SHOTS = {
  goal: `Goal! ${homeFw} scores, making it 1-0.`,
  saved: `${homeFw} takes a left-footed shot, but it's saved.`,
  blocked: `${homeFw} takes a right-footed shot, but it is blocked.`,
  post: `${homeFw} takes a left-footed shot that hits the post.`,
  miss: `${homeFw} takes a right-footed shot but misses.`,
};

describe('buildPlan — ortak', () => {
  it('belirlenimli: aynı olay aynı plan (tekrar oynatışta başka pozisyon yok)', () => {
    expect(plan(SHOTS.saved)).toEqual(plan(SHOTS.saved));
    expect(plan(SHOTS.saved, { id: 8 })).not.toEqual(plan(SHOTS.saved, { id: 7 }));
  });

  it('22 oyuncu + hakem + kenar yedeği; kalıcı kimlikler', () => {
    const p = plan(SHOTS.goal);
    expect(p.agents).toHaveLength(24);
    expect(p.agents.map((a) => a.key)).toEqual(plan(SHOTS.miss).agents.map((a) => a.key));
    expect(new Set(p.agents.map((a) => a.key)).size).toBe(24);
  });

  it('önemli pozisyonlar 6–9 sn civarında: aşamalar sırada (hazırlık → aksiyon → sonuç → toparlanma)', () => {
    for (const en of Object.values(SHOTS)) {
      const p = plan(en);
      expect(p.climaxMs, en).toBeGreaterThan(1800);
      expect(p.climaxMs, en).toBeLessThan(p.actionEndMs);
      expect(p.actionEndMs, en).toBeLessThanOrEqual(p.durationMs);
      expect(p.durationMs, en).toBeGreaterThan(4500);
      expect(p.durationMs, en).toBeLessThan(10000);
    }
  });

  it('top zaman çizelgesi sıralı; uçuş hızları top hızlarını aşmıyor (oyuncu eğrisi değil)', () => {
    for (const en of Object.values(SHOTS)) {
      const p = plan(en);
      p.ball.forEach((s, k) => k > 0 && expect(s.t0).toBeGreaterThanOrEqual(p.ball[k - 1]!.t0));
      for (const f of flights(p)) expect(f.t1).toBeGreaterThan(f.t0);
    }
    const shot = flights(plan(SHOTS.goal)).find((f) => f.style === 'shot')!;
    const trail = plan(SHOTS.goal).trails.find((t) => t.kind === 'shot')!;
    expect(dist(trail.from, trail.to) / ((shot.t1 - shot.t0) / 1000)).toBeLessThanOrEqual(BALL.shot + 1);
  });

  it('rng [0,1) ve tohuma bağlı', () => {
    const a = rng(5);
    const b = rng(5);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('sahnesi olmayan satır null; kadro yoksa varsayılan diziliş, kimse vurgulanmaz', () => {
    expect(buildPlan({ ...item('Corner awarded.'), scene: null }, squads)).toBeNull();
    const p = buildPlan(item(SHOTS.miss), null)!;
    expect(p.agents).toHaveLength(24);
    expect(actors(p)).toHaveLength(0);
  });
});

describe('buildPlan — olay türleri', () => {
  it('gol: şut uçuşu kalede biter, gol efekti varışta, vuran vurgulu, kutlama sonrası başlama dizilişi', () => {
    const p = plan(SHOTS.goal);
    const shot = flights(p).find((f) => f.style === 'shot')!;
    expect(shot.to.x).toBeGreaterThan(SCENE_W - 6);
    const goal = p.effects.find((e) => e.kind === 'goal')!;
    expect(goal.t).toBe(shot.t1);
    expect(actors(p).map((a) => a.name)).toEqual([homeFw]);
    expect(p.settle).toBe('kickoff');
  });

  it('iptal edilen gol: gol efekti ve kutlama yok, düdük var', () => {
    const p = plan(SHOTS.goal, undefined, { disallowed: true });
    expect(p.disallowed).toBe(true);
    expect(p.effects.map((e) => e.kind)).toEqual(['whistle']);
    expect(p.settle).toBe('shape');
  });

  it('kurtarış: kaleci tepkisi şut başladıktan sonra, kurtarış efekti top varınca', () => {
    const p = plan(SHOTS.saved);
    const shot = flights(p).find((f) => f.style === 'shot')!;
    const keeper = p.agents.findIndex((a) => a.side === 'away' && a.goalkeeper);
    const dive = p.moves.find((m) => m.i === keeper && m.pace === 'dive')!;
    expect(dive.t0).toBeGreaterThan(shot.t0);
    expect(dive.t0).toBeLessThan(shot.t1);
    expect(p.effects.find((e) => e.kind === 'save')!.t).toBe(shot.t1);
  });

  it('blok: savunmacı şuttan ÖNCE yola girer, top bloğa çarpıp seker', () => {
    const p = plan(SHOTS.blocked);
    const shot = flights(p).find((f) => f.style === 'shot')!;
    const block = p.effects.find((e) => e.kind === 'block') as { at: { x: number; y: number }; t: number };
    const run = p.moves.find((m) => m.contact && dist(m.to, block.at) < 2)!;
    expect(run.t0).toBeLessThan(shot.t0);
    expect(block.t).toBe(shot.t1);
    expect(flights(p).some((f) => f.style === 'deflect' && f.t0 === shot.t1)).toBe(true);
  });

  it('direk: top direğe gider, direk efekti, sahaya seken top ve sekene koşan iki oyuncu', () => {
    const p = plan(SHOTS.post);
    const fl = flights(p);
    const post = p.effects.find((e) => e.kind === 'post')!;
    const rebound = fl.find((f) => f.style === 'deflect')!;
    expect(rebound.t0).toBe(post.t);
    expect(rebound.to.x).toBeLessThan(SCENE_W - 40);
    expect(p.moves.filter((m) => m.t0 > post.t - 1 && m.pace === 'sprint')).toHaveLength(2);
  });

  it('isabetsiz: top saha dışına çıkar, efekt yok', () => {
    const p = plan(SHOTS.miss);
    expect(flights(p).at(-1)!.to.x).toBeGreaterThan(SCENE_W);
    expect(p.effects).toHaveLength(0);
  });

  it('asist yalnız metinde adı geçtiğinde: o oyuncu pası atar ve vurgulanır; yoksa pas zinciri yok', () => {
    const withAssist = plan(`Goal! ${homeFw} scores to make it 1-0, assisted by ${homeMid}.`);
    expect(actors(withAssist).map((a) => a.name).sort()).toEqual([homeFw, homeMid].sort());
    expect(flights(withAssist).filter((f) => f.style === 'pass')).toHaveLength(1);
    const solo = plan(SHOTS.goal);
    expect(flights(solo).filter((f) => f.style === 'pass' || f.style === 'cross')).toHaveLength(0);
  });

  it('kart: hücum animasyonu yok (uçuş yok), hakem gider, kart efekti', () => {
    const y = plan(`${awayDef} receives a yellow card.`, { side: 'away' });
    expect(flights(y)).toHaveLength(0);
    expect(y.inPlay).toBe(false);
    expect(y.effects.find((e) => e.kind === 'card')).toMatchObject({ red: false });
    expect(y.moves.some((m) => y.agents[m.i]!.referee)).toBe(true);
    expect(actors(y).map((a) => a.name)).toEqual([awayDef]);
    expect(plan(`${awayDef} receives a red card.`, { side: 'away' }).effects.find((e) => e.kind === 'card')).toMatchObject({ red: true });
  });

  it('değişiklik: top hareket etmez, çıkan kenara gider ve söner, giren onun yerini devralır', () => {
    const bench = squads.home.players.find((p) => !p.starter)!.name;
    const p = plan(`${bench} comes on for ${homeFw}.`);
    expect(flights(p)).toHaveLength(0);
    const off = p.agents.findIndex((a) => a.name === homeFw);
    const sub = p.agents.findIndex((a) => a.sub);
    expect(p.swap).toEqual({ from: sub, into: off });
    expect(p.fades.some((f) => f.i === off && f.to === 0)).toBe(true);
    expect(p.effects.map((e) => e.kind)).toContain('board');
  });
});

describe('effectState', () => {
  it('efekt anından önce görünmez; anlık efekt söner, kalıcı efekt toparlanmaya kadar kalır', () => {
    const save = { kind: 'save' as const, at: { x: 0, y: 0 }, t: 1000 };
    expect(effectState(save, 900, 3000).opacity).toBe(0);
    expect(effectState(save, 1300, 3000).opacity).toBe(1);
    expect(effectState(save, 3000, 3000).opacity).toBe(0);
    const goal = { kind: 'goal' as const, at: { x: 0, y: 0 }, t: 1000 };
    expect(effectState(goal, 3000, 3000).opacity).toBe(1);
  });
});

describe('buildPlan — korner', () => {
  const cornerShot = (en: string) => buildPlan({ ...item(en), scene: { ...item(en).scene!, fromCorner: true } }, squads)!;

  it('tek başına korner satırının sahnesi yok', () => {
    expect(buildPlan({ ...item('Corner awarded.'), kind: 'corner' }, squads)).toBeNull();
  });

  it('kornerden gelen vuruş: top köşede başlar, orta vuruş noktasına iner, sonra şut', () => {
    const p = cornerShot(SHOTS.miss);
    expect(p.type).toBe('shot_off');
    expect(p.start.ballDead).toBe(true);
    expect(p.start.ball!.x).toBeGreaterThan(SCENE_W - 10);
    const fl = flights(p);
    expect(fl.map((f) => f.style)).toEqual(['cross', 'shot']);
    expect(fl[1]!.t0).toBeGreaterThanOrEqual(fl[0]!.t1);
  });

  it('kornerden gol: orta + gol efekti, belirlenimli', () => {
    const p = cornerShot(SHOTS.goal);
    expect(flights(p)[0]!.style).toBe('cross');
    expect(p.effects.some((e) => e.kind === 'goal')).toBe(true);
    expect(cornerShot(SHOTS.goal)).toEqual(p);
  });
});

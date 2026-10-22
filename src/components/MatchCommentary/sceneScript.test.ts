import { describe, expect, it } from 'vitest';
import lineupSample from '@/services/sportmonks/__fixtures__/commentaryLineup19746587.json';
import { classifyScene, type CommentaryItem, type SceneSide } from '@/services/sportmonks/matchCommentary';
import { buildSceneSquads, type RawFormation, type RawLineupRow, type RawParticipant } from '@/services/sportmonks/commentaryScene';
import { SCENE_H, SCENE_W } from './sceneLayout';
import { buildScript, positionAt, rng, type SceneScript, type Track } from './sceneScript';

const lineup = lineupSample as { participants: RawParticipant[]; formations: RawFormation[]; lineups: RawLineupRow[] };
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;
const homeName = squads.home.players.find((p) => p.starter && p.pos === 'F')!.name;
const awayName = squads.away.players.find((p) => p.starter && p.pos === 'D')!.name;

/** Anlatım satırı kabuğu: sahne metinden, taraf elle (sunucuda resolveSceneSides yapıyor). */
const item = (en: string, { id = 7, side = 'home' }: { id?: number; side?: SceneSide } = {}): CommentaryItem => ({
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

const script = (en: string, opts?: { id?: number; side?: SceneSide }) => buildScript(item(en, opts), squads)!;
const end = (t: Track) => t.p[t.p.length - 1]!;
const increasing = (t: Track) => t.t.every((v, i) => i === 0 || v >= t.t[i - 1]!);

function allTracks(s: SceneScript): Track[] {
  return [...s.players.map((p) => p.track), s.ball.track, s.referee];
}

describe('buildScript — ortak', () => {
  it('belirlenimli: aynı satır aynı senaryo', () => {
    const en = `${homeName} takes a left-footed shot from outside the box, but it's saved.`;
    expect(script(en)).toEqual(script(en));
  });

  it('22 oyuncu, izler artan zamanlı, sahada ve süre içinde', () => {
    for (const en of [
      `Goal! ${homeName} scores, making it 1-0.`,
      'Corner awarded.',
      `Foul committed by ${awayName}.`,
      `${homeName} is caught offside.`,
      `${homeName} takes a right-footed shot, but it is blocked.`,
    ]) {
      const s = script(en);
      expect(s.players.length, en).toBeGreaterThanOrEqual(22);
      for (const t of allTracks(s)) {
        expect(increasing(t), en).toBe(true);
        expect(t.t.at(-1)!, en).toBeLessThanOrEqual(s.durationMs);
        for (const p of t.p) {
          expect(p.x).toBeGreaterThanOrEqual(-4);
          expect(p.x).toBeLessThanOrEqual(SCENE_W + 4);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(SCENE_H);
        }
      }
      expect(s.durationMs).toBeGreaterThan(2000);
      expect(s.durationMs).toBeLessThan(7000);
    }
  });

  it('oyuncular gerçekten hareket ediyor (statik diziliş değil)', () => {
    const s = script(`Goal! ${homeName} scores, making it 1-0.`);
    const moved = s.players.filter((p) => {
      const a = p.track.p[0]!;
      const b = end(p.track);
      return Math.hypot(a.x - b.x, a.y - b.y) > 20;
    });
    expect(moved.length).toBeGreaterThan(10);
  });

  it('sahnesi olmayan satır null', () => {
    const none: CommentaryItem = { ...item('Corner awarded.'), scene: null };
    expect(buildScript(none, squads)).toBeNull();
  });

  it('kadro yoksa varsayılan dizilişle kurulur', () => {
    const s = buildScript(item(`${homeName} takes a right-footed shot but misses.`), null)!;
    expect(s.players).toHaveLength(22);
  });

  it('rng [0,1) aralığında ve tohuma bağlı', () => {
    const a = rng(5);
    const b = rng(5);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('buildScript — olay türleri', () => {
  it('gol: paslarla başlar, top hücum edilen kalede biter, aktör vurgulu, gol efekti', () => {
    const s = script(`Goal! ${homeName} scores, making it 1-0.`);
    expect(s.trails.filter((t) => t.kind !== 'shot').length).toBeGreaterThanOrEqual(2);
    expect(s.trails.some((t) => t.kind === 'shot')).toBe(true);
    expect(end(s.ball.track).x).toBeGreaterThan(SCENE_W - 8);
    expect(s.effects.map((e) => e.kind)).toContain('goal');
    expect(s.players.filter((p) => p.actor).map((p) => p.name)).toEqual([homeName]);
  });

  it('deplasman golü sol kaleye', () => {
    const s = script(`Goal! ${awayName} scores, making it 0-1.`, { side: 'away' });
    expect(end(s.ball.track).x).toBeLessThan(8);
  });

  it('kurtarış: top kalecide, kurtarış efekti', () => {
    const s = script(`${homeName} takes a left-footed shot, but it's saved.`);
    const save = s.effects.find((e) => e.kind === 'save')!;
    expect(save).toBeTruthy();
    const keeper = s.players.find((p) => p.side === 'away' && p.goalkeeper)!;
    const at = positionAt(keeper.track, save.t);
    expect(Math.hypot(at.x - (save as { at: { x: number } }).at.x, 0)).toBeLessThan(2);
  });

  it('blok: savunmacı şut yoluna girer', () => {
    const s = script(`${homeName} takes a right-footed shot, but it is blocked.`);
    expect(s.effects.map((e) => e.kind)).toContain('block');
  });

  it('direk: direk efekti, top geri döner', () => {
    const s = script(`${homeName} takes a shot that hits the post.`);
    expect(s.effects.map((e) => e.kind)).toContain('post');
    expect(end(s.ball.track).x).toBeLessThan(SCENE_W - 30);
  });

  it('korner: top köşeden başlar, orta izi var', () => {
    const s = script('Corner awarded.');
    const first = s.ball.track.p[0]!;
    expect(first.x).toBeGreaterThan(SCENE_W - 10);
    expect(s.trails.some((t) => t.kind === 'cross')).toBe(true);
    expect(Math.max(...s.ball.lift)).toBeGreaterThan(20);
  });

  it('faul: faule uğrayan yere düşer, düdük ve hakem olay yerine koşar', () => {
    const s = script(`Foul committed by ${awayName}.`, { side: 'away' });
    const whistle = s.effects.find((e) => e.kind === 'whistle')!;
    expect(whistle).toBeTruthy();
    expect(s.players.some((p) => p.fallAt != null)).toBe(true);
    const ref = end(s.referee);
    const at = (whistle as { at: { x: number; y: number } }).at;
    expect(Math.hypot(ref.x - at.x, ref.y - at.y)).toBeLessThan(40);
    expect(s.players.find((p) => p.actor)!.name).toBe(awayName);
  });

  it('sarı kart: kart efekti, kırmızıda kırmızı', () => {
    const y = script(`${awayName} receives a yellow card.`, { side: 'away' });
    expect(y.effects.find((e) => e.kind === 'card')).toMatchObject({ red: false });
    const r = script(`${awayName} receives a red card.`, { side: 'away' });
    expect(r.effects.find((e) => e.kind === 'card')).toMatchObject({ red: true });
  });

  it('ofsayt: çizgi, bayrak, koşucu topu çizginin gerisinde alır', () => {
    const s = script(`${homeName} is caught offside.`);
    const line = s.effects.find((e) => e.kind === 'offsideLine') as { x: number };
    expect(line).toBeTruthy();
    expect(s.effects.map((e) => e.kind)).toContain('flag');
    const runner = s.players.find((p) => p.actor)!;
    expect(runner.name).toBe(homeName);
    expect(end(runner.track).x).toBeGreaterThan(line.x);
  });

  it('serbest vuruş: faule uğrayan vurgulu, düdük', () => {
    const s = script(`${homeName} wins a free kick in the attacking half.`);
    expect(s.players.find((p) => p.actor)!.name).toBe(homeName);
    expect(s.effects.map((e) => e.kind)).toContain('whistle');
  });

  it('değişiklik: çıkan kenara yürür, giren kenardan girer, tabela', () => {
    const bench = squads.home.players.find((p) => !p.starter)!.name;
    const s = script(`${bench} comes on for ${homeName}.`);
    expect(s.players.find((p) => p.goingOff)!.name).toBe(homeName);
    expect(s.players.find((p) => p.comingOn)).toBeTruthy();
    expect(end(s.players.find((p) => p.goingOff)!.track).y).toBeLessThan(20);
    expect(s.effects.map((e) => e.kind)).toContain('board');
  });
});

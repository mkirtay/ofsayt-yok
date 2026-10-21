import { describe, expect, it } from 'vitest';
import sample from './__fixtures__/commentarySuperLig.json';
import lineupSample from './__fixtures__/commentaryLineup19746587.json';
import { classifyScene, normalizeCommentary, type RawComment } from './matchCommentary';
import {
  buildSceneSquads,
  findPlayer,
  resolveSceneSides,
  type RawFormation,
  type RawLineupRow,
  type RawParticipant,
} from './commentaryScene';

// Gerçek yanıtlar (2026-10-21): anlatım 3 Süper Lig maçı / 202 satır; kadro Gençlerbirliği–Galatasaray 19746587
// (`fixtures/19746587?include=lineups;participants;formations`).
const matches = sample as Record<string, RawComment[]>;
const lineup = lineupSample as {
  participants: RawParticipant[];
  formations: RawFormation[];
  lineups: RawLineupRow[];
};
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;

describe('classifyScene — sahne türleri', () => {
  it.each([
    ["Gabriel Davi Gomes Sara takes a left-footed shot, but it's saved.", 'shot_saved'],
    ['Victor James Osimhen takes a right-footed shot, but it is blocked.', 'shot_blocked'],
    ['Mauro Icardi takes a shot with his left foot, but misses.', 'shot_off'],
    ['Goal! Yunus Akgün scores, making it 0-1.', 'goal'],
    ['Corner awarded.', 'corner'],
    ['Metehan Baltacı receives a yellow card.', 'card_yellow'],
    ['Red card shown to Metehan Baltacı.', 'card_red'],
    ['Barış Alper Yılmaz comes on for Yunus Akgün.', 'substitution'],
    ['Foul by Gabriel Davi Gomes Sara (Galatasaray).', 'foul'],
  ])('%s → %s', (text, type) => {
    expect(classifyScene(text, 1)?.type).toBe(type);
  });

  it('sahnesi olmayan satırlar: başlama, ofsayt, devre sonu, VAR', () => {
    for (const text of ['Kick-off! The referee is Resat Onur Coskunses.', 'Offside.', 'The first half ends with a score of 0-0.', 'VAR decision: Goal disallowed for offside against Mauro Icardi.']) {
      expect(classifyScene(text, 1)).toBeNull();
    }
  });

  it('direkten dönen vuruş post bayrağı taşır; kafa vuruşu header', () => {
    expect(classifyScene('Mauro Icardi takes a shot that hits the post.', 3)).toMatchObject({ type: 'shot_off', post: true });
    expect(classifyScene('Davinson Sánchez takes a header, but it is saved.', 3)).toMatchObject({ type: 'shot_saved', header: true });
  });

  it('kendi kalesine gol: aktör savunan oyuncu, ownGoal işaretli, bölge altı pas', () => {
    expect(classifyScene('Own goal by Deniz Gül puts the score at 1-0.', 5)).toMatchObject({
      type: 'goal',
      actors: ['Deniz Gül'],
      ownGoal: true,
      zone: 'six_yard',
    });
  });

  it('metinde bölge varsa ondan, yoksa kimlikten belirlenimli (aynı id → aynı bölge)', () => {
    const fromText = classifyScene("Scott McTominay takes a left-footed shot from outside the box, but it's saved.", 7);
    expect(fromText).toMatchObject({ zone: 'outside_box_centre', zoneFromText: true });

    const a = classifyScene("Victor Osimhen takes a right-footed shot, but it's saved.", 4242);
    const b = classifyScene("Victor Osimhen takes a right-footed shot, but it's saved.", 4242);
    expect(a!.zoneFromText).toBe(false);
    expect(a!.zone).toBe(b!.zone);
  });
});

describe('buildSceneSquads / findPlayer', () => {
  it('iki kadro, ev/deplasman participants.meta.location ile ayrılır', () => {
    expect(squads.home.name).toBe('Gençlerbirliği');
    expect(squads.away.name).toBe('Galatasaray');
    expect(squads.away.formation).toBe('4-2-3-1');
  });

  it('ilk 11 formation_field taşır, yedekler taşımaz', () => {
    const starters = squads.away.players.filter((p) => p.starter);
    expect(starters).toHaveLength(11);
    expect(starters.every((p) => p.row != null && p.col != null)).toBe(true);
    expect(squads.away.players.filter((p) => !p.starter).every((p) => p.row == null)).toBe(true);
  });

  it('Süper Lig kadrosunda forma numarası gelmiyor (jersey_number null)', () => {
    expect(squads.away.players.every((p) => p.number === null)).toBe(true);
  });

  it('ad eşleme aksanı ve ikinci adı yok sayar; kadroda olmayan ad null', () => {
    expect(findPlayer(squads, 'Davinson Sanchez')?.side).toBe('away');
    expect(findPlayer(squads, 'Victor James Osimhen')?.side).toBe('away');
    expect(findPlayer(squads, 'Lionel Messi')).toBeNull();
  });

  it('participants eksikse kadro yok (sahne varsayılan dizilişe düşer)', () => {
    expect(buildSceneSquads(lineup.lineups, [], lineup.formations)).toBeNull();
  });
});

describe('resolveSceneSides — taraf çözümü', () => {
  const items = resolveSceneSides(normalizeCommentary(matches['19746587']), squads);
  const byText = (needle: string) => items.find((i) => i.en.includes(needle))!;

  it('vuruşun tarafı oyuncunun kadrosundan gelir', () => {
    expect(byText('Gabriel Davi Gomes Sara takes a left-footed shot').scene?.side).toBe('away');
  });

  it('gol satırının tarafı skor değişiminden; kendi kalesine golde rakip taraf', () => {
    const goals = items.filter((i) => i.scene?.type === 'goal');
    expect(goals.length).toBeGreaterThan(0);
    expect(goals.every((g) => g.scene?.side != null)).toBe(true);
  });

  it('takımsız "Corner awarded." komşu vuruştan taraf alır', () => {
    const corners = items.filter((i) => i.scene?.type === 'corner');
    expect(corners.length).toBeGreaterThan(0);
    expect(corners.filter((c) => c.scene?.side != null).length).toBeGreaterThan(corners.length / 2);
  });

  it('girdi sırası sonucu değiştirmez (kronolojik işlenir)', () => {
    const shuffled = resolveSceneSides([...items].reverse(), squads);
    const sides = (list: typeof items) => list.map((i) => [i.id, i.scene?.side ?? null]).sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(sides(shuffled)).toEqual(sides(items));
  });

  it('kadro yoksa sahneler kalır; taraf yalnız goller (skor değişimi) ve onların korneri üzerinden bilinir', () => {
    const noSquad = resolveSceneSides(normalizeCommentary(matches['19746587']), null);
    expect(noSquad.filter((i) => i.scene).length).toBe(items.filter((i) => i.scene).length);
    const sided = noSquad.filter((i) => i.scene?.side != null);
    expect(sided.every((i) => i.scene!.type === 'goal' || i.scene!.type === 'corner')).toBe(true);
    expect(noSquad.filter((i) => i.scene?.type.startsWith('shot_') && i.scene.side != null)).toEqual([]);
  });
});

describe('sahne kapsamı — gerçek maçlarda satırların ne kadarı sahneye dönüyor', () => {
  it.each(Object.keys(matches))('%s: sahneli satırların oranı ve tarafı bilinenler raporlanır', (id) => {
    const items = resolveSceneSides(normalizeCommentary(matches[id]), id === '19746587' ? squads : null);
    const withScene = items.filter((i) => i.scene);
    // Sahneye dönmeyenler: başlama, ofsayt, devre/maç sonu, VAR — bunlar canlandırılmaz.
    const without = items.filter((i) => !i.scene);
    expect(without.every((i) => ['update', 'offside', 'var'].includes(i.kind))).toBe(true);
    expect(withScene.length / items.length).toBeGreaterThan(0.6);
  });

  it('19746587: sahneli satırların en az %80\'inde taraf çözülür', () => {
    const items = resolveSceneSides(normalizeCommentary(matches['19746587']), squads);
    const withScene = items.filter((i) => i.scene);
    const sided = withScene.filter((i) => i.scene!.side != null);
    expect(sided.length / withScene.length).toBeGreaterThanOrEqual(0.8);
  });
});

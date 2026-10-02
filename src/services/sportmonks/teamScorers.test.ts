import { describe, expect, it } from 'vitest';
import type { SportmonksSquadStatsRow } from './types';
import { extractTeamScorers, mergeTeamScorers, rankTeamScorers } from './teamScorers';

const row = (id: number, name: string, d: Record<number, number>, season = 1, team = 34): SportmonksSquadStatsRow => ({
  player_id: id,
  player: {
    id,
    display_name: name,
    statistics: [{ season_id: season, team_id: team, details: Object.entries(d).map(([t, v]) => ({ type_id: Number(t), value: { total: v } })) }],
  },
}) as SportmonksSquadStatsRow;

// 321 = maç sayısı (APPEARANCES), 52 = gol, 79 = asist
describe('teamScorers', () => {
  const sl = extractTeamScorers(
    [row(1, 'Osimhen', { 321: 6, 52: 6, 79: 2 }), row(2, 'Sara', { 321: 6, 52: 2, 79: 2 }), row(3, 'Jakobs', { 321: 5, 79: 1 }), row(4, 'Yedek', { 321: 1 })],
    1,
    34,
  );
  const ucl = extractTeamScorers([row(1, 'Osimhen', { 321: 1, 52: 1 }, 2), row(5, 'Batrakov', { 321: 1, 79: 1 }, 2)], 2, 34);

  it('yalnız gol ya da asisti olan oyuncular', () => {
    expect(sl.map((p) => [p.name, p.goals, p.assists])).toEqual([
      ['Osimhen', 6, 2],
      ['Sara', 2, 2],
      ['Jakobs', 0, 1],
    ]);
  });

  it('turnuvalar oyuncu bazında toplanır; gol ve asist sıralaması', () => {
    const all = mergeTeamScorers([sl, ucl]);
    expect(rankTeamScorers(all, 'goals').map((p) => [p.name, p.goals])).toEqual([
      ['Osimhen', 7],
      ['Sara', 2],
    ]);
    expect(rankTeamScorers(all, 'assists').map((p) => p.name)).toEqual(['Osimhen', 'Sara', 'Batrakov', 'Jakobs']);
  });
});

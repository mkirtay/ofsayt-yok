import { describe, expect, it } from 'vitest';
import { pickMiniStandingsRows } from './miniStandings';

const row = (rank: number) => ({ rank, points: 30 - rank, matches: 10, goal_diff: 0, won: 0, drawn: 0, lost: 0, name: `T${rank}` });

describe('pickMiniStandingsRows', () => {
  it('null/boş → []', () => {
    expect(pickMiniStandingsRows(null)).toEqual([]);
    expect(pickMiniStandingsRows({})).toEqual([]);
  });
  it('düz tablodan sıralı ilk N', () => {
    const rows = pickMiniStandingsRows({ table: [row(3), row(1), row(2), row(4)] }, 3);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });
  it('grup/aşama verisine düşer', () => {
    const rows = pickMiniStandingsRows({ stages: [{ groups: [{ standings: [] }, { standings: [row(1), row(2)] }] }] }, 8);
    expect(rows).toHaveLength(2);
  });
  it('orijinal diziyi mutasyona uğratmaz', () => {
    const table = [row(2), row(1)];
    pickMiniStandingsRows({ table });
    expect(table[0]!.rank).toBe(2);
  });
});

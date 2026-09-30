import { describe, expect, it } from 'vitest';
import { computeTeamStats } from './index';

const match = (homeId: number, awayId: number, score: string) =>
  ({ id: 1, status: 'FINISHED', time: '', home: { id: homeId, name: 'H' }, away: { id: awayId, name: 'A' }, scores: { score, ft_score: score } }) as never;

describe('computeTeamStats — Sportmonks boşluksuz skor ("1-0") ile form ve gol özeti', () => {
  // Gerçek: Kırklarelispor (4358) son 3 maç — İskenderunspor 0-1 (dep), Kırklarelispor 1-2 (ev), Erzincanspor 0-0 (dep)
  const matches = [match(1, 4358, '0-0'), match(4358, 2, '1-2'), match(3, 4358, '0-1')];

  it('form yeniden eskiye B M G, gol özeti dolu', () => {
    const s = computeTeamStats(matches, '4358', null);
    expect(s.form).toEqual(['D', 'L', 'W']);
    expect(s.matchCount).toBe(3);
    expect(s.goalsScored).toBe(2);
    expect(s.goalsConceded).toBe(2);
  });

  it('eski boşluklu format da çalışır; skorsuz maç atlanır', () => {
    const s = computeTeamStats([match(4358, 2, '2 - 0'), { id: 2, status: 'NOT STARTED', time: '', home: { id: 4358, name: 'H' }, away: { id: 2, name: 'A' } } as never], '4358', null);
    expect(s.form).toEqual(['W']);
    expect(s.matchCount).toBe(1);
  });
});

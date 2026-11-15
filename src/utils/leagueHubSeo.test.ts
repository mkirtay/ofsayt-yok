import { describe, expect, it } from 'vitest';
import { buildLeagueSummary } from './leagueHubSeo';

describe('buildLeagueSummary', () => {
  it('lider, takipçiler ve gol kralı', () => {
    const rows = [
      { rank: 2, points: 30, matches: 13, name: 'Fenerbahçe' },
      { rank: 1, points: 33, matches: 13, name: 'Galatasaray' },
      { rank: 3, points: 27, matches: 13, team: { name: 'Beşiktaş' }, name: '' },
    ];
    const s = buildLeagueSummary('Süper Lig', rows as never, [{ goals: 12, player: { name: 'Osimhen' }, team: { name: 'Galatasaray' } }]);
    expect(s).toEqual([
      'Süper Lig puan durumunda 13 maç sonunda lider Galatasaray (33 puan).',
      'Takipçileri: Fenerbahçe (30), Beşiktaş (27).',
      'Gol krallığında Osimhen (Galatasaray) 12 golle zirvede.',
    ]);
  });

  it('veri yoksa boş', () => {
    expect(buildLeagueSummary('X', null, null)).toEqual([]);
    expect(buildLeagueSummary('X', [], [{ goals: 0, player: { name: 'A' } }])).toEqual([]);
  });
});

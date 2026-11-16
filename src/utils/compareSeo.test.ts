import { describe, expect, it } from 'vitest';
import { buildCompareSentences, compareHeading } from './compareSeo';

describe('compareSeo', () => {
  it('karşılaşma özeti + son maç', () => {
    const s = buildCompareSentences({
      team1: 'Galatasaray',
      team2: 'Fenerbahçe',
      summary: {
        total: 10, team1Wins: 4, draws: 3, team2Wins: 3,
        rows: [{ date: '2026-04-12', homeName: 'Fenerbahçe', awayName: 'Galatasaray', score: '1-2', team1IsHome: false, winner: 'team1' }],
      },
    });
    expect(s[0]).toBe('Galatasaray ile Fenerbahçe arasındaki son 10 maçta Galatasaray 4, Fenerbahçe 3 kez kazandı; 3 maç berabere bitti.');
    expect(s[1]).toBe('Son karşılaşma: 12 Nisan 2026 tarihindeki Fenerbahçe 1-2 Galatasaray.');
    expect(compareHeading({ team1: 'A', team2: 'B' })).toBe('A - B: Aralarındaki Maçlar ve Karşılaştırma');
  });
  it('veri yoksa cümle yok', () => {
    expect(buildCompareSentences({ team1: 'A', team2: 'B', summary: null })).toEqual([]);
  });
});

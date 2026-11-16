import { describe, expect, it } from 'vitest';
import { buildRefereeSummary, buildRefereeTableSummary } from './refereeSeo';

describe('buildRefereeSummary', () => {
  it('sezon + lig + maç başı değerler, lig ortalaması karşılaştırması, takım kırılımı', () => {
    const out = buildRefereeSummary({
      name: 'Ali Şansalan',
      summary: {
        totalMatches: 120,
        seasonCount: 6,
        context: { seasonId: 1, seasonName: '2026/2027', leagueId: 600, matches: 7, rates: { yellow: 5.571, red: 0.29, penalties: 0.43, var: 1 }, leagueAvg: { yellow: 4.6, red: 0.2, penalties: 0.3, var: 1 } },
      },
      teams: {
        defaultSeason: '2026/2027',
        seasons: [{ seasonName: '2026/2027', matchCount: 7, rows: [
          { teamId: 1, name: 'Galatasaray', matches: 3, yellow: 9, red: 0, penaltiesFor: 1 },
          { teamId: 2, name: 'Rizespor', matches: 1, yellow: 2, red: 0, penaltiesFor: 0 },
        ] }],
      },
    });
    expect(out[0]).toBe('Ali Şansalan, 2026/2027 Süper Lig sezonunda 7 maç yönetti; maç başına 5,57 sarı kart, 0,29 kırmızı kart, 0,43 penaltı verdi. Aynı lig ve sezonda hakemlerin ortalaması maç başına 4,6 sarı kart.');
    expect(out[1]).toBe('Kayıtlarımızda 6 sezonda toplam 120 maçı var.');
    expect(out[2]).toBe('2026/2027 sezonunda 2 farklı takımın maçında görev aldı.');
    expect(out.join(' ')).not.toMatch(/en çok|en az|üzerinde|altında/i);
  });

  it('veri yoksa boş', () => {
    expect(buildRefereeSummary({ name: 'X', summary: { totalMatches: 0, seasonCount: 0, context: null }, teams: { seasons: [], defaultSeason: null } })).toEqual([]);
  });
});

describe('buildRefereeTableSummary', () => {
  it('hakem ve maç sayısı, maç sayısıyla ağırlıklı ortalama; sıralama / vurgu yok', () => {
    const out = buildRefereeTableSummary('Süper Lig', '2026/2027', [
      { matches: 0, yellowPerMatch: null, penaltiesPerMatch: null },
      { matches: 4, yellowPerMatch: 5, penaltiesPerMatch: 0.5 },
      { matches: 6, yellowPerMatch: 4, penaltiesPerMatch: 0 },
    ]);
    expect(out[0]).toBe('2026/2027 Süper Lig sezonunda 2 hakem toplam 10 maçta orta hakem olarak görev aldı; maç başına ortalama 4,4 sarı kart ve 0,2 penaltı.');
    expect(out.join(' ')).not.toMatch(/en çok|en az/i);
  });
});

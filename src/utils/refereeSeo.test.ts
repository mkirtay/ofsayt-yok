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
    expect(out[0]).toBe('Ali Şansalan, 2026/2027 Süper Lig sezonunda 7 maç yönetti; maç başına 5,57 sarı kart, 0,29 kırmızı kart, 0,43 penaltı verdi. Sarı kart ortalaması lig ortalamasının üzerinde (lig hakemleri: 4,6).');
    expect(out[1]).toBe('Kayıtlarımızda 6 sezonda toplam 120 maçı var.');
    expect(out[2]).toContain('en çok Galatasaray maçlarını yönetti (3 maç');
  });

  it('veri yoksa boş', () => {
    expect(buildRefereeSummary({ name: 'X', summary: { totalMatches: 0, seasonCount: 0, context: null }, teams: { seasons: [], defaultSeason: null } })).toEqual([]);
  });
});

describe('buildRefereeTableSummary', () => {
  it('en az 3 maç yönetenler arasından sarı kart / penaltı lideri, en çok maç yöneten', () => {
    const out = buildRefereeTableSummary('Süper Lig', '2026/2027', [
      { name: 'Tek Maçlık', matches: 1, yellowPerMatch: 9, penaltiesPerMatch: 2 },
      { name: 'Ali Şansalan', matches: 7, yellowPerMatch: 5.571, penaltiesPerMatch: 0.43 },
      { name: 'Halil Umut Meler', matches: 9, yellowPerMatch: 4.1, penaltiesPerMatch: 0.55 },
    ]);
    expect(out).toEqual([
      '2026/2027 Süper Lig sezonunda maç başına en çok sarı kart gösteren hakem Ali Şansalan (5,57; 7 maç).',
      'Maç başına en çok penaltı veren hakem Halil Umut Meler (0,55).',
      'En çok maç yöneten hakem Halil Umut Meler (9 maç).',
    ]);
  });
});

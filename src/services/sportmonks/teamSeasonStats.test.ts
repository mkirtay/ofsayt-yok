import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/teamStatistics.gs-2026.json';
import { combineSeasonStats, mapTeamSeasonStats, teamStatsFilters, type SportmonksTeamWithStatistics } from './teamSeasonStats';

// Gerçek yanıt (2026-10-02, GS: Süper Lig 28203 + Şampiyonlar Ligi 28155), yalnız kullanılan türler bırakıldı.
const stats = mapTeamSeasonStats(fixture as SportmonksTeamWithStatistics);
const sl = stats.find((s) => s.seasonId === 28203)!;
const ucl = stats.find((s) => s.seasonId === 28155)!;

describe('mapTeamSeasonStats (gerçek GS yanıtı)', () => {
  it('Süper Lig: maç listesiyle birebir (6 O, 4-1-1, 13-10, 2 gol yemeden), iç saha / deplasman', () => {
    expect(sl.leagueId).toBe(600);
    expect(sl.finished).toBe(false);
    expect(sl.total).toEqual({ played: 6, won: 4, drawn: 1, lost: 1, goalsFor: 13, goalsAgainst: 10, cleanSheets: 2 });
    expect(sl.home).toEqual({ played: 3, won: 2, drawn: 1, lost: 0, goalsFor: 6, goalsAgainst: 4, cleanSheets: 1 });
    expect(sl.away).toEqual({ played: 3, won: 2, drawn: 0, lost: 1, goalsFor: 7, goalsAgainst: 6, cleanSheets: 1 });
  });

  it('15 dakikalık dilimler: 6 dilim, toplamı atılan/yenilen gole eşit', () => {
    expect(sl.scoredByMinute).toEqual([1, 2, 2, 2, 3, 3]);
    expect(sl.concededByMinute).toEqual([1, 1, 2, 1, 3, 2]);
    expect(ucl.scoredByMinute.reduce((a, b) => a + b)).toBe(ucl.total.goalsFor);
  });

  it('Tümü = turnuvaların toplamı', () => {
    const all = combineSeasonStats(stats);
    expect(all.total).toEqual({ played: 7, won: 4, drawn: 1, lost: 2, goalsFor: 14, goalsAgainst: 13, cleanSheets: 2 });
    expect(all.scoredByMinute).toEqual([2, 2, 2, 2, 3, 3]);
    expect(all.finished).toBe(false);
  });
});

describe('teamStatsFilters', () => {
  it('sezon id\'leri sıralı ve tekil (aynı küme → aynı önbellek anahtarı)', () => {
    expect(teamStatsFilters([28203, 28155, 28203])).toBe('teamStatisticSeasons:28155,28203');
  });
});

describe('eksik/tuhaf veri', () => {
  it('maç oynanmamış sezon sıfır; 75 sonrası dilimler son dilime', () => {
    const [s] = mapTeamSeasonStats({
      id: 1,
      statistics: [
        { season_id: 9, details: [{ type_id: 196, value: { '75-90': { count: 1 }, '90-105': { count: 2 } } }], season: { id: 9, finished: true } },
      ],
    });
    expect(s!.total.played).toBe(0);
    expect(s!.scoredByMinute).toEqual([0, 0, 0, 0, 0, 3]);
    expect(s!.finished).toBe(true);
  });
});

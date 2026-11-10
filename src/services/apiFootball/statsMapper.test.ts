import { describe, expect, it } from 'vitest';
import assists from './__fixtures__/topassistsNationsLeague2026.json';
import scorers from './__fixtures__/topscorersNationsLeague2026.json';
import teamStats from './__fixtures__/teamStatisticsTurkeyNationsLeague2026.json';
import { mapTeamStatistics, mapTopScorers } from './statsMapper';

describe('mapTeamStatistics (gerçek AF cevabı: Türkiye, Uluslar Ligi 2026)', () => {
  const s = mapTeamStatistics(teamStats.response as never)!;
  it('G/B/M ve gol toplamları', () => {
    expect(s.total).toMatchObject({ played: 4, won: 0, drawn: 0, lost: 4, goalsFor: 2, cleanSheets: 0 });
    expect(s.home.played).toBe(2);
    expect(s.away.played).toBe(2);
    expect(s.total.goalsAgainst).toBeGreaterThan(0);
  });
  it('dakika dilimleri 6 dilim; toplam gol sayısına eşit', () => {
    expect(s.scoredByMinute).toHaveLength(6);
    expect(s.scoredByMinute.reduce((a, b) => a + b, 0)).toBe(2);
    expect(s.concededByMinute.reduce((a, b) => a + b, 0)).toBe(s.total.goalsAgainst);
  });
  it('oynanmış maç yoksa null', () => {
    expect(mapTeamStatistics({ fixtures: { played: { total: 0 } } })).toBeNull();
    expect(mapTeamStatistics(null)).toBeNull();
  });
});

describe('mapTopScorers', () => {
  const p = mapTopScorers(scorers.response as never, assists.response as never, 'UEFA Uluslar Ligi', 2_000_000_005, 2026)!;
  it('gol sırasına göre, oyuncu bir kez', () => {
    const list = p.topscorers!;
    expect(list[0]!.goals).toBeGreaterThanOrEqual(list[1]!.goals);
    const names = list.map((e) => e.player?.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('oyuncu id verilmez, takım id kaydırılır', () => {
    const e = p.topscorers![0]!;
    expect(e.player?.id).toBeUndefined();
    expect(e.team?.id).toBeGreaterThanOrEqual(2_000_000_000);
  });
  it('takım adı Türkçe', () => {
    expect(p.topscorers!.some((e) => e.team?.name === 'İngiltere')).toBe(true);
  });
  it('boş liste → null', () => {
    expect(mapTopScorers([], [], 'X', 1, 2026)).toBeNull();
  });
});

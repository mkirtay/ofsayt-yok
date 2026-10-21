import { describe, expect, it } from 'vitest';
import { seasonStatsFinished, summarizeSeasonStatistics, type RawSeasonWithStatistics } from './seasonStats';
import sl from './__fixtures__/seasonStatisticsSuperLig.json';
import ucl from './__fixtures__/seasonStatisticsUcl.json';
import tk from './__fixtures__/seasonStatisticsTurkishCup.json';

const rows = (f: { data: unknown }) => (f.data as RawSeasonWithStatistics).statistics ?? [];

describe('summarizeSeasonStatistics', () => {
  it('Süper Lig 2026/27: hafta özetiyle aynı alanlar + sezon kralları', () => {
    const s = summarizeSeasonStatistics(rows(sl))!;
    expect(s.played).toBe(72);
    expect(s.scheduled).toBe(306);
    expect(s.goals).toEqual({ total: 208, perMatch: 2.89, home: 121, away: 87 });
    expect(s.bothScored).toEqual({ count: 32, pct: 44.44 });
    expect(s.threePlusGoals).toEqual({ count: 42, pct: 58.33 });
    expect(s.cards).toEqual({ yellow: 285, red: 12, perMatch: 4.1 });
    expect(s.topScorer).toMatchObject({ id: 4125, goals: 8 });
    expect(s.topAssist).toMatchObject({ id: 35259800, assists: 4 });
    expect(s.topPlayer).toMatchObject({ id: 4125, rating: 7.94 });
    expect(s.topTeam).toMatchObject({ id: 88, name: 'Fenerbahçe', rating: 7.04 });
    expect(s.mostGoalsTeam).toMatchObject({ id: 88, goals: 22 });
    expect(s.mostConcededTeam).toMatchObject({ id: 3224, name: 'Eyüpspor', goals: 22 });
    expect(s.mostConcededTeam?.image).toMatch(/^https:\/\/cdn\.sportmonks\.com\/.+3224\.png$/);
    expect(s.topCards).toMatchObject({ id: 203954, cards: 3 });
    // display_name sonundaki bölünmez boşluk kırpılır
    expect(s.topCards?.name).toBe(s.topCards?.name.trim());
    expect(s.cleanSheetKeeper).toMatchObject({ id: 159142, cleanSheets: 5, games: 7 });
  });

  it('Şampiyonlar Ligi: kalecinin "2/2" gol yememe satırı gizli (en az 3)', () => {
    const s = summarizeSeasonStatistics(rows(ucl))!;
    expect(s.played).toBe(135);
    expect(s.cleanSheetKeeper).toBeNull();
    expect(s.topPlayer?.name).toBeTruthy();
    expect(s.mostConcededTeam).toMatchObject({ id: 2417, goals: 17 });
  });

  it('Türkiye Kupası: 0 sarı = eksik veri → kart kutusu yok; tek kartlık kart kralı gizli', () => {
    const s = summarizeSeasonStatistics(rows(tk))!;
    expect(s.played).toBe(51);
    expect(s.cards).toBeNull();
    expect(s.topCards).toBeNull();
    expect(s.cleanSheetKeeper).toBeNull();
    expect(s.topScorer).toMatchObject({ goals: 2 });
  });

  it('boş / oynanmamış sezon → null', () => {
    expect(summarizeSeasonStatistics([])).toBeNull();
    expect(summarizeSeasonStatistics(null)).toBeNull();
    expect(summarizeSeasonStatistics([{ type_id: 188, value: { total: 306, played: 0 } }])).toBeNull();
  });
});

describe('seasonStatsFinished', () => {
  it('finished bayrağı ya da bitişten 2 gün sonrası', () => {
    expect(seasonStatsFinished({ finished: true, ending_at: '2027-05-23' }, '2026-10-21')).toBe(true);
    expect(seasonStatsFinished({ finished: false, ending_at: '2027-05-23' }, '2026-10-21')).toBe(false);
    expect(seasonStatsFinished({ finished: false, ending_at: '2026-10-19' }, '2026-10-21')).toBe(true);
    expect(seasonStatsFinished({ finished: false, ending_at: '2026-10-20' }, '2026-10-21')).toBe(false);
    expect(seasonStatsFinished(null, '2026-10-21')).toBe(false);
  });
});

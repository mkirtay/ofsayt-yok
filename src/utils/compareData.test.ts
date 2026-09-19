import { describe, expect, it } from 'vitest';
import { pickCurrentSeasonId, statBarWidths, summarizeH2H } from './compareData';

describe('summarizeH2H', () => {
  const rows = [
    { date: '2025-11-09', home_name: 'Kocaelispor', away_name: 'Galatasaray', score: '1-0' },
    { date: '2026-09-13', home_name: 'Galatasaray', away_name: 'Kocaelispor', score: '1-0' },
    { date: '2026-04-12', home_name: 'Galatasaray', away_name: 'Kocaelispor', score: '1-1' },
    { date: '2020-01-01', home_name: 'Başka', away_name: 'Galatasaray', score: '3-0' },
    { date: '2019-01-01', home_name: 'Galatasaray', away_name: 'Kocaelispor', score: undefined },
  ];
  const s = summarizeH2H(rows, 'Kocaelispor', 'Galatasaray');

  it('perspektif team1; en yeni önce; eşleşmeyen/skorsuz satır atlanır', () => {
    expect(s.total).toBe(3);
    expect(s.rows.map((r) => r.date)).toEqual(['2026-09-13', '2026-04-12', '2025-11-09']);
    expect(s).toMatchObject({ team1Wins: 1, draws: 1, team2Wins: 1 });
    expect(s.rows[0]).toMatchObject({ team1IsHome: false, winner: 'team2' });
    expect(s.rows[2]).toMatchObject({ team1IsHome: true, winner: 'team1' });
  });
  it('limit uygulanır; boş girdi → total 0', () => {
    expect(summarizeH2H(rows, 'Kocaelispor', 'Galatasaray', 2).rows).toHaveLength(2);
    expect(summarizeH2H(undefined, 'a', 'b').total).toBe(0);
  });
});

describe('pickCurrentSeasonId', () => {
  it('kupa değil lig sezonunu seçer (kupa daha çok olsa bile lig varsa lig)', () => {
    const ms = [
      { season_id: 1, competition: { name: 'Champions League' } },
      { season_id: 1, competition: { name: 'Champions League' } },
      { season_id: 2, competition: { name: 'Super Lig' } },
    ];
    expect(pickCurrentSeasonId(ms)).toBe(2);
    expect(pickCurrentSeasonId([{ season_id: 1, competition: { name: 'Turkish Cup' } }])).toBe(1);
    expect(pickCurrentSeasonId([])).toBeNull();
  });
});

describe('statBarWidths', () => {
  it('yüzde: 0-100 skalası', () => expect(statBarWidths(0.4, 0.8, 'percent')).toEqual({ left: 40, right: 80 }));
  it('sayı: toplama oranlı', () => {
    expect(statBarWidths(3, 1, 'count')).toEqual({ left: 75, right: 25 });
    expect(statBarWidths(2, 2, 'count')).toEqual({ left: 50, right: 50 });
    expect(statBarWidths(0, 0, 'count')).toEqual({ left: 0, right: 0 });
  });
});

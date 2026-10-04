import { describe, expect, it } from 'vitest';
import { ageOn, coachSeasonTable, type RawCoach } from './coachStats';
import { currentTeamStint } from '@/server/people/coachPage';

const det = (k: string, count: number) => ({ value: { count }, type: { developer_name: k } });

describe('teknik direktör sezon tablosu (O. Buruk gerçek şekli)', () => {
  const raw: RawCoach = {
    statistics: [
      { season_id: 25682, team_id: 34, season: { name: '2025/2026', league_id: 600 }, team: { name: 'Galatasaray', image_path: 'gs.png' }, details: [det('MATCHES', 34), det('WIN', 24), det('DRAW', 5), det('LOST', 5)] },
      // Yalnız LOST gelen kayıt: galibiyet / beraberlik 0
      { season_id: 25001, team_id: 34, season: { name: '2024/2025', league_id: 2 }, team: { name: 'Galatasaray' }, details: [det('MATCHES', 2), det('LOST', 2)] },
      { season_id: 1, team_id: 3702, season: { name: '2019/2020', league_id: 5 }, team: { name: 'İstanbul Başakşehir' }, details: [] },
    ],
  };

  it('G-B-M ve galibiyet yüzdesi; eksik tür 0; maçsız kayıt düşer; yeni sezon önce', () => {
    expect(coachSeasonTable(raw)).toEqual([
      { seasonId: 25682, seasonName: '2025/2026', leagueId: 600, teamId: 34, teamName: 'Galatasaray', teamLogo: 'gs.png', matches: 34, wins: 24, draws: 5, losses: 5, winPct: 71 },
      { seasonId: 25001, seasonName: '2024/2025', leagueId: 2, teamId: 34, teamName: 'Galatasaray', matches: 2, wins: 0, draws: 0, losses: 2, winPct: 0 },
    ]);
  });

  it('yaş', () => {
    expect(ageOn('1973-10-19', '2026-10-04')).toBe(52);
    expect(ageOn('1973-10-04', '2026-10-04')).toBe(53);
    expect(ageOn(null, '2026-10-04')).toBeNull();
  });

  it('mevcut takım: bitmeyen görev; aynı takımdaki kesintisiz kayıtlar birleşir (göreve başlama ilk kayıt)', () => {
    const teams = [
      { team_id: 3702, start: '2019-06-01', end: '2021-06-30', team: { name: 'İstanbul Başakşehir' } },
      { team_id: 34, start: '2022-06-23', end: '2022-06-30', team: { name: 'Galatasaray' } },
      { team_id: 34, start: '2022-07-01', end: null, team: { name: 'Galatasaray', image_path: 'gs.png' } },
    ];
    expect(currentTeamStint(teams, '2026-10-04')).toEqual({ teamId: 34, since: '2022-06-23', name: 'Galatasaray', logo: 'gs.png' });
    expect(currentTeamStint([{ team_id: 3702, start: '2019-06-01', end: '2021-06-30' }], '2026-10-04')).toBeNull();
  });
});

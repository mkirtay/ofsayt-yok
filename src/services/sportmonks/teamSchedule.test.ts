import { describe, expect, it } from 'vitest';
import type { SportmonksFixture } from './types';
import { collectScheduleFixtures, isScheduleFinished, mapTeamSchedule, mergeSeasonMatches, type SportmonksScheduleStage } from './teamSchedule';
import { campaignSlug, selectableCampaigns, type TeamCampaign, type TeamSeasonRef } from './teamOverview';

const fx = (id: number, at: string, home = 34, away = 100 + id, goals: [number, number] = [1, 0]): SportmonksFixture =>
  ({
    id,
    starting_at: at,
    state_id: 5,
    league_id: 2,
    participants: [
      { id: home, name: `T${home}`, meta: { location: 'home' } },
      { id: away, name: `T${away}`, meta: { location: 'away' } },
    ],
    scores: [
      { description: 'CURRENT', score: { goals: goals[0], participant: 'home' } },
      { description: 'CURRENT', score: { goals: goals[1], participant: 'away' } },
    ],
  }) as SportmonksFixture;

// Gerçek GS 2025/26 ŞL / kupa şekli: lig aşaması rounds, eleme turları aggregates, tek maç stage.fixtures.
const stages: SportmonksScheduleStage[] = [
  { finished: true, rounds: [{ fixtures: [fx(1, '2025-09-17 19:00:00'), fx(2, '2025-10-01 19:00:00')] }] },
  { finished: true, aggregates: [{ fixtures: [fx(3, '2026-02-17 17:45:00'), fx(4, '2026-02-25 20:00:00', 200, 34)] }] },
  { finished: true, rounds: [{ fixtures: [], aggregates: [{ fixtures: [fx(5, '2026-03-10 17:45:00')] }] }] },
  { finished: true, fixtures: [fx(6, '2026-04-22 17:30:00'), fx(7, '2026-04-22 17:30:00', 300, 301)] },
];
const ucl: TeamSeasonRef = { id: 25580, name: '2025/2026', leagueId: 2, leagueName: 'Champions League', leagueLogo: 'ucl.png', isCurrent: false, finished: true };

describe('teamSchedule', () => {
  it('rounds + aggregates + stage.fixtures hepsi toplanır, tekil', () => {
    expect(collectScheduleFixtures([...stages, stages[0]!]).map((f) => f.id).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('yalnız takımın maçları; lig adı/logosu sezondan; en yeniden eskiye', () => {
    const out = mergeSeasonMatches([mapTeamSchedule(stages, ucl, 34)]);
    expect(out.map((m) => m.id)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(out[0]!.competition).toMatchObject({ id: 2, name: 'Champions League', logo: 'ucl.png' });
    expect(out[0]).toMatchObject({ status: 'FINISHED', scores: { score: '1-0' } });
  });

  it('bitmiş program: bütün aşamalar finished; boş program bitmiş sayılmaz', () => {
    expect(isScheduleFinished(stages)).toBe(true);
    expect(isScheduleFinished([...stages, { finished: false }])).toBe(false);
    expect(isScheduleFinished([])).toBe(false);
  });
});

describe('sezon seçici', () => {
  const season = (id: number, name: string, leagueId: number): TeamSeasonRef => ({ id, name, leagueId, isCurrent: false, finished: true });
  const camp = (name: string, ...ids: [number, number][]): TeamCampaign => ({ name, seasons: ids.map(([id, l]) => season(id, name, l)) });
  const campaigns = [
    camp('2026/2027', [28155, 2], [28203, 600]),
    camp('2025/2026', [25580, 2], [25682, 600], [26074, 606]),
    camp('2024/2025', [23619, 2], [23851, 600]),
    camp('2023/2024', [21638, 2], [22130, 5]),
    camp('2021/2022', [18346, 2]),
  ];

  it('yalnız ana ligin verisi olan sezonlar (UEFA\'dan ibaret eksik sezonlar yok), en çok 5', () => {
    expect(selectableCampaigns(campaigns, 600).map((c) => c.name)).toEqual(['2026/2027', '2025/2026', '2024/2025']);
    const many = Array.from({ length: 8 }, (_, i) => camp(`${2026 - i}/${2027 - i}`, [i, 600]));
    expect(selectableCampaigns(many, 600)).toHaveLength(5);
  });

  it('güncel sezonda ana lig yoksa bile güncel sezon başta; ana lig bilinmiyorsa yalnız güncel', () => {
    expect(selectableCampaigns([camp('2026/2027', [1, 2]), ...campaigns.slice(1)], 600).map((c) => c.name)).toEqual([
      '2026/2027',
      '2025/2026',
      '2024/2025',
    ]);
    expect(selectableCampaigns(campaigns, null).map((c) => c.name)).toEqual(['2026/2027']);
  });

  it('URL değeri', () => {
    expect(campaignSlug('2025/2026')).toBe('2025-2026');
  });
});

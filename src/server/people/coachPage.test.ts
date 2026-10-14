import { beforeEach, describe, expect, it, vi } from 'vitest';

// Teknik direktör sayfası: Sportmonks'a TEK `coaches/{id}` isteği (önce profil / istatistik / maçlar için üç ayrı istek).

const calls = vi.hoisted(() => ({ list: [] as { path: string; include?: string }[], multi: [] as number[][] }));
const response = vi.hoisted(() => ({ value: null as unknown, error: null as null | { status: number } }));

vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: async (_sport: string, path: string, params: { include?: string }) => {
    calls.list.push({ path, include: params?.include });
    if (response.error) throw response.error;
    return { data: response.value };
  },
}));
vi.mock('@/server/people/refereePage', async (orig) => {
  const actual = await orig<typeof import('@/server/people/refereePage')>();
  return {
    ...actual,
    loadMulti: async (ids: number[]) => {
      calls.multi.push(ids);
      return ids.map((id, i) => ({
        id,
        state_id: 5,
        starting_at: `2026-10-${String(10 - i).padStart(2, '0')} 17:00:00`,
        participants: [
          { id: 34, name: 'Galatasaray', meta: { location: 'home' } },
          { id: 88, name: 'Fenerbahçe', meta: { location: 'away' } },
        ],
        scores: [],
      }));
    },
  };
});

import { COACH_PAGE_INCLUDE, computeCoachPage } from './coachPage';

const fx = (id: number, day: number, state_id = 5) => ({ id, state_id, starting_at: `2026-${String(Math.ceil(day / 28)).padStart(2, '0')}-${String((day % 28) + 1).padStart(2, '0')} 17:00:00` });

const coach = {
  id: 199988,
  display_name: 'Okan Buruk',
  image_path: 'https://cdn.sportmonks.com/images/soccer/players/28/199988.png',
  date_of_birth: '1973-10-19',
  nationality: { name: 'Turkey', iso2: 'TR', image_path: 'https://cdn.sportmonks.com/images/countries/png/short/tr.png' },
  teams: [{ team_id: 34, start: '2022-06-30', end: null, team: { name: 'Galatasaray', image_path: 'https://cdn.sportmonks.com/images/soccer/teams/2/34.png' } }],
  statistics: [
    {
      team_id: 34,
      season_id: 25749,
      season: { id: 25749, name: '2025/2026', league_id: 600 },
      team: { id: 34, name: 'Galatasaray', image_path: 'https://cdn.sportmonks.com/images/soccer/teams/2/34.png' },
      details: [{ type_id: 214, value: { count: 20 }, type: { developer_name: 'WIN' } }],
    },
  ],
  // 12 biten + 1 başlamamış maç → en yeni 10 biten `fixtures/multi`'ye.
  fixtures: [...Array.from({ length: 12 }, (_, i) => fx(1000 + i, 200 + i)), fx(2000, 260, 1)],
};

describe('computeCoachPage — tek istek', () => {
  beforeEach(() => {
    calls.list = [];
    calls.multi = [];
    response.value = coach;
    response.error = null;
  });

  it('profil + istatistik + son maçlar tek `coaches/{id}` isteğinden; include dört parçayı içerir', async () => {
    const page = await computeCoachPage(199988);
    expect(calls.list).toEqual([{ path: '/coaches/199988', include: COACH_PAGE_INCLUDE }]);
    for (const part of ['nationality', 'teams.team:name,image_path', 'statistics.details.type:developer_name', 'statistics.season:name,league_id', 'statistics.team:name,image_path', 'fixtures:starting_at,state_id']) {
      expect(COACH_PAGE_INCLUDE.split(';')).toContain(part);
    }
    expect(page).not.toBe('missing');
    expect(page).not.toBeNull();
    const p = page as Exclude<typeof page, 'missing' | null>;
    expect(p.name).toBe('Okan Buruk');
    expect(p.nationality).toMatchObject({ name: 'Turkey', iso2: 'TR' });
    expect(p.currentTeam).toMatchObject({ id: 34, name: 'Galatasaray', since: '2022-06-30' });
    expect(p.seasons.length).toBeGreaterThan(0);
    // En yeni 10 biten maç (başlamamış 2000 yok), yeniden eskiye.
    expect(calls.multi).toHaveLength(1);
    expect(calls.multi[0]).toEqual(Array.from({ length: 10 }, (_, i) => 1011 - i));
    expect(p.recent).toHaveLength(10);
  });

  it('Sportmonks 404 / boş → missing; geçici hata → null (sayfa eski kopyada kalır)', async () => {
    response.error = { status: 404 };
    expect(await computeCoachPage(1)).toBe('missing');
    response.error = null;
    response.value = [];
    expect(await computeCoachPage(1)).toBe('missing');
    response.error = { status: 429 };
    expect(await computeCoachPage(1)).toBeNull();
    expect(calls.multi).toHaveLength(0);
  });
});

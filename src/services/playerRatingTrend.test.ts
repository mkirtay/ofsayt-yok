import { beforeEach, describe, expect, it, vi } from 'vitest';
import multiFixture from './sportmonks/__fixtures__/fixturesMultiRatings.json';

const calls = vi.hoisted(() => [] as Array<{ path: string; params: Record<string, unknown> }>);
const reply = vi.hoisted(() => ({ data: [] as unknown }));
vi.mock('./sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: async (_base: string, path: string, params: Record<string, unknown>) => {
    calls.push({ path, params });
    return { data: reply.data };
  },
}));

import {
  getFixturesForRatings,
  getTeamRecentFinishedFixtureIds,
  mapFixtureToPlayerMatchRow,
  PLAYER_RATING_FIXTURES_INCLUDE,
  type RawFixtureForPlayer,
} from './playerProfile';
import { buildRatingSeries } from '@/utils/ratingTrend';

beforeEach(() => {
  calls.length = 0;
});

describe('rating grafiği veri kaynağı — takım başına 2 istek', () => {
  it('maç id listesi: son 300 gün, yalnızca bitmiş, en yeni önce, ilk 20', async () => {
    reply.data = [
      { id: 3, starting_at: '2026-09-19 17:00:00' },
      { id: 1, starting_at: '2026-08-14 18:30:00' },
      { id: 2, starting_at: '2026-08-29 18:30:00' },
    ];
    const ids = await getTeamRecentFinishedFixtureIds(34, 20, new Date('2026-09-25T12:00:00Z'));
    expect(ids).toEqual([3, 2, 1]);
    expect(calls).toEqual([
      {
        path: '/fixtures/between/2025-11-29/2026-09-25/34',
        params: { select: 'starting_at,state_id', filters: 'fixtureStates:5', order: 'desc', per_page: 20 },
      },
    ]);
  });

  it('reytingler: TEK fixtures/multi isteği, yalnızca RATING (118) detayı', async () => {
    reply.data = multiFixture.data;
    const fixtures = await getFixturesForRatings([19746609, 19746637]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      path: '/fixtures/multi/19746609,19746637',
      params: { select: 'starting_at', include: PLAYER_RATING_FIXTURES_INCLUDE, filters: 'lineupDetailTypes:118' },
    });
    expect(fixtures).toHaveLength(2);
  });

  it('boş id listesi → istek yok', async () => {
    expect(await getFixturesForRatings([])).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('alan seçimli gerçek yanıt mevcut mapFixtureToPlayerMatchRow ile eşlenir (Osimhen 455805)', () => {
    const rows = (multiFixture.data as unknown as RawFixtureForPlayer[]).map((fx) => mapFixtureToPlayerMatchRow(fx, 455805, 34));
    const erz = rows.find((r) => r.matchId === 19746637)!;
    expect(erz).toMatchObject({ date: '2026-08-21', isHome: false, opponent: 'Erzurumspor FK', score: '0-4', inSquad: true, rating: 9.01 });
    expect(erz.opponentLogo).toContain('.png');
    const trb = rows.find((r) => r.matchId === 19746609)!;
    expect(trb).toMatchObject({ inSquad: false, opponent: 'Trabzonspor', score: '4-0' });
    expect(trb.rating).toBeUndefined();
    const s = buildRatingSeries(rows);
    expect(s).toMatchObject({ considered: 2, missing: 1 });
    expect(s.points.map((p) => p.rating)).toEqual([9.01]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ collect: vi.fn(), byDate: vi.fn(), live: vi.fn(), between: vi.fn() }));

vi.mock('@/services/sportmonksProviderFlag', async (orig) => ({
  ...(await orig<typeof import('@/services/sportmonksProviderFlag')>()),
  isSportmonksProviderEnabled: () => true,
}));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: h.collect, sportmonksClientRequest: vi.fn() }));
vi.mock('@/services/liveScoreService', () => ({
  getFixturesByDate: h.byDate,
  getAllLiveMatches: h.live,
  getAllMatchesByDate: h.between,
  getFixturesByCompetition: vi.fn(async () => []),
}));

import { homeDayFreshSeconds, istanbulDateOfKickoff, loadHomeDay, loadUpcomingMatchDays } from './homeDay';

const NOW = Date.parse('2026-09-30T13:00:00Z');

describe('homeDay', () => {
  beforeEach(() => {
    h.collect.mockReset();
    h.byDate.mockReset();
    h.live.mockReset();
    h.between.mockReset();
  });

  it('Sportmonks: aynı gün için tek fikstür isteği (between çağrılmaz)', async () => {
    h.byDate.mockResolvedValue([{ id: 1 }]);
    h.live.mockResolvedValue([]);
    const r = await loadHomeDay('2026-09-30');
    expect(r).toEqual({ date: '2026-09-30', fixtureMatches: [{ id: 1 }], liveMatches: [] });
    expect(h.between).not.toHaveBeenCalled();
  });

  it('CDN süresi: canlı maç 20 sn, maçsız gün 5 dk, sıradaki başlamaya kadar; geçmiş gün 1 sa', () => {
    const base = { date: '2026-09-30', fixtureMatches: [], liveMatches: [] };
    expect(homeDayFreshSeconds({ ...base, liveMatches: [{ id: 1, status: 'IN PLAY' } as never] }, '2026-09-30', NOW)).toBe(20);
    expect(homeDayFreshSeconds(base, '2026-09-30', NOW)).toBe(300);
    expect(
      homeDayFreshSeconds({ ...base, fixtureMatches: [{ status: 'NOT STARTED', date: '2026-09-30', scheduled: '13:17' } as never] }, '2026-09-30', NOW),
    ).toBe(120); // ±15 dk penceresine 2 dk var
    expect(
      homeDayFreshSeconds({ ...base, fixtureMatches: [{ status: 'NOT STARTED', date: '2026-09-30', scheduled: '13:10' } as never] }, '2026-09-30', NOW),
    ).toBe(30);
    expect(homeDayFreshSeconds({ ...base, date: '2026-09-20' }, '2026-09-30', NOW)).toBe(3600);
    expect(homeDayFreshSeconds({ ...base, date: '2026-10-05' }, '2026-09-30', NOW)).toBe(900);
  });

  it('başlama saati Türkiye gününe çevrilir (UTC 22:00 → ertesi gün)', () => {
    expect(istanbulDateOfKickoff('2026-10-08 22:00:00')).toBe('2026-10-09');
    expect(istanbulDateOfKickoff('2026-10-09 17:00:00')).toBe('2026-10-09');
  });

  it('sıradaki maç günü: lig başına ilk gün, takip edilmeyen lig ve seçili gün dışarıda; tek sorgu', async () => {
    h.collect.mockResolvedValue([
      { league_id: 8, starting_at: '2026-10-03 11:30:00' },
      { league_id: 8, starting_at: '2026-10-04 14:00:00' },
      { league_id: 600, starting_at: '2026-10-09 17:00:00' },
      { league_id: 9999, starting_at: '2026-10-01 17:00:00' },
    ]);
    expect(await loadUpcomingMatchDays('2026-09-30')).toEqual([
      { leagueId: 8, date: '2026-10-03' },
      { leagueId: 600, date: '2026-10-09' },
    ]);
    expect(h.collect).toHaveBeenCalledTimes(1);
    const opts = h.collect.mock.calls[0]![0];
    expect(opts.path).toBe('/fixtures/between/2026-10-01/2026-10-30');
    expect(opts.extraParams.order).toBe('asc');
    expect(opts.extraParams.filters).toMatch(/^fixtureLeagues:(\d+,)+\d+$/);
  });
});

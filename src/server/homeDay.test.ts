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

  it('Türkiye günü: UTC D−1 ve D listelerinden başlama saati Türkiye\'de D\'ye düşenler; between çağrılmaz', async () => {
    // Gerçek örnek (2026-09-30): NY RB – St. Louis 30 Eylül 23:30 UTC = 1 Ekim 02:30 Türkiye.
    const mls = { id: 19609828, status: 'NOT STARTED', date: '2026-09-30', scheduled: '23:30' };
    const afternoon = { id: 2, status: 'NOT STARTED', date: '2026-10-01', scheduled: '15:00' };
    const lateOct1 = { id: 3, status: 'NOT STARTED', date: '2026-10-01', scheduled: '21:15' }; // 2 Ekim 00:15 TR
    const earlySep30 = { id: 4, status: 'FINISHED', date: '2026-09-30', scheduled: '19:00' }; // 30 Eylül TR
    h.byDate.mockImplementation(async (d: string) => (d === '2026-09-30' ? [mls, earlySep30] : d === '2026-10-01' ? [afternoon, lateOct1] : []));
    h.live.mockResolvedValue([]);

    const oct1 = await loadHomeDay('2026-10-01');
    expect(oct1.fixtureMatches.map((m) => Number(m.id)).sort((a, b) => a - b)).toEqual([2, 19609828]);
    expect(h.byDate.mock.calls.map((c) => c[0]).sort()).toEqual(['2026-09-30', '2026-10-01']);

    const sep30 = await loadHomeDay('2026-09-30');
    expect(sep30.fixtureMatches.map((m) => m.id)).toEqual([4]); // MLS maçı artık 30 Eylül'de görünmez
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

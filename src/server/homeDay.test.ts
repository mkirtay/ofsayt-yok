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

import { homeDayFreshSeconds, istanbulDateOfKickoff, loadHomeDay, loadUpcomingMatchDays, normalizeUpcomingLeagueIds } from './homeDay';

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
    // UTC D+1: yalnız gece maçları için (anahtarı ertesi günün listesiyle ortak).
    expect(h.byDate.mock.calls.map((c) => c[0]).sort()).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);

    const sep30 = await loadHomeDay('2026-09-30');
    expect(sep30.fixtureMatches.map((m) => m.id)).toEqual([4]); // MLS maçı artık 30 Eylül'de görünmez
    expect(h.between).not.toHaveBeenCalled();
  });

  it('gece maçları: ertesi TR günü 00:00–06:00 (UTC D 21:00 – UTC D+1 03:00), iki UTC listesinden; ertesi günün listesinde de kalır', async () => {
    // Gerçek örnek (2026-10-02): São Paulo – Santos 2 Ekim 23:00 UTC = 3 Ekim 02:00 TR; Boca – Unión 3 Ekim 00:30 UTC = 03:30 TR.
    const mls = { id: 1, status: 'NOT STARTED', date: '2026-10-02', scheduled: '01:30' }; // 2 Ekim 04:30 TR → günün listesi
    const laLiga2 = { id: 2, status: 'NOT STARTED', date: '2026-10-02', scheduled: '18:30' };
    const saoPaulo = { id: 19621877, status: 'NOT STARTED', date: '2026-10-02', scheduled: '23:00' };
    const boca = { id: 19636615, status: 'NOT STARTED', date: '2026-10-03', scheduled: '00:30' };
    const lastNight = { id: 5, status: 'NOT STARTED', date: '2026-10-03', scheduled: '02:59' }; // 05:59 TR → gece
    const morning = { id: 6, status: 'NOT STARTED', date: '2026-10-03', scheduled: '03:00' }; // 06:00 TR → gece değil
    const afternoon = { id: 7, status: 'NOT STARTED', date: '2026-10-03', scheduled: '14:00' };
    h.byDate.mockImplementation(async (d: string) =>
      d === '2026-10-02' ? [mls, laLiga2, saoPaulo] : d === '2026-10-03' ? [boca, lastNight, morning, afternoon] : [],
    );
    h.live.mockResolvedValue([]);

    const oct2 = await loadHomeDay('2026-10-02');
    expect(oct2.fixtureMatches.map((m) => Number(m.id)).sort((a, b) => a - b)).toEqual([1, 2]);
    expect(oct2.nightMatches!.map((m) => Number(m.id))).toEqual([19621877, 19636615, 5]);

    const oct3 = await loadHomeDay('2026-10-03');
    expect(oct3.fixtureMatches.map((m) => Number(m.id)).sort((a, b) => a - b)).toEqual([5, 6, 7, 19621877, 19636615]);
    expect(oct3.nightMatches).toEqual([]);
  });

  it('CDN süresi: gece maçı başlamak üzereyse liste de kısa süreli', () => {
    const base = { date: '2026-09-30', fixtureMatches: [], liveMatches: [] };
    const night = { status: 'NOT STARTED', date: '2026-09-30', scheduled: '13:10' } as never;
    expect(homeDayFreshSeconds({ ...base, nightMatches: [night] }, '2026-09-30', NOW)).toBe(30);
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

  it('sıradaki maç günü ("Tümü"): planımızdaki BÜTÜN ligler, lig süzgeçsiz tek sayfa; plan dışı lig ve seçili gün dışarıda', async () => {
    h.collect.mockResolvedValue([
      { league_id: 779, starting_at: '2026-09-30 23:30:00' }, // MLS — TR'de 1 Ekim 02:30
      { league_id: 1283, starting_at: '2026-10-03 10:00:00' }, // 2. Lig Kırmızı
      { league_id: 8, starting_at: '2026-10-03 11:30:00' },
      { league_id: 8, starting_at: '2026-10-04 14:00:00' },
      { league_id: 9999, starting_at: '2026-10-01 17:00:00' },
      { league_id: 600, starting_at: '2026-09-30 17:00:00' }, // seçili gün (TR 30 Eylül) → dışarıda
    ]);
    expect(await loadUpcomingMatchDays('2026-09-30')).toEqual([
      { leagueId: 779, date: '2026-10-01' },
      { leagueId: 8, date: '2026-10-03' },
      { leagueId: 1283, date: '2026-10-03' },
    ]);
    expect(h.collect).toHaveBeenCalledTimes(1);
    const opts = h.collect.mock.calls[0]![0];
    expect(opts.path).toBe('/fixtures/between/2026-09-30/2026-10-30');
    expect(opts.extraParams).toEqual({ order: 'asc' });
    expect(opts.maxPages).toBe(1);
  });

  it('sıradaki maç günü (lig filtresi): lig başına ayrı takvim (anahtar lig + gün), sonuç birleştirilir', async () => {
    h.collect.mockClear();
    h.collect.mockImplementation(async (opts: { extraParams: { filters: string } }) => {
      if (opts.extraParams.filters === 'fixtureLeagues:600') return [{ league_id: 600, starting_at: '2026-10-09 17:00:00' }];
      if (opts.extraParams.filters === 'fixtureLeagues:8')
        return [
          { league_id: 8, starting_at: '2026-09-30 14:00:00' }, // seçili gün → dışarıda
          { league_id: 8, starting_at: '2026-10-10 11:30:00' },
        ];
      return [];
    });
    const NOW = Date.parse('2026-09-30T09:00:00Z');
    expect(await loadUpcomingMatchDays('2026-09-30', [8, 600], NOW)).toEqual([
      { leagueId: 600, date: '2026-10-09' },
      { leagueId: 8, date: '2026-10-10' },
    ]);
    expect(h.collect).toHaveBeenCalledTimes(2);
    for (const [opts] of h.collect.mock.calls as Array<[{ path: string; extraParams: Record<string, string>; maxPages: number }]>) {
      // Seçili günden bağımsız pencere: farklı `from` ve farklı lig kombinasyonları aynı girdileri paylaşır.
      expect(opts.path).toBe('/fixtures/between/2026-09-29/2026-11-14');
      expect(opts.extraParams.filters).toMatch(/^fixtureLeagues:\d+$/);
      expect(opts.extraParams.include).toBeUndefined();
      expect(opts.maxPages).toBe(3);
    }
    // Başka bir seçili gün, aynı lig → aynı anahtar (aynı path + filters)
    h.collect.mockClear();
    await loadUpcomingMatchDays('2026-10-05', [600], NOW);
    expect((h.collect.mock.calls[0]![0] as { path: string }).path).toBe('/fixtures/between/2026-09-29/2026-11-14');
    h.collect.mockClear();
    expect(await loadUpcomingMatchDays('2026-09-30', [], NOW)).toEqual([]);
    expect(h.collect).not.toHaveBeenCalled();
  });

  it('normalizeUpcomingLeagueIds: plan dışı atılır, sıralı ve tekil', () => {
    expect(normalizeUpcomingLeagueIds(null)).toBeNull();
    expect(normalizeUpcomingLeagueIds([600, 8, 600, 9999])).toEqual([8, 600]);
    expect(normalizeUpcomingLeagueIds([9999])).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

/**
 * `loadHomeInitialData`: API route'larının kullandığı yükleyicileri çağırır (ek Sportmonks isteği yok), kupa maçı
 * varsa kademe haritasını, boş günde sıradaki maç günlerini ekler; upstream hatasında fırlatır.
 */
const state = vi.hoisted(() => ({
  day: { date: '2026-10-06', fixtureMatches: [] as Match[], liveMatches: [] as Match[] },
  upcoming: [] as { leagueId: number; date: string }[],
  tiers: { payload: { tiers: { '1': 600 }, validFrom: '2026-07-01' }, complete: true },
  standings: { table: [{ rank: 1 }] } as unknown,
  failed: false,
  calls: [] as string[],
}));

vi.mock('@/server/homeDay', () => ({
  loadHomeDay: vi.fn(async (date: string) => {
    state.calls.push(`day:${date}`);
    return state.day;
  }),
  loadUpcomingMatchDays: vi.fn(async (from: string) => {
    state.calls.push(`upcoming:${from}`);
    return state.upcoming;
  }),
}));
vi.mock('@/server/turkeyTeamTiers', () => ({
  loadTurkeyTeamTiers: vi.fn(async () => {
    state.calls.push('tiers');
    return state.tiers;
  }),
}));
vi.mock('@/hooks/useCompetitionSidebar', () => ({
  loadCompetitionSidebar: vi.fn(async (id: number) => {
    state.calls.push(`sidebar:${id}`);
    return { seasons: [{ id: 1, name: '2026/2027' }], selectedSeasonId: 1, standings: state.standings };
  }),
}));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: vi.fn(async (fn: () => Promise<unknown>) => ({ value: await fn(), stale: false, failed: state.failed })),
}));
vi.mock('@/server/livescoreInternalAxios', () => ({ livescoreServerClient: () => ({}) }));
vi.mock('@/services/liveScoreHttpContext', () => ({ runWithLiveScoreHttpClient: (_c: unknown, fn: () => Promise<unknown>) => fn() }));
vi.mock('@/utils/cupTeamTier', () => ({
  isTurkishCupMatch: (m: Match) => Number(m.competition?.id) === 606,
}));

function fixture(id: number, leagueId: number): Match {
  return {
    id,
    status: 'NOT STARTED',
    time: '',
    date: '2026-10-06',
    scheduled: '15:00',
    home: { id: 1, name: 'A', logo: '' },
    away: { id: 2, name: 'B', logo: '' },
    competition: { id: leagueId, name: 'X', logo: '' },
  } as Match;
}

afterEach(() => {
  state.calls = [];
  state.failed = false;
  state.day.fixtureMatches = [];
  state.day.liveMatches = [];
  state.standings = { table: [{ rank: 1 }] };
});

describe('loadHomeInitialData', () => {
  it('kupa maçı varsa kademe haritası gömülür; sıradaki maç günü çekilmez', async () => {
    state.day.fixtureMatches = [fixture(1, 606), fixture(2, 600)];
    const { loadHomeInitialData } = await import('./homeInitialData');
    const { data } = await loadHomeInitialData('2026-10-06', 6);
    expect(data.cupTiers).toEqual(state.tiers.payload);
    expect(data.upcoming).toBeNull();
    expect(data.matches.fixtures).toHaveLength(2);
    expect(state.calls).toEqual(expect.arrayContaining(['day:2026-10-06', 'sidebar:6', 'tiers']));
    expect(state.calls).not.toContain('upcoming:2026-10-06');
  });

  it('boş gün → sıradaki maç günleri (boş liste de gömülür), kupa haritası yok', async () => {
    const { loadHomeInitialData } = await import('./homeInitialData');
    const { data, revalidate } = await loadHomeInitialData('2026-09-30', 6);
    expect(data.upcoming).toEqual([]);
    expect(data.cupTiers).toBeNull();
    expect(revalidate).toBeGreaterThanOrEqual(30);
    // Props deterministik: zaman damgası yok.
    expect(JSON.stringify(data)).not.toMatch(/\d{13}/);
  });

  it('upstream hatası + hiç maç verisi yok → fırlatır (Next son başarılı sayfayı korur)', async () => {
    state.failed = true;
    const { loadHomeInitialData, HomeInitialDataError } = await import('./homeInitialData');
    await expect(loadHomeInitialData('2026-10-06', 6)).rejects.toBeInstanceOf(HomeInitialDataError);
  });

  it('hata yokken boş puan tablosu (sezon öncesi) normal içeriktir', async () => {
    state.standings = null;
    state.day.fixtureMatches = [fixture(1, 600)];
    const { loadHomeInitialData } = await import('./homeInitialData');
    const { data } = await loadHomeInitialData('2026-10-06', 6);
    expect(data.sidebar?.data.standings).toBeNull();
  });
});

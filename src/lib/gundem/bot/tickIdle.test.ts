import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ byDate: vi.fn(), failed: false }));

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/livescoreCache', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn(), sportmonksClientRequest: vi.fn() }));
vi.mock('@/services/liveScoreService', () => ({ getFixturesByDate: h.byDate }));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), stale: false, failed: h.failed }),
}));

import { hasActiveTrackedFixtures, runBotTick } from './tick';

const NOW = new Date('2026-09-30T13:00:00Z');
const m = (leagueId: number, status: string, scheduled: string, date = '2026-09-30') => ({
  id: 1,
  status,
  date,
  scheduled,
  competition: { id: leagueId, name: '' },
});

describe('bot-tick — aktif maç yoksa inplay\'e gitmez', () => {
  beforeEach(() => {
    h.byDate.mockReset();
    h.failed = false;
  });

  it('shouldPoll false → fetchInplay çağrılmaz, idle', async () => {
    const fetchInplay = vi.fn(async () => []);
    const r = await runBotTick({ fetchInplay, getScorers: async () => null, shouldPoll: async () => false, now: () => NOW });
    expect(r.idle).toBe(true);
    expect(fetchInplay).not.toHaveBeenCalled();
  });

  it('takip edilen ligde yalnız akşam maçı → aktif değil; dün ve bugün listesine bakar', async () => {
    h.byDate.mockImplementation(async (d: string) => (d === '2026-09-30' ? [m(600, 'NOT STARTED', '19:00')] : []));
    expect(await hasActiveTrackedFixtures(NOW)).toBe(false);
    expect(h.byDate.mock.calls.map((c) => c[0]).sort()).toEqual(['2026-09-29', '2026-09-30']);
  });

  it('takip edilen ligde canlı ya da 15 dk içinde başlayacak maç → aktif', async () => {
    h.byDate.mockImplementation(async (d: string) => (d === '2026-09-30' ? [m(600, 'NOT STARTED', '13:10')] : []));
    expect(await hasActiveTrackedFixtures(NOW)).toBe(true);
    h.byDate.mockImplementation(async (d: string) => (d === '2026-09-29' ? [m(600, 'IN PLAY', '23:30', '2026-09-29')] : []));
    expect(await hasActiveTrackedFixtures(NOW)).toBe(true);
  });

  it('takip edilmeyen ligdeki canlı maç bot\'u uyandırmaz', async () => {
    h.byDate.mockResolvedValue([m(99999, 'IN PLAY', '12:30')]);
    expect(await hasActiveTrackedFixtures(NOW)).toBe(false);
  });

  it('fikstür listesi alınamadıysa güvenli taraf: poll et', async () => {
    h.byDate.mockResolvedValue([]);
    h.failed = true;
    expect(await hasActiveTrackedFixtures(NOW)).toBe(true);
  });
});

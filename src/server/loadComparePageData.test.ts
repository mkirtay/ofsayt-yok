/** Karşılaştırma: bölüm hatası "veri yok" sayılmaz — `failed` işaretlenir (API kısa önbellek, sayfa "tekrar dene"). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

const svc = vi.hoisted(() => ({ h2h: vi.fn(), last: vi.fn(), scorers: vi.fn() }));
vi.mock('@/services/liveScoreService', () => ({
  getTeamsHead2Head: svc.h2h,
  fetchTeamLastMatches: svc.last,
  getTeamTopScorers: svc.scorers,
}));

import { loadComparePageData } from './loadComparePageData';

const match = (homeId: number, awayId: number) =>
  ({
    id: 1,
    status: 'FINISHED',
    date: '2026-10-01',
    home: { id: homeId, name: `T${homeId}` },
    away: { id: awayId, name: `T${awayId}` },
    scores: { score: '1 - 0' },
  }) as unknown as Match;

beforeEach(() => {
  svc.h2h.mockReset();
  svc.last.mockReset();
  svc.scorers.mockReset().mockResolvedValue([]);
});

describe('loadComparePageData', () => {
  it('tam veri: failed alanı yok', async () => {
    svc.h2h.mockResolvedValue(null);
    svc.last.mockImplementation(async (id: string) => [match(Number(id), 99)]);
    const data = await loadComparePageData(1, 2);
    expect(data?.failed).toBeUndefined();
  });

  it('karşılaşma geçmişi hatası: failed.h2h, son maçlar yine dolu', async () => {
    svc.h2h.mockRejectedValue(new Error('504'));
    svc.last.mockImplementation(async (id: string) => [match(Number(id), 99)]);
    const data = await loadComparePageData(1, 2);
    expect(data?.failed).toEqual({ h2h: true });
    expect(data?.team1.recentMatches).toHaveLength(1);
    expect(data?.team1.teamName).toBe('T1');
  });

  it('bir takımın son maçları hatalı: yalnız o bölüm işaretli', async () => {
    svc.h2h.mockResolvedValue(null);
    svc.last.mockImplementation(async (id: string) => {
      if (id === '2') throw new Error('429');
      return [match(Number(id), 99)];
    });
    const data = await loadComparePageData(1, 2);
    expect(data?.failed).toEqual({ team2Recent: true });
  });

  it('hiçbir bölüm alınamadı: fırlatır ("Takım #id" boş kopyası önbelleğe girmez)', async () => {
    svc.h2h.mockRejectedValue(new Error('504'));
    svc.last.mockRejectedValue(new Error('504'));
    await expect(loadComparePageData(1, 2)).rejects.toThrow('504');
  });
});

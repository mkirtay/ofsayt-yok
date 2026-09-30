import { describe, expect, it, vi } from 'vitest';
import { loadTurkeyTeamTiers } from './turkeyTeamTiers';

const table = (teamIds: number[], seasonId: number) =>
  ({ season: { id: seasonId }, table: teamIds.map((id, i) => ({ rank: i + 1, team: { id, name: `T${id}` } })) }) as never;

const tables: Record<number, never> = {
  600: table([1, 2], 28203),
  603: table([3, 4], 27982),
  1282: table([5], 29112),
  1283: table([6, 7], 29113),
};

describe('loadTurkeyTeamTiers — takım başına istek yok, 4 tablodan harita', () => {
  it('her takımı kendi Sportmonks league_id\'sine eşler; sezon başlangıcından validFrom üretir', async () => {
    const getTable = vi.fn(async (id: number) => tables[id] ?? null);
    const getSeasonStart = vi.fn(async () => '2026-08-07');
    const r = await loadTurkeyTeamTiers({ getTable, getSeasonStart });
    expect(r.complete).toBe(true);
    expect(r.payload.tiers).toEqual({ '1': 600, '2': 600, '3': 603, '4': 603, '5': 1282, '6': 1283, '7': 1283 });
    expect(r.payload.validFrom).toBe('2026-07-01');
    expect(getTable).toHaveBeenCalledTimes(4); // lig sayısı kadar — takım sayısından bağımsız
    expect(getSeasonStart).toHaveBeenCalledTimes(1);
  });

  it('bir lig okunamazsa kalan ligler dönülür, complete=false (kısa CDN süresi)', async () => {
    const r = await loadTurkeyTeamTiers({
      getTable: async (id) => (id === 1283 ? null : tables[id] ?? null),
      getSeasonStart: async () => null,
    });
    expect(r.complete).toBe(false);
    expect(r.payload.tiers['6']).toBeUndefined();
    expect(r.payload.tiers['1']).toBe(600);
    expect(r.payload.validFrom).toBeUndefined();
  });

  it('hiçbir tablo yoksa (sezon geçişi/upstream hatası) boş harita — uç nokta bunu cache\'lemez', async () => {
    const r = await loadTurkeyTeamTiers({
      getTable: async () => {
        throw new Error('boom');
      },
      getSeasonStart: async () => null,
    });
    expect(r.payload.tiers).toEqual({});
    expect(r.complete).toBe(false);
  });
});

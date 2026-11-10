import { describe, expect, it, vi } from 'vitest';
import assists from '@/services/apiFootball/__fixtures__/topassistsNationsLeague2026.json';
import scorers from '@/services/apiFootball/__fixtures__/topscorersNationsLeague2026.json';
import teamStats from '@/services/apiFootball/__fixtures__/teamStatisticsTurkeyNationsLeague2026.json';

vi.mock('@/server/swrCache', () => ({
  loadWithSwr: async (_k: string, _o: unknown, compute: () => Promise<unknown>) => {
    const value = await compute();
    return value == null ? null : { value, state: 'computed' };
  },
}));

import { loadNationalScorers, loadNationalTeamStats } from './nationalStats';

const TEAM = '2000000777';
const LEAGUE = '2000000005';

describe('takım istatistiği', () => {
  it('tek istek, doğru parametreler, eşlenmiş sonuç', async () => {
    const get = vi.fn(async () => teamStats) as never;
    const r = await loadNationalTeamStats(TEAM, LEAGUE, 2026, get);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/teams/statistics', { league: 5, season: 2026, team: 777 });
    expect(r.kind === 'found' && r.data.total.played).toBe(4);
  });
  it('AF hatası → error (veri yok ile karışmaz)', async () => {
    const get = vi.fn(async () => { throw new Error('boom'); }) as never;
    expect((await loadNationalTeamStats(TEAM, LEAGUE, 2026, get)).kind).toBe('error');
  });
  it('izlenmeyen turnuva / geçersiz sezon → AF çağrılmaz', async () => {
    const get = vi.fn() as never;
    expect((await loadNationalTeamStats(TEAM, '2000000203', 2026, get)).kind).toBe('missing');
    expect((await loadNationalTeamStats(TEAM, LEAGUE, 1, get)).kind).toBe('missing');
    expect(get).not.toHaveBeenCalled();
  });
});

describe('gol krallığı', () => {
  it('iki istek (gol + asist), birleşik liste', async () => {
    const get = vi.fn(async (path: string) => (path === '/players/topscorers' ? scorers : assists)) as never;
    const r = await loadNationalScorers(LEAGUE, 2026, get);
    expect(get).toHaveBeenCalledTimes(2);
    expect(r.kind === 'found' && r.data.topscorers!.length).toBeGreaterThanOrEqual(20);
  });
  it('asist isteği düşerse gol listesi yine gelir', async () => {
    const get = vi.fn(async (path: string) => {
      if (path === '/players/topassists') throw new Error('x');
      return scorers;
    }) as never;
    expect((await loadNationalScorers(LEAGUE, 2026, get)).kind).toBe('found');
  });
  it('gol isteği düşerse error', async () => {
    const get = vi.fn(async () => { throw new Error('x'); }) as never;
    expect((await loadNationalScorers(LEAGUE, 2026, get)).kind).toBe('error');
  });
});

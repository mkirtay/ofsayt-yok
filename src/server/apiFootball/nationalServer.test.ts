import { beforeEach, describe, expect, it, vi } from 'vitest';
import ucl from '@/services/apiFootball/__fixtures__/fixtureNationsLeagueTurIta_1528905.json';
import friendly from '@/services/apiFootball/__fixtures__/fixtureNationsLeagueTurHun_1316553.json';
import standingsJson from '@/services/apiFootball/__fixtures__/standingsNationsLeague2024Groups.json';

vi.mock('@/server/swrCache', () => ({
  // Redis yok: her seferinde üret (gerçek SWR ayrıca swrCache.test.ts'te).
  loadWithSwr: async (_k: string, _o: unknown, compute: () => Promise<unknown>) => {
    const value = await compute();
    return value == null ? null : { value, state: 'computed' };
  },
}));

import { loadNationalDay, nationalDayFreshSeconds } from './nationalDay';
import { loadNationalStandings, mapStandings } from './nationalStandings';
import { loadNationalLive } from './nationalMatch';
import type { AfFixture } from '@/services/apiFootball/types';

const fx = (j: unknown) => (j as { response: AfFixture[] }).response[0]!;
const env = (response: unknown[]) => ({ response, errors: [] });

describe('günün milli maçları', () => {
  it('yalnız izlenen turnuvalar (kulüp / genç / bilinmeyen ligler elenir), Türkçe ad, tek istek', async () => {
    const club = { ...fx(ucl), league: { ...fx(ucl).league, id: 203, name: 'Süper Lig' } };
    const get = vi.fn(async () => env([fx(ucl), club])) as never;
    const r = await loadNationalDay('2026-09-28', get, '2026-09-28');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith('/fixtures', { date: '2026-09-28', timezone: 'Europe/Istanbul' });
    expect(r.ok && r.matches).toHaveLength(1);
    expect(r.ok && r.matches[0]!.competition?.name).toBe('UEFA Uluslar Ligi');
  });
  it('genç / kadın / olimpiyat takımları elenir', async () => {
    const u20 = { ...fx(ucl), teams: { ...fx(ucl).teams, home: { ...fx(ucl).teams.home, name: 'Brazil U20' } } };
    const women = { ...fx(ucl), teams: { ...fx(ucl).teams, away: { ...fx(ucl).teams.away, name: 'Japan W' } } };
    const get = vi.fn(async () => env([u20, women, fx(ucl)])) as never;
    const r = await loadNationalDay('2026-09-28', get, '2026-09-28');
    expect(r.ok && r.matches).toHaveLength(1);
  });
  it('AF hatası → ok:false (boş liste ile karışmaz)', async () => {
    const get = vi.fn(async () => { throw new Error('boom'); }) as never;
    expect(await loadNationalDay('2026-09-28', get, '2026-09-28')).toEqual({ ok: false });
  });
  it('tazelik: bugün 60 sn, komşu gün 5 dk, geçmiş 1 sa, gelecek 15 dk', () => {
    expect(nationalDayFreshSeconds('2026-11-10', '2026-11-10')).toBe(60);
    expect(nationalDayFreshSeconds('2026-11-11', '2026-11-10')).toBe(300);
    expect(nationalDayFreshSeconds('2026-11-01', '2026-11-10')).toBe(3600);
    expect(nationalDayFreshSeconds('2026-11-20', '2026-11-10')).toBe(900);
  });
});

describe('milli puan durumu', () => {
  it('gruplu tablo: kaydırılmış id, grup adı, form dizisi', () => {
    const league = (standingsJson as unknown as { response: Array<{ league: never }> }).response[0]!.league;
    const t = mapStandings({ league });
    expect(t?.stages?.[0]?.groups?.length).toBeGreaterThan(1);
    const row = t!.stages![0]!.groups![0]!.standings![0]!;
    expect(row.team_id).toBeGreaterThanOrEqual(2_000_000_000);
    expect(typeof row.points).toBe('number');
  });
  it('listede olmayan lig → missing, AF çağrılmaz; AF hatası → error', async () => {
    const get = vi.fn();
    expect(await loadNationalStandings('2000000999', get as never)).toEqual({ kind: 'missing' });
    expect(get).not.toHaveBeenCalled();
    const bad = vi.fn(async () => { throw new Error('x'); });
    expect(await loadNationalStandings('2000000005', bad as never)).toEqual({ kind: 'error' });
  });
});

describe('milli canlı uç yükü', () => {
  beforeEach(() => vi.resetModules());
  it('Sportmonks yüküyle aynı şekil: canlı maç live:true, yama alanları', async () => {
    vi.doMock('./client', () => ({ apiFootballGet: async () => env([{ ...fx(friendly), fixture: { ...fx(friendly).fixture, status: { short: '2H', elapsed: 67 } } }]) }));
    const { loadNationalLive: live } = await import('./nationalMatch');
    const r = await live('2001316553');
    expect(r.kind).toBe('found');
    if (r.kind === 'found') {
      expect(r.payload).toMatchObject({ live: true, source: 'fixture', match: { status: 'IN PLAY', time: "67'" } });
      expect(Array.isArray(r.payload.events)).toBe(true);
    }
    vi.doUnmock('./client');
    void loadNationalLive;
  });
});

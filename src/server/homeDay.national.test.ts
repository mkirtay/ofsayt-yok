import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ byDate: vi.fn(), live: vi.fn(), national: vi.fn(), enabled: vi.fn() }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn(), sportmonksClientRequest: vi.fn() }));
vi.mock('@/services/liveScoreService', () => ({ getFixturesByDate: h.byDate, getAllLiveMatches: h.live, getAllMatchesByDate: vi.fn(), getFixturesByCompetition: vi.fn() }));
vi.mock('@/server/apiFootball/nationalDay', () => ({ loadNationalDay: h.national }));
vi.mock('@/config/nationalMatches', () => ({ nationalMatchesEnabled: h.enabled }));

import { loadHomeDay } from './homeDay';

const league = { id: 600, status: 'FINISHED', date: '2026-11-10', scheduled: '12:00' };
const nat = (id: number, status: string) => ({ id, status, date: '2026-11-10', scheduled: '15:00', competition: { id: 2_000_000_005, name: 'UEFA Uluslar Ligi' } });

describe('loadHomeDay — milli maç birleştirme', () => {
  beforeEach(() => {
    for (const f of Object.values(h)) f.mockReset();
    h.byDate.mockImplementation(async (d: string) => (d === '2026-11-10' ? [league] : []));
    h.live.mockResolvedValue([]);
  });
  it('bayrak KAPALI: AF yükleyicisi hiç çağrılmaz, çıktı yalnız lig maçları', async () => {
    h.enabled.mockReturnValue(false);
    const r = await loadHomeDay('2026-11-10');
    expect(h.national).not.toHaveBeenCalled();
    expect(r.fixtureMatches).toEqual([league]);
    expect(r.liveMatches).toEqual([]);
  });
  it('bayrak açık: günün milli maçları listeye, canlı olanlar canlı listeye eklenir', async () => {
    h.enabled.mockReturnValue(true);
    h.national.mockResolvedValue({ ok: true, matches: [nat(2_000_000_001, 'IN PLAY'), nat(2_000_000_002, 'NOT STARTED')] });
    const r = await loadHomeDay('2026-11-10');
    expect(r.fixtureMatches.map((m) => m.id)).toEqual([600, 2_000_000_001, 2_000_000_002]);
    expect(r.liveMatches.map((m) => m.id)).toEqual([2_000_000_001]);
  });
  it('AF hatası lig listesini etkilemez', async () => {
    h.enabled.mockReturnValue(true);
    h.national.mockResolvedValue({ ok: false });
    const r = await loadHomeDay('2026-11-10');
    expect(r.fixtureMatches).toEqual([league]);
  });
});

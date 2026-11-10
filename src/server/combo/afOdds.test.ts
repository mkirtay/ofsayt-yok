import { describe, expect, it, vi } from 'vitest';
import { resolveOdds, type OddsDeps } from './afOdds';
import type { AfOddsEntry } from '@/services/apiFootball/oddsMarkets';
import type { AfFixtureSlim } from '@/services/apiFootball/fixtureMatch';
import slOdds from '@/services/apiFootball/__fixtures__/oddsSuperLig_1584458.json';
import uclOdds from '@/services/apiFootball/__fixtures__/oddsUcl_1635726.json';
import emptyOdds from '@/services/apiFootball/__fixtures__/oddsEmpty_1545657.json';

vi.mock('@/lib/redis', () => ({ withRedis: async (_f: unknown, fallback: unknown) => fallback, getRedisClient: () => null, fitsInRedis: () => true }));

const ts = (iso: string) => Date.parse(iso) / 1000;
const fixtures: AfFixtureSlim[] = [
  { id: 1584458, ts: ts('2026-11-08T18:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği S.K.', leagueId: 203 },
  { id: 1635726, ts: ts('2026-11-08T20:00:00Z'), home: 'Paris Saint Germain', away: 'Bayern München', leagueId: 2 },
  { id: 1545657, ts: ts('2026-11-08T17:00:00Z'), home: 'Rizespor', away: 'Kasımpaşa', leagueId: 203 },
];
const oddsById: Record<number, AfOddsEntry | null> = {
  1584458: (slOdds as { response: AfOddsEntry[] }).response[0],
  1635726: (uclOdds as { response: AfOddsEntry[] }).response[0],
  1545657: (emptyOdds as { response: AfOddsEntry[] }).response[0] ?? null,
};

function deps(over: Partial<OddsDeps> = {}): OddsDeps & { oddsCalls: number[] } {
  const oddsCalls: number[] = [];
  return {
    oddsCalls,
    fixtures: async () => fixtures,
    odds: async (id) => {
      oddsCalls.push(id);
      return { ok: true, entry: oddsById[id] ?? null };
    },
    ...over,
  };
}

const k = (iso: string) => Date.parse(iso);

describe('resolveOdds', () => {
  it('eşler, oranı çeker, pazarı çıkarır; yalnız seçilen maçlar için oran isteği', async () => {
    const d = deps();
    const r = await resolveOdds(
      [{ matchId: '1', key: 'over25', kickoffMs: k('2026-11-08T18:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği' }],
      d,
    );
    expect(r[0]).toMatchObject({ matchId: '1', status: 'ok', afFixtureId: 1584458 });
    expect(r[0].status === 'ok' && r[0].market.odd).toBe(1.3);
    expect(d.oddsCalls).toEqual([1584458]);
  });

  it('UCL maçı (farklı yazımlı takım adları) eşleşir', async () => {
    const r = await resolveOdds(
      [{ matchId: '2', key: 'btts', kickoffMs: k('2026-11-08T20:00:00Z'), home: 'Paris Saint Germain', away: 'Bayern Munich' }],
      deps(),
    );
    expect(r[0].status).toBe('ok');
  });

  it('eşleşmeyen maç → no-fixture, oran isteği yok', async () => {
    const d = deps();
    const r = await resolveOdds([{ matchId: '3', key: 'home', kickoffMs: k('2026-11-08T18:00:00Z'), home: 'Foo', away: 'Bar' }], d);
    expect(r[0]).toEqual({ matchId: '3', status: 'no-fixture' });
    expect(d.oddsCalls).toEqual([]);
  });

  it('oran açılmamış maç → no-odds', async () => {
    const r = await resolveOdds([{ matchId: '4', key: 'home', kickoffMs: k('2026-11-08T17:00:00Z'), home: 'Rizespor', away: 'Kasımpaşa' }], deps());
    expect(r[0]).toMatchObject({ status: 'no-odds', afFixtureId: 1545657 });
  });

  it('AF hatası: fikstür listesi null → error; oran hatası → error; diğer maçlar etkilenmez', async () => {
    const bad = await resolveOdds([{ matchId: '5', key: 'home', kickoffMs: k('2026-11-08T18:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği' }], deps({ fixtures: async () => null }));
    expect(bad[0].status).toBe('error');
    const mixed = await resolveOdds(
      [
        { matchId: 'a', key: 'home', kickoffMs: k('2026-11-08T18:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği' },
        { matchId: 'b', key: 'home', kickoffMs: k('2026-11-08T20:00:00Z'), home: 'Paris Saint Germain', away: 'Bayern München' },
      ],
      deps({ odds: async (id) => (id === 1584458 ? { ok: false } : { ok: true, entry: oddsById[id] }) }),
    );
    expect(mixed.map((m) => m.status)).toEqual(['error', 'ok']);
  });

  it('kickoff bilinmiyorsa eşleme denenmez', async () => {
    const r = await resolveOdds([{ matchId: '6', key: 'home', kickoffMs: null, home: 'Beşiktaş', away: 'Gençlerbirliği' }], deps());
    expect(r[0].status).toBe('no-fixture');
  });
});

describe('resolveOdds eşzamanlılık', () => {
  it('oran isteği aynı anda en çok 4', async () => {
    let active = 0;
    let peak = 0;
    const d = deps({
      odds: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return { ok: true, entry: oddsById[1584458] };
      },
    });
    const reqs = Array.from({ length: 12 }, (_, i) => ({ matchId: String(i), key: 'home' as const, kickoffMs: k('2026-11-08T18:00:00Z'), home: 'Beşiktaş', away: 'Gençlerbirliği' }));
    const r = await resolveOdds(reqs, d);
    expect(r.every((x) => x.status === 'ok')).toBe(true);
    expect(peak).toBeLessThanOrEqual(4);
  });
});

describe('withRateLimitRetry', () => {
  it('rateLimit hatasında bir kez yeniden dener; başka hatada denemez', async () => {
    const { withRateLimitRetry } = await import('./afOdds');
    const sleep = vi.fn(async () => {});
    let n = 0;
    const flaky = vi.fn(async () => {
      if (++n === 1) throw new Error('API-Football hata döndürdü: {"rateLimit":"Too many requests."}');
      return { response: [], errors: [] };
    });
    await expect(withRateLimitRetry(flaky as never, sleep)('/odds', {})).resolves.toBeDefined();
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
    const dead = vi.fn(async () => {
      throw new Error('API-Football HTTP 500');
    });
    await expect(withRateLimitRetry(dead as never, sleep)('/odds', {})).rejects.toThrow('500');
    expect(dead).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

vi.mock('@/server/matchCardH2h', () => ({ loadMatchCardH2h: vi.fn() }));
vi.mock('@/server/matchDetailSeed', () => ({ loadMatchDetailSeed: vi.fn() }));
// Redis yok: yalnız-önbellek kapsamı her anahtarda ıskalar.
vi.mock('@/lib/redis', () => ({ MAX_REDIS_VALUE_BYTES: 900_000, getRedisClient: () => null, withRedis: async (_fn: unknown, fallback: unknown) => fallback }));

import { isOldFinishedMatch, loadMatchPageOptionalSections, type MatchPageOptionalDeps } from './matchPageOptional';
import { fetchSportmonksCached } from '@/server/sportmonks/cachedFetch';

const match = { id: 1 } as unknown as Match;
const h2h = { team1: {}, team2: {}, h2h: [] } as never;
const seed = { stats: { home: {}, away: {} }, lineups: null } as never;

function deps(over: Partial<MatchPageOptionalDeps> = {}) {
  return {
    loadH2h: vi.fn(async () => h2h),
    loadSeed: vi.fn(async () => seed),
    underPressure: vi.fn(async () => false),
    cacheOnly: vi.fn(async () => false),
    ...over,
  };
}

describe('maç sayfası isteğe bağlı SSR bölümleri', () => {
  it('havuz normal → davranış aynı: H2H ve tohum sunucuda çekilir', async () => {
    const d = deps();
    const r = await loadMatchPageOptionalSections(match, '1', d);
    expect(r).toEqual({ h2h, seed, skipped: false });
    expect(d.loadH2h).toHaveBeenCalledTimes(1);
    expect(d.loadSeed).toHaveBeenCalledWith('1');
  });

  it('havuz baskı altında → hiçbiri çekilmez, hepsi undefined (istemci çeker)', async () => {
    const d = deps({ underPressure: vi.fn(async () => true) });
    const r = await loadMatchPageOptionalSections(match, '1', d);
    expect(r).toEqual({ h2h: undefined, seed: { stats: undefined, lineups: undefined }, skipped: true });
    expect(d.loadH2h).not.toHaveBeenCalled();
    expect(d.loadSeed).not.toHaveBeenCalled();
  });

  it('fail-soft: baskı kararı hata verirse normal yol; bir bölüm hata verirse yalnız o bölüm istemciye kalır', async () => {
    const a = await loadMatchPageOptionalSections(match, '1', deps({ underPressure: async () => Promise.reject(new Error('redis')) }));
    expect(a.skipped).toBe(false);
    expect(a.h2h).toEqual(h2h);

    const b = await loadMatchPageOptionalSections(match, '1', deps({ loadH2h: async () => Promise.reject(new Error('x')) }));
    expect(b.h2h).toBeUndefined();
    expect(b.seed).toEqual(seed);
    expect(b.transientError).toBe(true);

    const c = await loadMatchPageOptionalSections(match, '1', deps({ loadSeed: async () => Promise.reject(new Error('x')) }));
    expect(c.seed).toEqual({ stats: undefined, lineups: undefined });
    expect(c.h2h).toEqual(h2h);
    expect(c.transientError).toBe(true);
  });

  it('tohumdaki istatistik / kadro geçici hatası (failed) → transientError; seed alanı props\'a taşınmaz', async () => {
    const r = await loadMatchPageOptionalSections(match, '1', deps({ loadSeed: async () => ({ stats: undefined, lineups: null, failed: true }) }));
    expect(r.seed).toEqual({ stats: undefined, lineups: null });
    expect(r.transientError).toBe(true);
    const ok = await loadMatchPageOptionalSections(match, '1', deps());
    expect(ok.transientError).toBeUndefined();
  });

  it('eski bitmiş maç: başlama + 3 gün sonrası (bitmemiş / tarihsiz maç eski sayılmaz)', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    expect(isOldFinishedMatch({ status: 'FINISHED', date: '2026-10-16', scheduled: '11:00' }, now)).toBe(true);
    expect(isOldFinishedMatch({ status: 'FINISHED', date: '2026-10-16', scheduled: '13:00' }, now)).toBe(false);
    expect(isOldFinishedMatch({ status: 'FINISHED', date: '2013-04-03', scheduled: '18:45' }, now)).toBe(true);
    expect(isOldFinishedMatch({ status: 'NOT STARTED', date: '2013-04-03', scheduled: '18:45' }, now)).toBe(false);
    expect(isOldFinishedMatch({ status: 'FINISHED' }, now)).toBe(false);
  });

  it('yalnız-önbellek: Redis\'te yoksa Sportmonks\'a gidilmez, bölüm istemciye kalır ve geçici hata SAYILMAZ (kısa CDN yok)', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    const viaCache = async () => {
      const r = await fetchSportmonksCached('football/fixtures/head-to-head/1/2', {}, { fetchImpl });
      if (r.status !== 200) throw new Error(`Sportmonks ${r.status}`);
      return h2h;
    };
    const r = await loadMatchPageOptionalSections(
      match,
      '1',
      deps({ cacheOnly: async () => true, loadH2h: viaCache, loadSeed: async () => ({ stats: undefined, lineups: undefined, failed: true }) }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(r.h2h).toBeUndefined();
    // Tohum yalnız-önbellek dışı bir nedenle düştü (misses = 0) → geçici hata kalır.
    expect(r.transientError).toBe(true);

    const onlyMiss = await loadMatchPageOptionalSections(match, '1', deps({ cacheOnly: async () => true, loadH2h: viaCache }));
    expect(onlyMiss.h2h).toBeUndefined();
    expect(onlyMiss.seed).toEqual(seed);
    expect(onlyMiss.transientError).toBeUndefined();
    expect(onlyMiss.skipped).toBe(false);

    // Karar hata verirse normal yol (fail-soft).
    const d = deps({ cacheOnly: async () => Promise.reject(new Error('x')) });
    expect((await loadMatchPageOptionalSections(match, '1', d)).h2h).toEqual(h2h);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

vi.mock('@/server/matchCardH2h', () => ({ loadMatchCardH2h: vi.fn() }));
vi.mock('@/server/matchDetailSeed', () => ({ loadMatchDetailSeed: vi.fn() }));

import { loadMatchPageOptionalSections, type MatchPageOptionalDeps } from './matchPageOptional';

const match = { id: 1 } as unknown as Match;
const h2h = { team1: {}, team2: {}, h2h: [] } as never;
const seed = { stats: { home: {}, away: {} }, lineups: null } as never;

function deps(over: Partial<MatchPageOptionalDeps> = {}) {
  return {
    loadH2h: vi.fn(async () => h2h),
    loadSeed: vi.fn(async () => seed),
    underPressure: vi.fn(async () => false),
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

    const c = await loadMatchPageOptionalSections(match, '1', deps({ loadSeed: async () => Promise.reject(new Error('x')) }));
    expect(c.seed).toEqual({ stats: undefined, lineups: undefined });
    expect(c.h2h).toEqual(h2h);
  });
});

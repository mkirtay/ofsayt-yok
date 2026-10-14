import { describe, expect, it, vi } from 'vitest';

// İstatistik / kadro SSR tohumu: 429 / zaman aşımı "veri yok" (null) değil, geçici hata (undefined + failed).

const impl = vi.hoisted(() => ({
  stats: async (): Promise<unknown> => null,
  lineups: async (): Promise<unknown> => null,
}));
vi.mock('@/services/liveScoreService', () => ({
  fetchMatchStats: () => impl.stats(),
  fetchMatchLineups: () => impl.lineups(),
}));

import { loadMatchDetailSeed } from './matchDetailSeed';

const rateLimited = async () => {
  throw Object.assign(new Error('Sportmonks 429'), { status: 429 });
};

describe('loadMatchDetailSeed', () => {
  it('veri var / gerçekten yok (null) → olduğu gibi, failed yok', async () => {
    impl.stats = async () => ({ home: {}, away: {} });
    impl.lineups = async () => null;
    expect(await loadMatchDetailSeed('1')).toEqual({ stats: { home: {}, away: {} }, lineups: null });
  });

  it('429 → alan undefined (istemci çeker) ve failed: true; diğer alan etkilenmez', async () => {
    impl.stats = rateLimited;
    impl.lineups = async () => null;
    expect(await loadMatchDetailSeed('1')).toEqual({ stats: undefined, lineups: null, failed: true });
    impl.stats = async () => null;
    impl.lineups = rateLimited;
    expect(await loadMatchDetailSeed('1')).toEqual({ stats: null, lineups: undefined, failed: true });
  });

  it('bütçe aşımı → undefined ama hata değil (failed yok)', async () => {
    impl.stats = () => new Promise((resolve) => setTimeout(() => resolve(null), 50));
    impl.lineups = async () => null;
    expect(await loadMatchDetailSeed('1', 5)).toEqual({ stats: undefined, lineups: null });
  });
});

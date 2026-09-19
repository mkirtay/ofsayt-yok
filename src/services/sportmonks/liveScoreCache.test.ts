import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/redis', () => ({ getRedisClient: () => null })); // in-memory katmanı test edilir

import {
  fetchLiveScoreCached,
  buildLiveScoreCacheKey,
  isLiveScorePath,
  SPORTMONKS_LIVE_SCORE_CACHE_TTL_SECONDS,
} from './liveScoreCache';
import inplayFixture from './__fixtures__/inplayFixture.json';

const query = { include: 'participants;scores', page: '1', per_page: '50', api_token: '' };
const okBody = { data: [inplayFixture], rate_limit: { requested_entity: 'Fixture', remaining: 2000, resets_in_seconds: 100 } };

describe('canlı skor cache TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-18T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('TTL penceresi içindeki 2. çağrı upstream\'e gitmez, pencere dolunca gider', async () => {
    const upstream = vi.fn(async () => ({ status: 200, data: okBody }));
    // her test kendi anahtarını kullansın (paylaşımlı in-memory cache)
    const q = { ...query, per_page: 'ttl-test' };

    const first = await fetchLiveScoreCached(q, upstream);
    expect(first.cache).toBe('MISS');
    expect(upstream).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime((SPORTMONKS_LIVE_SCORE_CACHE_TTL_SECONDS - 1) * 1000);
    const second = await fetchLiveScoreCached(q, upstream);
    expect(second.cache).toBe('HIT');
    expect(second.data).toEqual(okBody);
    expect(upstream).toHaveBeenCalledTimes(1); // Sportmonks'a gitmedi

    vi.advanceTimersByTime(2 * 1000); // pencere doldu
    const third = await fetchLiveScoreCached(q, upstream);
    expect(third.cache).toBe('MISS');
    expect(upstream).toHaveBeenCalledTimes(2);
  });

  it('hatalı yanıtlar (422 vb.) cache\'lenmez', async () => {
    const upstream = vi.fn(async () => ({ status: 422, data: { message: 'Invalid' } }));
    const q = { ...query, per_page: 'err-test' };
    await fetchLiveScoreCached(q, upstream);
    await fetchLiveScoreCached(q, upstream);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});

describe('cache anahtarı', () => {
  it('api_token/path hariç, parametre sırasından bağımsız deterministik', () => {
    const a = buildLiveScoreCacheKey({ page: '1', include: 'x', api_token: 'SECRET', path: ['a'] });
    const b = buildLiveScoreCacheKey({ include: 'x', page: '1' });
    expect(a).toBe(b);
    expect(a).not.toContain('SECRET');
  });
  it('farklı sayfa farklı anahtar', () => {
    expect(buildLiveScoreCacheKey({ page: '1' })).not.toBe(buildLiveScoreCacheKey({ page: '2' }));
  });
  it('yalnızca livescores/inplay canlı yol sayılır', () => {
    expect(isLiveScorePath('football/livescores/inplay')).toBe(true);
    expect(isLiveScorePath('football/fixtures/date/2026-09-18')).toBe(false);
  });
});

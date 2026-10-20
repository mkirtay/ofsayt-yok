import { describe, expect, it, vi } from 'vitest';
import fixture from '@/services/sportmonks/__fixtures__/momentumSuperLig.json';
import type { SportmonksCachedResult } from '@/server/sportmonks/cachedFetch';
import { sportmonksCacheTtl } from '@/services/sportmonks/cachePolicy';
import { loadMatchMomentum, MOMENTUM_QUERY, type MatchMomentumDeps } from './matchMomentum';

const ok = (body: unknown, ttlSeconds = 604800): SportmonksCachedResult => ({
  status: 200,
  body,
  cache: 'HIT',
  freshForSeconds: ttlSeconds,
  ttlSeconds,
  stale: false,
});
const deps = (r: SportmonksCachedResult, inReserve = false) => {
  const fetch = vi.fn<MatchMomentumDeps['fetch']>(async () => r);
  return { fetch, inReserve: async () => inReserve };
};

describe('loadMatchMomentum', () => {
  it('tek fixtures/{id} isteği, yalnız 3 trend türü + devreler; bitmiş maç uzun CDN süresi', async () => {
    const d = deps(ok(fixture));
    const r = await loadMatchMomentum('19746587', d);
    expect(d.fetch).toHaveBeenCalledTimes(1);
    expect(d.fetch).toHaveBeenCalledWith('football/fixtures/19746587', MOMENTUM_QUERY);
    expect(MOMENTUM_QUERY.filters).toBe('trendTypes:44,42,34');
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.live).toBe(false);
    expect(r.value.points).toHaveLength(98);
    expect(r.cacheControl).toMatch(/s-maxage=604800/);
  });

  it('seçilen alanlar önbellek süresine yeter: başlama saati gelir → 1 günden eski bitmiş maç 7 gün taze', () => {
    // `select` ile `starting_at_timestamp` null geliyor (2026-10-21); süre `starting_at`'tan hesaplanır.
    expect(MOMENTUM_QUERY.select).toContain('starting_at');
    const now = Date.parse('2026-10-21T00:00:00Z');
    expect(sportmonksCacheTtl('football/fixtures/19746587', fixture.data, now).fresh).toBe(7 * 24 * 3600);
  });

  it('canlı maç: live=true, kısa CDN süresi', async () => {
    const r = await loadMatchMomentum('1', deps(ok({ data: { ...fixture.data, state_id: 22 } }, 20)));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.value.live).toBe(true);
    expect(r.cacheControl).toMatch(/s-maxage=15/);
  });

  it('trend yok / maç yok → empty; upstream hatası → unavailable', async () => {
    expect((await loadMatchMomentum('1', deps(ok({ data: { ...fixture.data, trends: [] } })))).kind).toBe('empty');
    expect((await loadMatchMomentum('1', deps({ ...ok(null), status: 404 }))).kind).toBe('empty');
    expect((await loadMatchMomentum('1', deps({ ...ok(null), status: 502, freshForSeconds: 0 }))).kind).toBe('unavailable');
  });

  it('havuz rezervde ve önbellekte yok (cacheOnlyMiss 503) → unavailable', async () => {
    const d = deps({ ...ok(null), status: 503, cacheOnlyMiss: true }, true);
    expect((await loadMatchMomentum('1', d)).kind).toBe('unavailable');
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });
});

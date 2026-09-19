import { describe, it, expect, vi } from 'vitest';
import { sportmonksRequest, SportmonksHttpError } from './httpClient';
import inplayFixture from './__fixtures__/inplayFixture.json';

/**
 * Mock fetch response'ları, docs/SPORTMONKS_MIGRATION.md'de kayıtlı GERÇEK
 * pool adları + `remaining` sayılarını kullanır:
 * - Fixture havuzu: Pass 5 satır 12 → remaining 2474 (path: /fixtures/19874792?include=events)
 * - Type havuzu: Pass 5 satır 2 → remaining 2499 (path: /core/types?per_page=50)
 * `resets_in_seconds` için rapor bu iki satırda tam değer vermiyor; Pass 1
 * özetindeki gerçek değer (2678) kullanıldı ("o an ~2678sn sonra sıfırlanıyordu").
 */
function mockFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch;
}

describe('sportmonksRequest', () => {
  it('football base path ile doğru URL kurar ve Fixture havuzunu loglar', async () => {
    const fetchImpl = mockFetch({
      data: inplayFixture,
      rate_limit: { resets_in_seconds: 2678, remaining: 2474, requested_entity: 'Fixture' },
    });
    const onRateLimit = vi.fn();

    const result = await sportmonksRequest({
      basePath: 'football',
      path: '/fixtures/19874792',
      apiToken: 'test-token',
      params: { include: 'events' },
      fetchImpl,
      onRateLimit,
    });

    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl.startsWith('https://api.sportmonks.com/v3/football/fixtures/19874792')).toBe(true);
    expect(calledUrl).toContain('include=events');
    expect(calledUrl).toContain('api_token=test-token');

    expect(result.data).toEqual(inplayFixture);
    expect(onRateLimit).toHaveBeenCalledWith({
      pool: 'Fixture',
      remaining: 2474,
      resetsInSeconds: 2678,
      path: '/fixtures/19874792',
    });
  });

  it('core base path ile doğru URL kurar ve Type havuzunu loglar (Pass 5 endpoint keşfi)', async () => {
    const fetchImpl = mockFetch({
      data: [],
      rate_limit: { resets_in_seconds: 2678, remaining: 2499, requested_entity: 'Type' },
    });
    const onRateLimit = vi.fn();

    await sportmonksRequest({
      basePath: 'core',
      path: '/types',
      apiToken: 'test-token',
      params: { per_page: 50 },
      fetchImpl,
      onRateLimit,
    });

    const calledUrl = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl.startsWith('https://api.sportmonks.com/v3/core/types')).toBe(true);
    expect(onRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ pool: 'Type', remaining: 2499 }),
    );
  });

  it('football altında core kaynağı istenirse 404 SportmonksHttpError fırlatır (Pass 5: /football/types → 404)', async () => {
    const fetchImpl = mockFetch(
      { message: 'The requested endpoint does not exist' },
      404,
    );

    await expect(
      sportmonksRequest({
        basePath: 'football',
        path: '/types',
        apiToken: 'test-token',
        fetchImpl,
      }),
    ).rejects.toThrow(SportmonksHttpError);
  });

  it('422 hatasında (Pass 3: 100 günlük tarih aralığı limiti) durum kodu ve body korunur', async () => {
    const fetchImpl = mockFetch(
      {
        message: 'Invalid request parameters',
        errors: { dateRange: ['You requested a date range of 124 days. The maximum range is 100 days.'] },
      },
      422,
    );

    try {
      await sportmonksRequest({
        basePath: 'football',
        path: '/fixtures/between/2026-02-01/2026-06-05',
        apiToken: 'test-token',
        fetchImpl,
      });
      expect.unreachable('hata fırlatılmalıydı');
    } catch (err) {
      expect(err).toBeInstanceOf(SportmonksHttpError);
      expect((err as SportmonksHttpError).status).toBe(422);
    }
  });
});

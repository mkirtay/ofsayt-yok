import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** GET /api/leagues/bracket — parametre doğrulama, CDN başlığı, hata ≠ veri yok. */
const h = vi.hoisted(() => ({
  result: null as unknown,
  throws: false,
  tracking: { stale: false, failed: false },
  args: [] as unknown[],
}));

vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })), requestIp: () => '1.1.1.1' }));
vi.mock('@/services/sportmonksProviderFlag', () => ({ isSportmonksProviderEnabled: () => true }));
vi.mock('@/server/cupBracket', () => ({
  loadCupBracket: vi.fn(async (...args: unknown[]) => {
    h.args = args;
    if (h.throws) throw new Error('429');
    return h.result;
  }),
}));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: vi.fn(async (fn: () => Promise<unknown>) => ({ value: await fn(), calls: 1, upstream: 1, ...h.tracking })),
}));

import handler from '@/pages/api/leagues/bracket';

function get(query: Record<string, string>) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
    end() { return this; },
  };
  const req = { method: 'GET', query, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

const bracket = { leagueId: 2, seasonId: 25580, leagueStage: null, rounds: [] };

describe('GET /api/leagues/bracket', () => {
  beforeEach(() => {
    h.result = { ok: true, bracket, freshSeconds: 3600 };
    h.throws = false;
    h.tracking = { stale: false, failed: false };
  });

  it('geçersiz parametre → 400', async () => {
    expect((await get({ league: 'x' })).statusCode).toBe(400);
    expect((await get({ league: '2', season: '1;2' })).statusCode).toBe(400);
  });

  it('başarılı: ağaç + taze süre kadar CDN', async () => {
    const r = await get({ league: '2', season: '25580' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ bracket });
    expect(r.headers['Cache-Control']).toBe('public, s-maxage=3600, stale-while-revalidate=10800');
    expect(h.args.slice(0, 2)).toEqual([2, 25580]);
  });

  it('veri yok → 200 bracket:null (sekme gizlenir); sezon parametresiz güncel sezon', async () => {
    h.result = { ok: true, bracket: null, freshSeconds: 43200 };
    const r = await get({ league: '606' });
    expect(r.body).toEqual({ bracket: null });
    expect(h.args.slice(0, 2)).toEqual([606, null]);
  });

  it('Sportmonks hatası → 503, cache yok (hata ≠ veri yok); eski veri → kısa CDN', async () => {
    h.throws = true;
    const r = await get({ league: '2' });
    expect(r.statusCode).toBe(503);
    expect(r.headers['Cache-Control']).toBe('no-store');
    h.throws = false;
    h.tracking = { stale: true, failed: false };
    expect((await get({ league: '2' })).headers['Cache-Control']).toBe('public, s-maxage=60, stale-while-revalidate=300');
  });

  it('desteklenmeyen lig / bilinmeyen sezon → 404', async () => {
    h.result = { ok: false, reason: 'unsupported' };
    expect((await get({ league: '600' })).statusCode).toBe(404);
  });
});

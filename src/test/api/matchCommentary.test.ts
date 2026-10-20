import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const sm = vi.hoisted(() => ({
  calls: [] as { path: string; params: Record<string, unknown> }[],
  response: null as unknown,
  error: null as unknown,
  reserve: false,
  cacheOnly: 0,
}));

vi.mock('@/services/sportmonksRuntimeClient', () => ({
  sportmonksClientRequest: vi.fn(async (_base: string, path: string, params: Record<string, unknown>) => {
    sm.calls.push({ path, params });
    if (sm.error) throw sm.error;
    return { data: sm.response };
  }),
}));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), stale: false, failed: false, calls: 1, upstream: 0 }),
  withSportmonksCacheOnly: async <T,>(_s: unknown, fn: () => Promise<T>) => {
    sm.cacheOnly += 1;
    return fn();
  },
}));
vi.mock('@/server/sportmonks/poolGuard', () => ({
  poolForPath: () => 'Fixture',
  isPoolInReserve: async () => sm.reserve,
}));
vi.mock('@/lib/rateLimit', () => ({
  requestIp: () => '1.1.1.1',
  hitFixedWindowRateLimit: async () => ({ success: true, resetAt: Date.now() + 60_000 }),
}));
vi.mock('@/services/sportmonksProviderFlag', () => ({ isSportmonksProviderEnabled: () => true }));

import handler, { commentaryCacheControl } from '@/pages/api/matches/[id]/commentary';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';

function call(id: string, method = 'GET') {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
    },
  };
  const req = { method, query: { id }, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => ({ ...res, headers }));
}

const OLD_KICKOFF = Math.floor(Date.now() / 1000) - 3 * 86_400;

beforeEach(() => {
  sm.calls = [];
  sm.error = null;
  sm.reserve = false;
  sm.cacheOnly = 0;
  sm.response = {
    id: 19746587,
    state_id: 5,
    starting_at_timestamp: OLD_KICKOFF,
    comments: [
      { id: 1, comment: 'Kick-off! The referee is Ozan Ergun.', minute: 1, order: 1 },
      { id: 2, comment: 'Victor James Osimhen receives a yellow card.', minute: 90, extra_minute: 1, order: 2 },
    ],
  };
});

describe('GET /api/matches/[id]/commentary', () => {
  it('tek Sportmonks isteği: alan seçimli comments include + maç durumu alanları', async () => {
    const res = await call('19746587');
    expect(res.statusCode).toBe(200);
    expect(sm.calls).toEqual([
      {
        path: '/fixtures/19746587',
        params: {
          select: 'state_id,starting_at,starting_at_timestamp',
          include: 'comments:comment,minute,extra_minute,is_goal,is_important,order',
        },
      },
    ]);
  });

  it('satırlar normalize, en yeni üstte; bitmiş eski maç CDN 1 gün + 7 gün swr', async () => {
    const res = await call('19746587');
    const body = res.body as { items: { id: number; tr: string; kind: string; extraMinute: number | null }[]; live: boolean };
    expect(body.live).toBe(false);
    expect(body.items.map((i) => [i.id, i.kind, i.tr, i.extraMinute])).toEqual([
      [2, 'card', 'Victor James Osimhen sarı kart gördü.', 1],
      [1, 'update', 'Maç başladı! Hakem: Ozan Ergun.', null],
    ]);
    expect(res.headers['cache-control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');
  });

  it('canlı maç: live=true, CDN 30 sn', async () => {
    sm.response = { ...(sm.response as object), state_id: 2, starting_at_timestamp: Math.floor(Date.now() / 1000) - 1800 };
    const res = await call('19746587');
    expect((res.body as { live: boolean }).live).toBe(true);
    expect(res.headers['cache-control']).toBe('public, s-maxage=30, stale-while-revalidate=30');
  });

  it('anlatımsız maç: 200 + boş liste (veri yok ≠ hata)', async () => {
    sm.response = { id: 1, state_id: 5, starting_at_timestamp: OLD_KICKOFF };
    const res = await call('1');
    expect(res.statusCode).toBe(200);
    expect((res.body as { items: unknown[] }).items).toEqual([]);
  });

  it('Sportmonks 404 → 404; geçici hata → 503 no-store (hata ≠ veri yok)', async () => {
    sm.error = new SportmonksHttpError('yok', 404, {});
    expect((await call('1')).statusCode).toBe(404);
    sm.error = new SportmonksHttpError('limit', 429, {});
    const res = await call('1');
    expect(res.statusCode).toBe(503);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('havuz rezervinde yalnız önbellek kapsamında okunur', async () => {
    sm.reserve = true;
    await call('19746587');
    expect(sm.cacheOnly).toBe(1);
  });

  it('geçersiz id 400, GET dışı 405 — Sportmonks\'a gidilmez', async () => {
    expect((await call('abc')).statusCode).toBe(400);
    expect((await call('1', 'POST')).statusCode).toBe(405);
    expect(sm.calls).toEqual([]);
  });

  it('commentaryCacheControl: yeni biten / başlamamış 5 dk', () => {
    const now = 2_000_000_000;
    expect(commentaryCacheControl({ items: [], live: false, phase: 'FINISHED', kickoff: now - 3600 }, now)).toBe(
      'public, s-maxage=300, stale-while-revalidate=300',
    );
    expect(commentaryCacheControl({ items: [], live: false, phase: 'NOT STARTED', kickoff: now + 3600 }, now)).toBe(
      'public, s-maxage=300, stale-while-revalidate=300',
    );
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Bellek içi Redis taklidi (set NX/EX, pipeline incr/expire, mget) — yalnız sayaç modülünün kullandığı komutlar.
 * Rate limit için Redis "yok" (getRedisClient → null) → gerçek limiter instance içi sayaçla çalışır.
 */
const store = new Map<string, number | string>();
const ttl = new Map<string, number>();
const fakeRedis = {
  set: vi.fn(async (key: string, value: number, opts: { nx?: boolean; ex?: number }) => {
    if (opts.nx && store.has(key)) return null;
    store.set(key, value);
    if (opts.ex) ttl.set(key, opts.ex);
    return 'OK';
  }),
  pipeline: () => {
    const ops: (() => void)[] = [];
    const p = {
      incr: (k: string) => { ops.push(() => store.set(k, Number(store.get(k) ?? 0) + 1)); return p; },
      expire: (k: string, s: number) => { ops.push(() => ttl.set(k, s)); return p; },
      exec: async () => { ops.forEach((o) => o()); return []; },
    };
    return p;
  },
  mget: vi.fn(async (...keys: string[]) => keys.map((k) => store.get(k) ?? null)),
};

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => null,
  REDIS_COMMAND_TIMEOUT_MS: 1000,
  withRedis: async <T,>(fn: (r: typeof fakeRedis) => Promise<T>) => fn(fakeRedis),
}));
const groupBy = vi.fn(async (_args: unknown) => [{ matchId: '100', _count: { _all: 4 } }]);
vi.mock('@/lib/prisma', () => ({ prisma: { post: { groupBy: (a: unknown) => groupBy(a) } } }));
const requireAdmin = vi.fn();
vi.mock('@/lib/requireAuth', () => ({ requireAdmin: (...a: unknown[]) => requireAdmin(...a) }));

import viewHandler from '@/pages/api/matches/[id]/view';
import { handleMatchCounters } from '@/pages/api/matches/counters';
import { VIEW_DEDUP_SECONDS, VIEW_TTL_SECONDS } from '@/config/matchCounters';
import { viewKey } from '@/server/matchCounters';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    end() { return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; },
  };
  return res;
}

async function view(id: string, ip = '1.1.1.1', ua = UA, method = 'POST') {
  const res = mockRes();
  const req = { method, query: { id }, headers: { 'x-forwarded-for': ip, 'user-agent': ua }, socket: {} } as unknown as NextApiRequest;
  await viewHandler(req, res as unknown as NextApiResponse);
  return res;
}

beforeEach(() => {
  store.clear();
  ttl.clear();
  groupBy.mockClear();
  requireAdmin.mockReset();
});

describe('POST /api/matches/[id]/view', () => {
  it('sayar, TTL koyar, sayıyı yanıtta döndürmez', async () => {
    const res = await view('100');
    expect(res.statusCode).toBe(204);
    expect(res.body).toBeUndefined();
    expect(store.get(viewKey('100'))).toBe(1);
    expect(ttl.get(viewKey('100'))).toBe(VIEW_TTL_SECONDS);
    expect([...ttl.entries()].some(([k, s]) => k.includes(':mvd:100:') && s === VIEW_DEDUP_SECONDS)).toBe(true);
  });

  it('aynı izleyici kısa sürede tekrar sayılmaz; başka izleyici sayılır', async () => {
    await view('100', '2.2.2.2');
    await view('100', '2.2.2.2');
    expect(store.get(viewKey('100'))).toBe(1);
    await view('100', '3.3.3.3');
    expect(store.get(viewKey('100'))).toBe(2);
  });

  it('botlar sayılmaz (yine 204)', async () => {
    const res = await view('100', '4.4.4.4', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
    expect(res.statusCode).toBe(204);
    expect(store.has(viewKey('100'))).toBe(false);
  });

  it('geçersiz id 400, GET 405', async () => {
    expect((await view('abc')).statusCode).toBe(400);
    expect((await view('100', '5.5.5.5', UA, 'GET')).statusCode).toBe(405);
  });
});

async function counters(ids: string, isPublic: boolean) {
  const res = mockRes();
  const req = { method: 'GET', query: { ids }, headers: {}, socket: {} } as unknown as NextApiRequest;
  await handleMatchCounters(req, res as unknown as NextApiResponse, isPublic);
  return res;
}

describe('GET /api/matches/counters', () => {
  it('admin olmayan: sayı verisi yok, DB/Redis okunmaz', async () => {
    requireAdmin.mockImplementation(async (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => {
      res.status(403).json({ error: 'Bu işlem için yetkiniz yok.' });
      return { ok: false };
    });
    const res = await counters('100', false);
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('views');
    expect(groupBy).not.toHaveBeenCalled();
    expect(fakeRedis.mget).not.toHaveBeenCalled();
  });

  it('admin: tek istekte görüntülenme + kullanıcı yorumu; sıfırlar yanıtta yok; önbellek kişisel', async () => {
    requireAdmin.mockResolvedValue({ ok: true, userId: 'a' });
    store.set(viewKey('100'), 753);
    store.set(viewKey('200'), 12);
    const res = await counters('100,200,300', false);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ counts: { '100': { views: 753, comments: 4 }, '200': { views: 12, comments: 0 } } });
    expect(res.headers['cache-control']).toBe('private, no-store');
    const where = (groupBy.mock.calls[0]![0] as { where: Record<string, unknown> }).where;
    expect(where).toMatchObject({ authorType: 'USER', deletedAt: null, hiddenAt: null });
  });

  it('herkese açık bayrak: yetki sorulmaz, CDN önbelleği', async () => {
    const res = await counters('100', true);
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('s-maxage=60');
  });
});

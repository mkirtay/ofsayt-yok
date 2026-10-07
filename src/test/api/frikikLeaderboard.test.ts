import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { todayKey } from '@/lib/frikik/daily';

/** GET /api/frikik/leaderboard (herkese açık, önbellekli) ve /api/frikik/me (oturum). DB/Redis taklit. */
const h = vi.hoisted(() => ({
  userId: null as string | null,
  cache: new Map<string, unknown>(),
  queries: [] as string[],
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })), requestIp: () => '1.1.1.1' }));
vi.mock('@/lib/livescoreCache', () => ({
  readCache: vi.fn(async (k: string) => h.cache.get(k) ?? null),
  writeCache: vi.fn(async (k: string, v: unknown) => void h.cache.set(k, v)),
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
const row = (userId: string, nickname: string | null, level: number, score: number, day: string) => ({ userId, nickname, level, score, day, createdAt: new Date() });
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async () => ({ username: 'eren' })) },
    frikikDailyScore: { findUnique: vi.fn(async () => null) },
    $queryRawUnsafe: vi.fn(async (text: string) => {
      h.queries.push(text);
      if (text.startsWith('SELECT count')) return [{ n: 0 }];
      if (text.includes('DISTINCT ON')) return [row('u2', 'zeynep', 5, 1500, '2026-10-03'), row('u1', 'eren', 4, 900, '2026-10-02')];
      return [row('u1', 'eren', 4, 900, '2026-10-08'), row('u3', null, 1, 0, '2026-10-08')];
    }),
  },
}));

import leaderboard from '@/pages/api/frikik/leaderboard';
import me from '@/pages/api/frikik/me';

function get(handler: typeof leaderboard, query: Record<string, string> = {}) {
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

describe('GET /api/frikik/leaderboard', () => {
  beforeEach(() => {
    h.cache.clear();
    h.queries = [];
    h.userId = null;
  });

  it('bugünün ve ayın tablosu; kişisel veri yok; CDN önbellek başlığı; ikinci istek Redis\'ten', async () => {
    const day = todayKey(Date.now());
    const r = await get(leaderboard);
    expect(r.statusCode).toBe(200);
    expect(r.headers['Cache-Control']).toMatch(/public, s-maxage=30/);
    expect(r.body).toEqual({
      day,
      month: day.slice(0, 7),
      daily: [
        { rank: 1, nickname: 'eren', level: 4, score: 900, day: '2026-10-08' },
        { rank: 2, nickname: '—', level: 1, score: 0, day: '2026-10-08' },
      ],
      monthly: [
        { rank: 1, nickname: 'zeynep', level: 5, score: 1500, day: '2026-10-03' },
        { rank: 2, nickname: 'eren', level: 4, score: 900, day: '2026-10-02' },
      ],
    });
    expect(JSON.stringify(r.body)).not.toMatch(/userId|email|@/);
    const n = h.queries.length;
    await get(leaderboard);
    expect(h.queries.length).toBe(n);
  });

  it('geçersiz gün 400; açık gün parametresi kabul', async () => {
    expect((await get(leaderboard, { day: '2026-13-01' })).statusCode).toBe(400);
    expect((await get(leaderboard, { day: '2026-10-07' })).body).toMatchObject({ day: '2026-10-07', month: '2026-10' });
  });
});

describe('GET /api/frikik/me', () => {
  it('girişsiz 401; oturumda takma ad + bugün (yok) + ay en iyisi (yok)', async () => {
    h.userId = null;
    expect((await get(me)).statusCode).toBe(401);
    h.userId = 'u1';
    const r = await get(me);
    expect(r.statusCode).toBe(200);
    expect(r.headers['Cache-Control']).toBe('private, no-store');
    expect(r.body).toMatchObject({ nickname: 'eren', today: null });
  });
});

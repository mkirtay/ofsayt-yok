import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** POST /api/matches/[id]/poll: başlama kilidi + IP ve kullanıcı başına rate limit. DB, kilit kararı ve limit taklit. */
const h = vi.hoisted(() => ({
  userId: 'u1' as string | null,
  locked: false,
  rlKeys: [] as { key: string; limit: number; windowMs: number }[],
  denyKey: null as string | null,
  upserts: 0,
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/rateLimit', () => ({
  requestIp: () => '1.1.1.1',
  hitFixedWindowRateLimit: vi.fn(async (key: string, limit: number, windowMs: number) => {
    h.rlKeys.push({ key, limit, windowMs });
    return { success: key !== h.denyKey, remaining: 0, resetAt: 0 };
  }),
}));
vi.mock('@/server/matchPollLock', () => ({
  resolvePollLock: vi.fn(async () => ({ locked: h.locked, source: 'day-list' })),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPrediction: {
      upsert: vi.fn(async () => {
        h.upserts += 1;
        return {};
      }),
      groupBy: vi.fn(async () => [{ prediction: 'HOME', _count: { prediction: 1 } }]),
    },
  },
}));

import handler, { POLL_IP_LIMIT, POLL_USER_LIMIT, POLL_WINDOW_MS } from '@/pages/api/matches/[id]/poll';

function post(body: unknown) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
  };
  const req = { method: 'POST', query: { id: '123' }, body, headers: {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('POST /api/matches/[id]/poll', () => {
  beforeEach(() => {
    h.userId = 'u1';
    h.locked = false;
    h.rlKeys = [];
    h.denyKey = null;
    h.upserts = 0;
  });

  it('başlamamış maçta oy kaydedilir', async () => {
    const r = await post({ prediction: 'HOME' });
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ matchId: '123', home: 1, userPrediction: 'HOME' });
    expect(h.upserts).toBe(1);
  });

  it('maç başladıysa 409 LOCKED, oy yazılmaz', async () => {
    h.locked = true;
    const r = await post({ prediction: 'AWAY' });
    expect(r.statusCode).toBe(409);
    expect(r.body).toMatchObject({ code: 'LOCKED' });
    expect(h.upserts).toBe(0);
  });

  it('IP ve kullanıcı için ayrı anahtarlarla limit uygulanır', async () => {
    await post({ prediction: 'HOME' });
    expect(h.rlKeys).toEqual(
      expect.arrayContaining([
        { key: 'poll:1.1.1.1', limit: POLL_IP_LIMIT, windowMs: POLL_WINDOW_MS },
        { key: 'poll:user:u1', limit: POLL_USER_LIMIT, windowMs: POLL_WINDOW_MS },
      ]),
    );
  });

  it('kullanıcı limiti dolunca (IP serbest olsa da) 429, kilit kararına ve DB yazımına gidilmez', async () => {
    h.denyKey = 'poll:user:u1';
    const r = await post({ prediction: 'HOME' });
    expect(r.statusCode).toBe(429);
    expect(r.body).toMatchObject({ code: 'RATE_LIMITED' });
    expect(h.upserts).toBe(0);
  });

  it('IP limiti dolunca 429', async () => {
    h.denyKey = 'poll:1.1.1.1';
    expect((await post({ prediction: 'HOME' })).statusCode).toBe(429);
    expect(h.upserts).toBe(0);
  });

  it('girişsiz 401, limite dokunulmaz', async () => {
    h.userId = null;
    expect((await post({ prediction: 'HOME' })).statusCode).toBe(401);
    expect(h.rlKeys).toEqual([]);
  });
});

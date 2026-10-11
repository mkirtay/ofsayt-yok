import { describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** Gerçek `hitFixedWindowRateLimit` (Redis yok → instance içi sayaç): IP değiştiren tek hesap kullanıcı limitine takılır. */
vi.mock('@/lib/redis', () => ({ getRedisClient: () => null, withRedis: vi.fn(), REDIS_COMMAND_TIMEOUT_MS: 1000 }));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async (req: NextApiRequest) => req.headers['x-user'] as string) }));
vi.mock('@/server/matchPollLock', () => ({ resolvePollLock: vi.fn(async () => ({ locked: false, source: 'none' })) }));
vi.mock('@/lib/prisma', () => ({
  prisma: { userPrediction: { upsert: vi.fn(async () => ({})), groupBy: vi.fn(async () => []) } },
}));

import handler, { POLL_IP_LIMIT, POLL_USER_LIMIT } from '@/pages/api/matches/[id]/poll';

async function post(ip: string, user: string) {
  const res = {
    statusCode: 200,
    status(c: number) { this.statusCode = c; return this; },
    json() { return this; },
    setHeader() {},
  };
  const req = {
    method: 'POST', query: { id: '42' }, body: { prediction: 'DRAW' },
    headers: { 'x-forwarded-for': ip, 'x-user': user }, socket: {},
  } as unknown as NextApiRequest;
  await handler(req, res as unknown as NextApiResponse);
  return res.statusCode;
}

describe('poll rate limit (gerçek limiter)', () => {
  it('kullanıcı limiti IP değişse de geçerli: limit kadar istek geçer, bir fazlası 429', async () => {
    expect(POLL_USER_LIMIT).toBeLessThan(POLL_IP_LIMIT);
    const codes = [];
    for (let i = 0; i <= POLL_USER_LIMIT; i++) codes.push(await post(`10.0.0.${i}`, 'rotator'));
    expect(codes.slice(0, POLL_USER_LIMIT).every((c) => c === 200)).toBe(true);
    expect(codes[POLL_USER_LIMIT]).toBe(429);
    // Başka kullanıcı etkilenmez.
    expect(await post('10.0.1.1', 'other')).toBe(200);
  });

  it('IP limiti kullanıcı değişse de geçerli', async () => {
    const codes = [];
    for (let i = 0; i <= POLL_IP_LIMIT; i++) codes.push(await post('10.9.9.9', `u${i}`));
    expect(codes.slice(0, POLL_IP_LIMIT).every((c) => c === 200)).toBe(true);
    expect(codes[POLL_IP_LIMIT]).toBe(429);
  });
});

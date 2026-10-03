import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  sessionUserId: null as string | null,
  calls: [] as string[],
  users: {
    me: { createdAt: new Date('2026-09-01T10:00:00Z'), credits: 55, premiumUntil: null, role: 'ADMIN', favoriteTeamIds: [34, 88], favoriteLeagueIds: [600] },
    other: { createdAt: new Date('2025-01-01T10:00:00Z'), credits: 999, premiumUntil: new Date('2099-01-01'), role: 'USER', favoriteTeamIds: [1, 2, 3], favoriteLeagueIds: [] },
  } as Record<string, unknown>,
}));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: async () => h.sessionUserId }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (h.calls.push(`user:${where.id}`), h.users[where.id] ?? null)) },
    analysisUnlock: { count: vi.fn(async ({ where }: { where: { userId: string } }) => (h.calls.push(`unlock:${where.userId}`), where.userId === 'me' ? 7 : 100)) },
    post: { count: vi.fn(async ({ where }: { where: { authorId: string } }) => (h.calls.push(`post:${where.authorId}`), where.authorId === 'me' ? 3 : 100)) },
    follow: {
      count: vi.fn(async ({ where }: { where: { followingId?: string; followerId?: string } }) => {
        const id = where.followingId ?? where.followerId!;
        h.calls.push(`follow:${id}`);
        return id === 'me' ? (where.followingId ? 12 : 4) : 100;
      }),
    },
  },
}));

import handler from '@/pages/api/user/summary';

function call(query: Record<string, string> = {}, method = 'GET') {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
  };
  const req = { method, query, headers: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('GET /api/user/summary', () => {
  beforeEach(() => {
    h.sessionUserId = null;
    h.calls.length = 0;
  });

  it('girişsiz 401; yanıt private, no-store', async () => {
    const res = await call();
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(h.calls).toEqual([]);
  });

  it('yalnız oturum sahibinin verisi: ?userId= yok sayılır, başka kullanıcı sorgulanmaz', async () => {
    h.sessionUserId = 'me';
    const res = await call({ userId: 'other', id: 'other' });
    expect(res.statusCode).toBe(200);
    expect(h.calls.every((c) => c.endsWith(':me'))).toBe(true);
    expect(res.body).toEqual({
      memberSince: '2026-09-01T10:00:00.000Z',
      credits: 55,
      premium: false, // ADMIN premium sayılmaz
      premiumUntil: null,
      admin: true,
      counts: { analyses: 7, favoriteTeams: 2, favoriteLeagues: 1, posts: 3, followers: 12, following: 4 },
    });
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('yalnız sayımlar ve rozet alanları — e-posta, ad, kullanıcı adı, görsel dönmez', async () => {
    h.sessionUserId = 'me';
    const json = JSON.stringify((await call()).body);
    expect(json).not.toMatch(/email|"name"|username|image|password/);
  });

  it('premium: premiumUntil gelecekteyse', async () => {
    h.sessionUserId = 'other';
    const res = await call();
    expect(res.body).toMatchObject({ premium: true, admin: false, premiumUntil: '2099-01-01T00:00:00.000Z' });
  });

  it('yalnız GET', async () => {
    h.sessionUserId = 'me';
    expect((await call({}, 'POST')).statusCode).toBe(405);
  });
});

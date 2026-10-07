import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ sanitize: vi.fn(), postCreate: vi.fn(), commentCreate: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: vi.fn(), create: h.postCreate, findFirst: vi.fn(async () => ({ id: 'p1', authorId: 'a' })) },
    postComment: { create: h.commentCreate, findMany: vi.fn() },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', username: 'ali' })) },
  },
}));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => 'u1') }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })),
  requestIp: () => '203.0.113.9',
}));
vi.mock('@/lib/livescoreCache', () => ({ readCache: vi.fn(async () => null), writeCache: vi.fn() }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/gundem/notify', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/gundem/official', () => ({ getOfficialAccountEmails: () => [], isOfficialUser: () => false }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn() }));
vi.mock('@/lib/security', async (orig) => {
  const real = await orig<typeof import('@/lib/security')>();
  h.sanitize.mockImplementation(real.sanitizePlainText);
  return { ...real, sanitizePlainText: h.sanitize };
});

import postsHandler, { config as postsConfig } from '@/pages/api/gundem/posts/index';
import commentsHandler, { config as commentsConfig } from '@/pages/api/gundem/posts/[postId]/comments';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, body: unknown) {
  const out = { status: 200 };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json() {
      return this;
    },
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler({ method: 'POST', body, query: { postId: 'p1' }, headers: {} } as unknown as NextApiRequest, res);
  return out;
}

beforeEach(() => {
  h.sanitize.mockClear();
  h.postCreate.mockReset();
  h.commentCreate.mockReset();
});

describe('gündem gönderi/yorum ham uzunluk sınırı', () => {
  it('gövde sınırı 16 KB', () => {
    expect(postsConfig.api.bodyParser.sizeLimit).toBe('16kb');
    expect(commentsConfig.api.bodyParser.sizeLimit).toBe('16kb');
  });

  it.each([
    ['gönderi', postsHandler as Handler],
    ['yorum', commentsHandler as Handler],
  ])('%s: 2000 karakteri aşan ham gövde temizlenmeden 400', async (_n, handler) => {
    const r = await call(handler, { body: '<'.repeat(2001) });
    expect(r.status).toBe(400);
    expect(h.sanitize).not.toHaveBeenCalled();
    expect(h.postCreate).not.toHaveBeenCalled();
    expect(h.commentCreate).not.toHaveBeenCalled();
  });

  it.each([
    ['gönderi', postsHandler as Handler],
    ['yorum', commentsHandler as Handler],
  ])('%s: tavan altındaki girdi yine temizlenir (etiket sonrası 280 sınırı)', async (_n, handler) => {
    const r = await call(handler, { body: `<i>${'a'.repeat(281)}</i>` });
    expect(r.status).toBe(400);
    expect(h.sanitize).toHaveBeenCalledTimes(1);
  });
});

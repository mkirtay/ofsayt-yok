/**
 * Kullanım Şartları onay kapısı uçlarda: onayı olmayan WEB (çerez) isteği analiz açma, Gündem gönderi ve yorumda
 * 403 TERMS_REQUIRED alır, hiçbir şey yazılmaz; mobil Bearer isteği muaftır (yayındaki sürümler kilitlenmesin).
 * Okuma (GET) etkilenmez. Gerçek SQL ile uçtan uca: src/test/pglite/accountDeletion.pglite.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  termsAcceptedAt: null as Date | null,
  postCreate: vi.fn(),
  commentCreate: vi.fn(),
  postFindMany: vi.fn(async () => []),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: h.postFindMany, create: h.postCreate, findFirst: vi.fn(async () => ({ id: 'p1', authorId: 'a' })) },
    postComment: { create: h.commentCreate, findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', username: 'ali', termsAcceptedAt: h.termsAcceptedAt })) },
  },
}));
vi.mock('@/lib/mobileAuth', () => ({
  getRequestUserId: vi.fn(async () => 'u1'),
  hasBearerToken: (req: NextApiRequest) => typeof req.headers.authorization === 'string',
}));
vi.mock('@/lib/requireAuth', () => ({ requireAuth: async () => ({ ok: true, userId: 'u1' }) }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })),
  requestIp: () => '203.0.113.9',
}));
vi.mock('@/lib/livescoreCache', () => ({ readCache: vi.fn(async () => null), writeCache: vi.fn() }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn(), captureWarning: vi.fn() }));
vi.mock('@/lib/gundem/notify', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/gundem/official', () => ({ getOfficialAccountEmails: () => [], isOfficialUser: () => false }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn() }));
// Analiz ucunun ağır bağımlılıkları: kapıdan sonra hiçbirine ulaşılmamalı.
const analysisDeps = vi.hoisted(() => ({ findStored: vi.fn(async () => null) }));
vi.mock('@/lib/matchAnalysisLookup', () => ({ findStoredMatchAnalysis: analysisDeps.findStored }));

import postsHandler from '@/pages/api/gundem/posts/index';
import commentsHandler from '@/pages/api/gundem/posts/[postId]/comments';
import analysisHandler from '@/pages/api/matches/[id]/analysis';

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;

async function call(handler: Handler, opts: { method?: string; body?: unknown; bearer?: boolean; query?: Record<string, string> }) {
  const out: { status: number; body: Record<string, unknown> | undefined } = { status: 200, body: undefined };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(b: Record<string, unknown>) {
      out.body = b;
      return this;
    },
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  const headers: Record<string, string> = opts.bearer ? { authorization: 'Bearer t' } : {};
  await handler(
    { method: opts.method ?? 'POST', body: opts.body ?? {}, query: { postId: 'p1', id: '19000001', ...opts.query }, headers } as unknown as NextApiRequest,
    res,
  );
  return out;
}

beforeEach(() => {
  h.termsAcceptedAt = null;
  h.postCreate.mockReset();
  h.commentCreate.mockReset();
  analysisDeps.findStored.mockClear();
});

describe('onay kapısı — web isteği, onay yok', () => {
  it('Gündem gönderisi: 403 TERMS_REQUIRED, yazılmaz', async () => {
    const r = await call(postsHandler, { body: { body: 'merhaba' } });
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe('TERMS_REQUIRED');
    expect(h.postCreate).not.toHaveBeenCalled();
  });

  it('Gündem yorumu: 403 TERMS_REQUIRED, yazılmaz', async () => {
    const r = await call(commentsHandler, { body: { body: 'merhaba' } });
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe('TERMS_REQUIRED');
    expect(h.commentCreate).not.toHaveBeenCalled();
  });

  it('analiz açma: 403 TERMS_REQUIRED, analiz aranmaz / kredi düşülmez', async () => {
    const r = await call(analysisHandler, { body: { method: 'credit' } });
    expect(r.status).toBe(403);
    expect(r.body?.code).toBe('TERMS_REQUIRED');
    expect(analysisDeps.findStored).not.toHaveBeenCalled();
  });

  it('okuma etkilenmez: akış GET 200', async () => {
    const r = await call(postsHandler, { method: 'GET', query: {} });
    expect(r.status).toBe(200);
  });
});

describe('onay kapısı — geçiş', () => {
  it('onay varsa kapıdan geçer (boş gövde → olağan 400 doğrulaması)', async () => {
    h.termsAcceptedAt = new Date();
    expect((await call(postsHandler, { body: {} })).status).toBe(400);
    expect((await call(commentsHandler, { body: {} })).status).toBe(400);
  });

  it('mobil Bearer isteği onaysız da kapıdan geçer (geriye dönük uyum)', async () => {
    const p = await call(postsHandler, { body: {}, bearer: true });
    expect(p.status).toBe(400);
    expect(p.body?.code).not.toBe('TERMS_REQUIRED');
    const c = await call(commentsHandler, { body: {}, bearer: true });
    expect(c.status).toBe(400);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * GAME_ENABLED kapısı — API uçları (/api/game/*, /api/admin/game/*) ve sayfa getServerSideProps'u.
 * Kapalı: herkese 404 (admin ve cron dahil). Önizleme: yalnız ADMIN / GAME_PREVIEW_EMAILS; diğerlerine 404; yanıt
 * kişisel önbellekli + noindex (handler `public` yazsa bile). Herkese açık: dokunulmaz.
 */
const h = vi.hoisted(() => ({ userId: null as string | null, user: null as { role: string; email: string } | null }));

vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.userId) }));
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(async () => h.user) } } }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, remaining: 1, resetAt: 0 })), requestIp: () => '1.1.1.1' }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/requireAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true, userId: 'admin' })), requireAuth: vi.fn(async () => ({ ok: true, userId: 'u1' })) }));
vi.mock('@/server/game/weeks', () => ({ resolveCurrentWeekKey: vi.fn(async () => null), loadPublicWeek: vi.fn(async () => null) }));
vi.mock('@/server/game/pageData', () => ({
  GAME_PAGE_CACHE: 'public, s-maxage=60, stale-while-revalidate=300',
  loadGameHome: vi.fn(async () => ({ week: null, season: '2026-27', board: null, prevKey: null, nextKey: null })),
}));
vi.mock('@/server/game/settle', () => ({ settleGameMatches: vi.fn(async () => ({ evaluated: 0 })) }));
vi.mock('@/server/cronJobs', () => ({
  isCronRequest: (a?: string) => a === 'Bearer cron',
  acquireCronLock: vi.fn(async () => ({ key: 'k', token: 't' })),
  recordCronTick: vi.fn(async () => ({ previous: null, at: 0 })),
  runCronJob: vi.fn(async () => ({ status: 'done', result: { evaluated: 0 } })),
}));
vi.mock('@/server/backgroundTask', () => ({ runInBackground: vi.fn() }));

import current from '@/pages/api/game/weeks/current';
import settle from '@/pages/api/admin/game/settle';
import { getServerSideProps as homeSSP } from '@/pages/tahmin/index';
import { getServerSideProps as rulesSSP } from '@/pages/tahmin/kurallar';

type Res = { statusCode: number; body: unknown; headers: Record<string, string> };
function mkRes() {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
    end() { return this; },
  };
  return res;
}
async function call(handler: (q: NextApiRequest, s: NextApiResponse) => unknown, method = 'GET', authorization?: string): Promise<Res> {
  const res = mkRes();
  const req = { method, query: {}, headers: authorization ? { authorization } : {}, socket: {} } as unknown as NextApiRequest;
  await handler(req, res as unknown as NextApiResponse);
  return res;
}
async function ssp(fn: (ctx: never) => Promise<unknown>) {
  const res = mkRes();
  const out = await fn({ req: { headers: {} }, res, query: {}, params: {}, resolvedUrl: '/tahmin' } as never);
  return { out: out as { notFound?: boolean; props?: { noindex: boolean } }, headers: res.headers };
}

const asAnon = () => { h.userId = null; h.user = null; };
const asUser = (email: string, role = 'USER') => { h.userId = 'u1'; h.user = { role, email }; };

beforeEach(() => {
  vi.stubEnv('GAME_PREVIEW_EMAILS', 'tester@ornek.example');
  asAnon();
});
afterEach(() => vi.unstubAllEnvs());

describe('GAME_ENABLED kapalı (varsayılan)', () => {
  it.each([undefined, '0', 'false', 'yanlis'])('GAME_ENABLED=%s → API 404, admin ve cron dahil; sayfalar 404', async (v) => {
    if (v === undefined) vi.stubEnv('GAME_ENABLED', ''); else vi.stubEnv('GAME_ENABLED', v);
    asUser('tester@ornek.example', 'ADMIN');
    expect((await call(current)).statusCode).toBe(404);
    expect((await call(settle, 'POST')).statusCode).toBe(404);
    expect((await call(settle, 'GET', 'Bearer cron')).statusCode).toBe(404);
    expect((await ssp(homeSSP)).out).toEqual({ notFound: true });
    expect((await ssp(rulesSSP)).out).toEqual({ notFound: true });
  });
});

describe('GAME_ENABLED=1 (önizleme)', () => {
  beforeEach(() => vi.stubEnv('GAME_ENABLED', '1'));

  it('girişsiz ve listede olmayan kullanıcıya 404', async () => {
    expect((await call(current)).statusCode).toBe(404);
    expect((await ssp(homeSSP)).out).toEqual({ notFound: true });
    asUser('baska@ornek.example');
    expect((await call(current)).statusCode).toBe(404);
    expect((await ssp(rulesSSP)).out).toEqual({ notFound: true });
  });

  it('allowlist e-postası ve ADMIN görür; yanıt kişisel önbellekli + noindex (handler public yazsa da)', async () => {
    for (const [email, role] of [['Tester@Ornek.example', 'USER'], ['admin@ornek.example', 'ADMIN']]) {
      asUser(email!, role);
      const r = await call(current);
      expect(r.statusCode).toBe(200);
      expect(r.headers['cache-control']).toBe('private, no-store');
      expect(r.headers['x-robots-tag']).toBe('noindex, nofollow');
      const page = await ssp(homeSSP);
      expect(page.out.props?.noindex).toBe(true);
      expect(page.headers['cache-control']).toBe('private, no-store');
    }
  });

  it('sonuç işi: Bearer CRON_SECRET önizlemede de çalışır', async () => {
    expect((await call(settle, 'GET', 'Bearer cron')).statusCode).toBe(202);
  });
});

describe('GAME_ENABLED=public', () => {
  beforeEach(() => vi.stubEnv('GAME_ENABLED', 'public'));

  it('herkese açık; CDN önbelleği ve indeks', async () => {
    const r = await call(current);
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toMatch(/^public, s-maxage=60/);
    expect(r.headers['x-robots-tag']).toBeUndefined();
    const page = await ssp(homeSSP);
    expect(page.out.props?.noindex).toBe(false);
    expect(page.headers['cache-control']).toMatch(/^public/);
  });
});

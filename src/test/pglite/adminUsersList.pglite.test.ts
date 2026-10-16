/* eslint-disable @typescript-eslint/no-explicit-any -- sahte req/res gevşek tipli */
/**
 * Yönetici kullanıcı listesi — GERÇEK SQL (PGlite, bellek içi; ağdaki DB'ye bağlanılmaz) + gerçek uç
 * (GET /api/admin/users). Oturumsuz 401, ADMIN değil 403; en yeni üstte, 50'şer cursor; silinmiş kullanıcı yok;
 * yanıtta şifre / belirteç / oturum sürümü yok; Gündem askı bayrağı; arama ucu (q) aynı kalır.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/redis', () => ({ getRedisClient: () => null, withRedis: async (_fn: unknown, fallback: unknown) => fallback }));

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let issueMobileToken: typeof import('@/lib/mobileAuth').issueMobileToken;
let handler: Handler;
let adminToken: string;
let userToken: string;

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  process.env.AUTH_SECRET = 'itest-secret-admin-users-list';
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  ({ issueMobileToken } = await import('@/lib/mobileAuth'));
  handler = (await import('@/pages/api/admin/users/index')).default as Handler;

  const base = Date.parse('2026-01-01T00:00:00Z');
  const admin = await prisma.user.create({
    data: { email: 'admin@example.invalid', username: 'yonetici', role: 'ADMIN', password: 'hash-gizli', createdAt: new Date(base) },
  });
  // 55 üye: i büyüdükçe daha yeni; 54. askıda, 53. şartları kabul etmiş + doğrulanmış.
  for (let i = 0; i < 55; i++) {
    await prisma.user.create({
      data: {
        email: `u${i}@example.invalid`,
        username: `uye_${i}`,
        password: 'hash-gizli',
        credits: i,
        createdAt: new Date(base + (i + 1) * 3600_000),
        ...(i === 54 ? { gundemSuspendedUntil: new Date('2099-01-01T00:00:00Z') } : {}),
        ...(i === 53 ? { termsAcceptedAt: new Date('2026-10-14T00:00:00Z'), emailVerified: new Date() } : {}),
      },
    });
  }
  await prisma.user.create({ data: { id: 'deleted-user', email: 'deleted-user@deleted.invalid', name: 'Silinmiş kullanıcı', createdAt: new Date() } });
  adminToken = await issueMobileToken({ sub: admin.id, role: 'ADMIN', email: admin.email, tokenVersion: 0 });
  const u = await prisma.user.findUniqueOrThrow({ where: { email: 'u1@example.invalid' } });
  userToken = await issueMobileToken({ sub: u.id, role: 'USER', email: u.email, tokenVersion: 0 });
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

async function call(token: string | null, query: Record<string, string> = {}) {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = JSON.parse(JSON.stringify(b))), res); // gerçek yanıt gibi serileştir
  res.setHeader = (k: string, v: string) => void (res.headers[k] = v);
  res.getHeader = (k: string) => res.headers[k];
  res.end = () => res;
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  await handler({ method: 'GET', headers, cookies: {}, query } as unknown as NextApiRequest, res);
  return res as { statusCode: number; body: any; headers: Record<string, string> };
}

describe('GET /api/admin/users (liste)', () => {
  it('oturumsuz 401, ADMIN değil 403', async () => {
    expect((await call(null)).statusCode).toBe(401);
    expect((await call(userToken)).statusCode).toBe(403);
  });

  it('en yeni üstte, 50 + 6 (cursor), silinmiş kullanıcı yok, önbelleğe alınmaz', async () => {
    const p1 = await call(adminToken);
    expect(p1.statusCode).toBe(200);
    expect(p1.headers['Cache-Control']).toBe('private, no-store');
    expect(p1.body.users).toHaveLength(50);
    expect(p1.body.users[0].username).toBe('uye_54');
    expect(p1.body.nextCursor).toBe(p1.body.users[49].id);
    const p2 = await call(adminToken, { cursor: p1.body.nextCursor });
    expect(p2.body.users).toHaveLength(6);
    expect(p2.body.nextCursor).toBeNull();
    const all = [...p1.body.users, ...p2.body.users];
    expect(all.at(-1).username).toBe('yonetici');
    expect(new Set(all.map((u: any) => u.id)).size).toBe(56);
    expect(all.some((u: any) => u.id === 'deleted-user')).toBe(false);
    const times = all.map((u: any) => Date.parse(u.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('sütunlar beyaz listede; şifre / belirteç / oturum sürümü yok; askı ve şart kabulü doğru', async () => {
    const { body } = await call(adminToken);
    expect(Object.keys(body.users[0]).sort()).toEqual(
      ['createdAt', 'credits', 'email', 'emailVerified', 'gundemSuspended', 'gundemSuspendedUntil', 'id', 'name', 'role', 'termsAcceptedAt', 'username'],
    );
    expect(JSON.stringify(body)).not.toMatch(/hash-gizli|password|tokenVersion|emailNormalized/);
    expect(body.users[0]).toMatchObject({ username: 'uye_54', gundemSuspended: true });
    expect(body.users[1]).toMatchObject({ username: 'uye_53', gundemSuspended: false, gundemSuspendedUntil: null });
    expect(body.users[1].termsAcceptedAt).toBe('2026-10-14T00:00:00.000Z');
    expect(body.users[1].emailVerified).not.toBeNull();
  });

  it('arama (q) eskisi gibi; silinmiş kullanıcı aramada da çıkmaz', async () => {
    const r = await call(adminToken, { q: 'uye_5' });
    expect(r.body.nextCursor).toBeUndefined();
    expect(r.body.users.map((u: any) => u.username).sort()).toEqual(['uye_5', 'uye_50', 'uye_51', 'uye_52', 'uye_53', 'uye_54']);
    expect((await call(adminToken, { q: 'deleted' })).body.users).toEqual([]);
  });
});

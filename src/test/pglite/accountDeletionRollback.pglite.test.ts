/* eslint-disable @typescript-eslint/no-explicit-any -- sahte req/res gevşek tipli */
/**
 * Hesap silme yarıda kalırsa veri kaybı YOK — GERÇEK SQL (PGlite). Her senaryo kendi bellek içi DB'si ve temiz modül
 * grafiğiyle. Hata noktaları: (1) "Silinmiş kullanıcı" yer tutucusu oluşturulamaz (ilk adım), (2) devir + kullanıcı
 * silme yapıldıktan SONRA denetim kaydı yazılamaz (ör. migration uygulanmamış).
 *
 * Not: test köprüsü (pgliteServer) Prisma transaction hatasından sonra bağlantıyı kapatır; bu yüzden sonuç Prisma ile
 * değil doğrudan SQL ile okunur. Önce açıkça COMMIT gönderilir: Postgres hata almış transaction'ı COMMIT'te de geri alır →
 * hiçbir ara adım (gönderi devri, kullanıcı silme) kalıcı olamaz.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/redis', () => ({ getRedisClient: () => null, withRedis: async (_fn: unknown, fallback: unknown) => fallback }));
const sent = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock('@/lib/security', async (orig) => ({
  ...(await orig<typeof import('@/lib/security')>()),
  sendAccountDeletedEmail: async (email: string) => {
    sent.to.push(email);
    return true;
  },
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn(), captureWarning: vi.fn() }));

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;

beforeEach(async () => {
  vi.resetModules();
  sent.to = [];
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  process.env.AUTH_SECRET = 'itest-secret-account-deletion-rollback';
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
}, 120_000);

afterEach(async () => {
  await prisma?.$disconnect().catch(() => undefined);
  await server?.close();
});

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = () => undefined;
  res.end = () => res;
  return res as NextApiResponse & { statusCode: number; body: any };
}

async function seed() {
  const user = await prisma.user.create({ data: { email: 'rb@example.invalid', username: 'rb', password: 'x', credits: 4 } });
  const post = await prisma.post.create({ data: { authorId: user.id, body: 'kalmalı' } });
  await prisma.postComment.create({ data: { postId: post.id, userId: user.id, body: 'yorum' } });
  await prisma.paymentOrder.create({ data: { merchantOrderId: 'm-rb', userId: user.id, packageKey: 'credits_10', amountTRY: '39.99', status: 'PAID' } });
  await prisma.creditTransaction.create({ data: { userId: user.id, type: 'SIGNUP_BONUS', amount: 2, balanceAfter: 2 } });
  await prisma.account.create({ data: { userId: user.id, type: 'oauth', provider: 'google', providerAccountId: 'g-rb' } });
  const { issueMobileToken } = await import('@/lib/mobileAuth');
  const token = await issueMobileToken({ sub: user.id, role: user.role, email: user.email, tokenVersion: 0 });
  return { user, post, token };
}

async function callDelete(token: string) {
  const handler = (await import('@/pages/api/user/me')).default;
  const res = mockRes();
  await handler(
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` }, cookies: {}, query: {}, body: { confirm: 'SİL' } } as unknown as NextApiRequest,
    res,
  );
  return res;
}

/** Hata almış transaction'ı COMMIT etmeyi dene (Postgres geri alır), sonra durumu doğrudan SQL ile oku. */
async function stateAfterCommitAttempt(userId: string) {
  await server.db.exec('COMMIT').catch(() => undefined);
  const n = async (q: string) => Number((await server.db.query<{ n: number }>(q)).rows[0]!.n);
  return {
    user: await n(`SELECT count(*)::int AS n FROM "User" WHERE id = '${userId}'`),
    postsOwned: await n(`SELECT count(*)::int AS n FROM "Post" WHERE "authorId" = '${userId}'`),
    commentsOwned: await n(`SELECT count(*)::int AS n FROM "PostComment" WHERE "userId" = '${userId}'`),
    ordersOwned: await n(`SELECT count(*)::int AS n FROM "PaymentOrder" WHERE "userId" = '${userId}'`),
    ledger: await n(`SELECT count(*)::int AS n FROM "CreditTransaction" WHERE "userId" = '${userId}'`),
    accounts: await n(`SELECT count(*)::int AS n FROM "Account" WHERE "userId" = '${userId}'`),
    sentinel: await n(`SELECT count(*)::int AS n FROM "User" WHERE id = 'deleted-user'`),
  };
}

const INTACT = { user: 1, postsOwned: 1, commentsOwned: 1, ordersOwned: 1, ledger: 1, accounts: 1, sentinel: 0 };

describe('hesap silme yarıda kalırsa veri kaybı yok', () => {
  it('yer tutucu oluşturulamaz (e-posta başka satırda) → 500, hiçbir şey silinmez / devredilmez, e-posta gitmez', async () => {
    const { DELETED_USER_EMAIL } = await import('@/config/deletedUser');
    await prisma.user.create({ data: { id: 'blocker', email: DELETED_USER_EMAIL } });
    const { user, token } = await seed();

    const res = await callDelete(token);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBeUndefined();
    expect(sent.to).toEqual([]);
    expect(await stateAfterCommitAttempt(user.id)).toEqual(INTACT);
  });

  it('devir ve kullanıcı silme SONRASI denetim kaydı yazılamaz (tablo yok) → 500, tüm adımlar geri alınır', async () => {
    await server.db.exec('DROP TABLE "AccountDeletionLog"');
    const { user, token } = await seed();

    const res = await callDelete(token);
    expect(res.statusCode).toBe(500);
    expect(sent.to).toEqual([]);
    expect(await stateAfterCommitAttempt(user.id)).toEqual(INTACT);
  });

  it('kontrol: aynı kurulumda engel yoksa silme gerçekten yapılır (testin kendisi doğru ölçüyor)', async () => {
    const { user, token } = await seed();
    const res = await callDelete(token);
    expect(res.statusCode).toBe(200);
    expect(await stateAfterCommitAttempt(user.id)).toEqual({ user: 0, postsOwned: 0, commentsOwned: 0, ordersOwned: 0, ledger: 0, accounts: 0, sentinel: 1 });
    expect(sent.to).toEqual(['rb@example.invalid']);
  });
});

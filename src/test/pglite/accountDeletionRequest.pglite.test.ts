/* eslint-disable @typescript-eslint/no-explicit-any -- sahte req/res gevşek tipli */
/**
 * Giriş yapmadan hesap silme (/hesap-silme) — GERÇEK SQL motoru (PGlite, bellek içi; ağdaki hiçbir DB'ye bağlanılmaz) +
 * gerçek Prisma şeması + gerçek uç işleyicisi (POST /api/account-deletion/confirm). E-posta gönderimi sahte (alıcı ve
 * bağlantı yakalanır), Redis bellek içi sahte, hız sınırı her zaman geçer (sınır ayrı birim testinde).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createHash } from 'node:crypto';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => null,
  withRedis: async (fn: (r: unknown) => Promise<unknown>) =>
    fn({ get: async () => null, set: async () => 'OK', del: async () => 0 }),
}));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: true, remaining: 1, resetAt: 0 }),
  requestIp: () => '127.0.0.1',
}));
const mail = vi.hoisted(() => ({
  requests: [] as { to: string; link: string; locale: string }[],
  deleted: [] as { to: string; locale: string }[],
}));
vi.mock('@/lib/security', async (orig) => ({
  ...(await orig<typeof import('@/lib/security')>()),
  sendAccountDeletionRequestEmail: async (to: string, link: string, locale: string) => {
    mail.requests.push({ to, link, locale });
    return true;
  },
  sendAccountDeletedEmail: async (to: string, locale = 'tr') => {
    mail.deleted.push({ to, locale });
    return true;
  },
}));

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let mod: typeof import('@/server/account/deletionRequest');
let confirmHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
let DELETED_USER_ID: string;

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  process.env.AUTH_URL = 'https://www.getscor3.com';
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  mod = await import('@/server/account/deletionRequest');
  confirmHandler = (await import('@/pages/api/account-deletion/confirm')).default;
  ({ DELETED_USER_ID } = await import('@/config/deletedUser'));
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

beforeEach(() => {
  mail.requests = [];
  mail.deleted = [];
});

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const tokenOf = (link: string) => /#token=([0-9a-f]{64})$/.exec(link)![1];

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (b: unknown) => {
    res.body = b;
    return res;
  };
  res.setHeader = (k: string, v: string) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res as NextApiResponse & { statusCode: number; body: any; headers: Record<string, string> };
}

async function callConfirm(method: string, body: unknown) {
  const res = mockRes();
  await confirmHandler({ method, headers: {}, socket: {}, query: {}, body } as unknown as NextApiRequest, res);
  return res;
}

async function seedUser(label: string, extra: Record<string, unknown> = {}) {
  const email = `${label}@example.invalid`;
  return prisma.user.create({ data: { email, emailNormalized: email, username: `u_${label}`, ...extra } });
}

/** Talep et → yakalanan bağlantıdaki ham belirteci döndür. */
async function requestToken(email: string, locale: 'tr' | 'en' = 'tr') {
  expect(await mod.requestAccountDeletion(email, locale)).toBe('sent');
  return tokenOf(mail.requests.at(-1)!.link);
}

describe('talep (requestAccountDeletion)', () => {
  it('kayıtlı hesap: kayıtlı adrese bağlantı; veritabanında yalnız özet, 1 saat, kimlik e-posta içermez', async () => {
    const u = await seedUser('req1');
    const before = Date.now();
    const raw = await requestToken('  REQ1@example.invalid ', 'en');
    expect(mail.requests).toEqual([
      { to: 'req1@example.invalid', link: `https://www.getscor3.com/hesap-silme/onay#token=${raw}`, locale: 'en' },
    ]);
    const rows = await prisma.verificationToken.findMany({ where: { identifier: `account-delete:${u.id}` } });
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(sha(raw));
    expect(rows[0].token).not.toBe(raw);
    expect(rows[0].identifier).not.toContain('@');
    const ttl = rows[0].expires.getTime() - before;
    expect(ttl).toBeGreaterThan(59 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 5_000);
  });

  it('kayıtsız adres: e-posta yok, satır yok', async () => {
    const n = await prisma.verificationToken.count();
    expect(await mod.requestAccountDeletion('yok-boyle-biri@example.invalid', 'tr')).toBe('no_account');
    expect(mail.requests).toEqual([]);
    expect(await prisma.verificationToken.count()).toBe(n);
  });

  it('ADMIN, resmi Gündem hesabı ve "Silinmiş kullanıcı" yer tutucusu: e-posta yok, satır yok', async () => {
    const admin = await seedUser('admin1', { role: 'ADMIN' });
    const official = await prisma.user.create({ data: { email: 'info@getscor3.com', username: 'resmi' } });
    await prisma.user.upsert({
      where: { id: DELETED_USER_ID },
      update: {},
      create: { id: DELETED_USER_ID, email: 'deleted-user@deleted.invalid', name: 'Silinmiş kullanıcı' },
    });
    expect(await mod.requestAccountDeletion(admin.email, 'tr')).toBe('protected');
    expect(await mod.requestAccountDeletion('INFO@getscor3.com', 'tr')).toBe('protected');
    expect(await mod.requestAccountDeletion('deleted-user@deleted.invalid', 'tr')).toBe('protected');
    expect(mail.requests).toEqual([]);
    for (const id of [admin.id, official.id, DELETED_USER_ID]) {
      expect(await prisma.verificationToken.count({ where: { identifier: `account-delete:${id}` } })).toBe(0);
    }
  });

  it('kanonik eşleşme (Gmail noktası / +etiket): bağlantı yazılan adrese değil KAYITLI adrese gider', async () => {
    await prisma.user.create({ data: { email: 'ali.veli@gmail.com', emailNormalized: 'aliveli@gmail.com' } });
    await requestToken('aliveli+x@gmail.com');
    expect(mail.requests.map((r) => r.to)).toEqual(['ali.veli@gmail.com']);
  });

  it('yeni talep eski bağlantıyı geçersiz kılar (kullanıcı başına tek geçerli bağlantı)', async () => {
    const u = await seedUser('req2');
    const first = await requestToken(u.email);
    const second = await requestToken(u.email);
    expect(await mod.checkAccountDeletionToken(first)).toBe(false);
    expect(await mod.checkAccountDeletionToken(second)).toBe(true);
    expect(await prisma.verificationToken.count({ where: { identifier: `account-delete:${u.id}` } })).toBe(1);
  });
});

describe('onay (confirmAccountDeletion + POST /api/account-deletion/confirm)', () => {
  it('GET ve sayfa kontrolü silmez; POST siler; aynı bağlantı ikinci kez çalışmaz', async () => {
    const u = await seedUser('conf1');
    const raw = await requestToken(u.email);

    const get = await callConfirm('GET', undefined);
    expect(get.statusCode).toBe(405);
    expect(get.headers.Allow).toBe('POST');
    const getWithToken = await callConfirm('GET', { token: raw });
    expect(getWithToken.statusCode).toBe(405);

    const check = await callConfirm('POST', { token: raw, check: true });
    expect(check.statusCode).toBe(200);
    expect(check.body).toEqual({ valid: true });
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1); // hâlâ var
    expect(await mod.checkAccountDeletionToken(raw)).toBe(true); // tüketilmedi

    const del = await callConfirm('POST', { token: raw, locale: 'en' });
    expect(del.statusCode).toBe(200);
    expect(del.body).toEqual({ ok: true, deleted: true, emailSent: true });
    expect(del.headers['Cache-Control']).toBe('no-store');
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(mail.deleted).toEqual([{ to: 'conf1@example.invalid', locale: 'en' }]);

    const again = await callConfirm('POST', { token: raw });
    expect(again.statusCode).toBe(410);
    expect(again.body.code).toBe('INVALID_TOKEN');
    expect((await callConfirm('POST', { token: raw, check: true })).body).toEqual({ valid: false });
  });

  it('süresi dolmuş bağlantı (1 saat + 1 dk) silmez', async () => {
    const u = await seedUser('exp1');
    const raw = await requestToken(u.email);
    const later = () => Date.now() + 61 * 60_000;
    expect(await mod.checkAccountDeletionToken(raw, { now: later })).toBe(false);
    expect(await mod.confirmAccountDeletion(raw, 'tr', { now: later })).toEqual({ ok: false, reason: 'INVALID_TOKEN' });
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1);
  });

  it('bozuk / başka türden belirteç: veritabanına sorulmadan reddedilir; şifre sıfırlama belirteci silme yapamaz', async () => {
    const u = await seedUser('bad1');
    const resetRaw = 'a'.repeat(64);
    await prisma.verificationToken.create({
      data: { identifier: `reset:${u.email}`, token: sha(resetRaw), expires: new Date(Date.now() + 3600_000) },
    });
    for (const t of [undefined, '', 'x', 'A'.repeat(64), `${'a'.repeat(63)}g`, { $ne: null }]) {
      expect((await callConfirm('POST', { token: t })).statusCode).toBe(410);
    }
    expect((await callConfirm('POST', { token: resetRaw })).statusCode).toBe(410);
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1);
  });

  it('eşzamanlı iki onay: yalnız biri siler', async () => {
    const u = await seedUser('race1');
    const raw = await requestToken(u.email);
    const results = await Promise.all([mod.confirmAccountDeletion(raw, 'tr'), mod.confirmAccountDeletion(raw, 'tr')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'INVALID_TOKEN' }]);
    expect(mail.deleted).toHaveLength(1);
  });

  it('deleteOwnAccount sonucu: Google ile girişli şifresiz hesap silinir, gönderi "Silinmiş kullanıcı"ya geçer, denetim kaydı email_link', async () => {
    const u = await seedUser('goog1'); // şifre yok
    await prisma.account.create({ data: { userId: u.id, type: 'oauth', provider: 'google', providerAccountId: 'g-goog1' } });
    const post = await prisma.post.create({ data: { authorId: u.id, body: 'gönderi goog1' } });
    await prisma.verificationToken.create({ data: { identifier: u.email, token: 'vt-goog1', expires: new Date(Date.now() + 1e6) } });
    const raw = await requestToken(u.email);
    const logsBefore = await prisma.accountDeletionLog.count();

    const result = await mod.confirmAccountDeletion(raw, 'tr');
    expect(result).toMatchObject({ ok: true, emailSent: true, counts: { postsAnonymized: 1 } });
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    expect(await prisma.account.count({ where: { userId: u.id } })).toBe(0);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).authorId).toBe(DELETED_USER_ID);
    expect(await prisma.verificationToken.count({ where: { identifier: { in: [u.email, `account-delete:${u.id}`] } } })).toBe(0);

    expect(await prisma.accountDeletionLog.count()).toBe(logsBefore + 1);
    const log = await prisma.accountDeletionLog.findFirstOrThrow({ orderBy: { createdAt: 'desc' } });
    expect(log).toMatchObject({ source: 'email_link', hadPassword: false, oauthProviders: ['google'] });
    expect(JSON.stringify(log)).not.toContain('goog1');
  });

  it('bağlantı gönderildikten sonra ADMIN yapılan hesap: belirteç tüketilir ama silinmez (403)', async () => {
    const u = await seedUser('promo1');
    const raw = await requestToken(u.email);
    await prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
    const res = await callConfirm('POST', { token: raw });
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('PROTECTED_ACCOUNT');
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1);
  });
});

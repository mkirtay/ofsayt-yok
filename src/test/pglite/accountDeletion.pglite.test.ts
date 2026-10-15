/* eslint-disable @typescript-eslint/no-explicit-any -- NextAuth iç modülleri ve sahte req/res gevşek tipli */
/**
 * Hesap silme + Kullanım Şartları onayı — GERÇEK SQL motoru (PGlite, bellek içi; ağdaki hiçbir DB'ye bağlanılmaz) +
 * gerçek Prisma şeması (CASCADE / SetNull kuralları dahil) + gerçek uç işleyicileri (DELETE /api/user/me,
 * POST /api/user/terms-consent) + NextAuth `jwt` / `signIn` / `callbackHandler` sırası (Google ilk girişi).
 * Redis bellek içi sahte (oturum sürümü önbelleğinin silindiğinin kanıtı); e-posta gönderimi sahte.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRequire } from 'node:module';
import path from 'node:path';
import { hash } from 'bcryptjs';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

const redisState = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => null,
  withRedis: async (fn: (r: unknown) => Promise<unknown>) =>
    fn({
      get: async (k: string) => (redisState.store.has(k) ? redisState.store.get(k) : null),
      set: async (k: string, v: unknown) => {
        redisState.store.set(k, v);
        return 'OK';
      },
      del: async (k: string) => (redisState.store.delete(k) ? 1 : 0),
    }),
}));
const sent = vi.hoisted(() => ({ to: [] as string[] }));
vi.mock('@/lib/security', async (orig) => ({
  ...(await orig<typeof import('@/lib/security')>()),
  sendAccountDeletedEmail: async (email: string) => {
    sent.to.push(email);
    return true;
  },
}));

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let authOptions: typeof import('@/lib/auth-options').authOptions;
let SessionRevokedError: typeof import('@/lib/auth-options').SessionRevokedError;
let issueMobileToken: typeof import('@/lib/mobileAuth').issueMobileToken;
let getRequestAuth: typeof import('@/lib/mobileAuth').getRequestAuth;
let getSessionVersion: typeof import('@/lib/sessionVersion').getSessionVersion;
let deleteOwnAccount: typeof import('@/server/account/deleteAccount').deleteOwnAccount;
let requireTermsConsent: typeof import('@/lib/termsConsentGate').requireTermsConsent;
let meHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
let termsHandler: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
let serializeAuthor: typeof import('@/lib/gundem/posts').serializeAuthor;
let postAuthorSelect: typeof import('@/lib/gundem/posts').postAuthorSelect;
let google: any;
let callbackHandler: (params: any) => Promise<{ user: any; isNewUser?: boolean }>;
let DELETED_USER_ID: string;

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  process.env.AUTH_SECRET = 'itest-secret-account-deletion';
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  ({ authOptions, SessionRevokedError } = await import('@/lib/auth-options'));
  ({ issueMobileToken, getRequestAuth } = await import('@/lib/mobileAuth'));
  ({ getSessionVersion } = await import('@/lib/sessionVersion'));
  ({ deleteOwnAccount } = await import('@/server/account/deleteAccount'));
  ({ requireTermsConsent } = await import('@/lib/termsConsentGate'));
  ({ serializeAuthor, postAuthorSelect } = await import('@/lib/gundem/posts'));
  ({ DELETED_USER_ID } = await import('@/config/deletedUser'));
  meHandler = (await import('@/pages/api/user/me')).default;
  termsHandler = (await import('@/pages/api/user/terms-consent')).default;
  const { oauthProviders } = await import('@/lib/oauth');
  const [p] = oauthProviders({ GOOGLE_CLIENT_ID: 'itest-client', GOOGLE_CLIENT_SECRET: 'itest-secret' }) as any[];
  google = { ...p, ...p.options };
  callbackHandler = createRequire(import.meta.url)(path.resolve('node_modules/next-auth/core/lib/callback-handler.js')).default;
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

beforeEach(() => {
  redisState.store.clear();
  sent.to = [];
});

// ── yardımcılar ──────────────────────────────────────────────────────────────

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
  return res as NextApiResponse & { statusCode: number; body: any };
}

const bearerReq = (token: string, method: string, body: unknown = {}) =>
  ({ method, headers: { authorization: `Bearer ${token}` }, cookies: {}, query: {}, body }) as unknown as NextApiRequest;

async function mobileTokenFor(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return issueMobileToken({ sub: u.id, role: u.role, email: u.email, tokenVersion: u.tokenVersion });
}

/** Silinecek kullanıcı + her ilişkili tabloda en az bir satır; bir de başka kullanıcı (`other`). */
async function seedFullUser(label: string) {
  const email = `${label}@example.invalid`;
  const user = await prisma.user.create({
    data: {
      email,
      emailNormalized: email,
      name: `Ad ${label}`,
      username: `u_${label}`,
      bio: 'kişisel bio',
      password: await hash('Gecerli-Sifre-123', 4),
      credits: 7,
      favoriteTeamIds: [1, 2],
      termsAcceptedAt: new Date(),
      termsVersion: '2026-10-14',
    },
  });
  const other = await prisma.user.create({ data: { email: `other-${label}@example.invalid`, username: `o_${label}`, referredById: user.id } });
  await prisma.account.create({ data: { userId: user.id, type: 'oauth', provider: 'google', providerAccountId: `g-${label}` } });
  await prisma.session.create({ data: { userId: user.id, sessionToken: `st-${label}`, expires: new Date(Date.now() + 1e6) } });
  const post = await prisma.post.create({ data: { authorId: user.id, body: `gönderi ${label}` } });
  const otherPost = await prisma.post.create({ data: { authorId: other.id, body: `diğer ${label}` } });
  await prisma.postComment.create({ data: { postId: otherPost.id, userId: user.id, body: `yorum ${label}` } });
  await prisma.postLike.create({ data: { postId: otherPost.id, userId: user.id } });
  await prisma.matchComment.create({ data: { matchId: '123', userId: user.id, body: `eski yorum ${label}` } });
  await prisma.follow.create({ data: { followerId: user.id, followingId: other.id } });
  await prisma.follow.create({ data: { followerId: other.id, followingId: user.id } });
  await prisma.notification.create({ data: { userId: user.id, actorId: other.id, type: 'FOLLOW' } });
  await prisma.notification.create({ data: { userId: other.id, actorId: user.id, type: 'FOLLOW' } });
  await prisma.pushToken.create({ data: { userId: user.id, token: `ExponentPushToken[${label}]`, platform: 'ios' } });
  await prisma.creditTransaction.create({ data: { userId: user.id, type: 'SIGNUP_BONUS', amount: 2, balanceAfter: 2 } });
  await prisma.premiumGrant.create({ data: { userId: user.id, source: 'ADMIN' } });
  await prisma.userPrediction.create({ data: { matchId: '123', userId: user.id, prediction: 'HOME' } });
  await prisma.frikikDailyScore.create({
    data: { userId: user.id, day: '2026-10-14', month: '2026-10', score: 10, level: 2, cleared: 1, simVersion: 1, seed: 1, shots: 3 },
  });
  const order = await prisma.paymentOrder.create({
    data: { merchantOrderId: `m-${label}`, userId: user.id, packageKey: 'credits_10', amountTRY: '39.99', status: 'PAID', paidAt: new Date(), hikieOrderId: `inv-${label}` },
  });
  await prisma.referral.create({ data: { referrerId: user.id, refereeId: other.id } });
  await prisma.verificationToken.create({ data: { identifier: email, token: `vt-${label}`, expires: new Date(Date.now() + 1e6) } });
  await prisma.verificationToken.create({ data: { identifier: `reset:${email}`, token: `rt-${label}`, expires: new Date(Date.now() + 1e6) } });
  const analysis = await prisma.matchAnalysis.create({
    data: {
      matchId: `ma-${label}`, matchStatus: 'PRE', modelVersion: 't', homeTeamName: 'A', awayTeamName: 'B', homeTeamNarrative: '',
      awayTeamNarrative: '', matchPrediction: {}, scorePrediction: {}, goalExpectation: {}, bettingTips: [], teamAnalyses: {},
      riskLevel: 'low', riskReasoning: '', confidenceScore: 50,
    },
  });
  await prisma.analysisUnlock.create({ data: { userId: user.id, matchAnalysisId: analysis.id, matchId: analysis.matchId, source: 'CREDIT' } });
  return { user, other, post, otherPost, order, analysis };
}

// ── hesap silme ──────────────────────────────────────────────────────────────

describe('hesap silme (gerçek SQL)', () => {
  it('kişisel veriler silinir; gönderi/yorum "Silinmiş kullanıcı"ya, sipariş yer tutucuya devredilir; denetim kaydında PII yok', async () => {
    const { user, other, post, otherPost, order, analysis } = await seedFullUser('full');
    // Canlıdaki gibi: yer tutucu satırı önceden YOK (migration / ayrı INSERT gerekmez) — ilk silmede upsert ile oluşur.
    expect(await prisma.user.count({ where: { id: DELETED_USER_ID } })).toBe(0);
    const result = await deleteOwnAccount(user.id, { confirm: 'SİL', source: 'web' });
    expect(result).toEqual({
      ok: true,
      emailSent: true,
      counts: {
        postsAnonymized: 1,
        postCommentsAnonymized: 1,
        matchCommentsAnonymized: 1,
        paymentOrdersDetached: 1,
        referralsDeleted: 1,
        verificationTokensDeleted: 2,
        reportsAnonymized: 0,
        blocksDeleted: 0,
        mentionsDeleted: 0,
      },
    });
    expect(sent.to).toEqual(['full@example.invalid']);

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    const uid = { userId: user.id };
    expect(await prisma.account.count({ where: uid })).toBe(0);
    expect(await prisma.session.count({ where: uid })).toBe(0);
    expect(await prisma.postLike.count({ where: uid })).toBe(0);
    expect(await prisma.follow.count({ where: { OR: [{ followerId: user.id }, { followingId: user.id }] } })).toBe(0);
    expect(await prisma.notification.count({ where: uid })).toBe(0);
    expect(await prisma.pushToken.count({ where: uid })).toBe(0);
    expect(await prisma.creditTransaction.count({ where: uid })).toBe(0);
    expect(await prisma.premiumGrant.count({ where: uid })).toBe(0);
    expect(await prisma.userPrediction.count({ where: uid })).toBe(0);
    expect(await prisma.frikikDailyScore.count({ where: uid })).toBe(0);
    expect(await prisma.analysisUnlock.count({ where: uid })).toBe(0);
    expect(await prisma.referral.count({ where: { OR: [{ referrerId: user.id }, { refereeId: user.id }] } })).toBe(0);
    expect(await prisma.verificationToken.count({ where: { identifier: { contains: 'full@example.invalid' } } })).toBe(0);
    // Bu kullanıcının aktör olduğu bildirim alıcıda kalır, aktör boşalır (SetNull); davet ettiğinin bağlantısı kopar.
    expect(await prisma.notification.findFirst({ where: { userId: other.id }, select: { actorId: true } })).toEqual({ actorId: null });
    expect(await prisma.user.findUnique({ where: { id: other.id }, select: { referredById: true } })).toEqual({ referredById: null });
    // Paylaşılan içerik ve sipariş kalır, kişiyle bağı kopar
    expect(await prisma.post.findUnique({ where: { id: post.id }, select: { authorId: true, body: true } })).toEqual({ authorId: DELETED_USER_ID, body: 'gönderi full' });
    expect(await prisma.postComment.findFirst({ where: { postId: otherPost.id }, select: { userId: true } })).toEqual({ userId: DELETED_USER_ID });
    expect(await prisma.matchComment.findFirst({ where: { matchId: '123' }, select: { userId: true } })).toEqual({ userId: DELETED_USER_ID });
    expect(
      await prisma.paymentOrder.findUnique({ where: { id: order.id }, select: { userId: true, status: true, amountTRY: true, hikieOrderId: true, merchantOrderId: true } }),
    ).toMatchObject({ userId: DELETED_USER_ID, status: 'PAID', hikieOrderId: 'inv-full', merchantOrderId: 'm-full' });
    // Kullanıcıya bağlı olmayan veri etkilenmez
    expect(await prisma.matchAnalysis.count({ where: { id: analysis.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: other.id } })).toBe(1);

    // Yer tutucu: giriş yapılamaz, kişisel veri yok
    const sentinel = await prisma.user.findUniqueOrThrow({ where: { id: DELETED_USER_ID }, include: { accounts: true } });
    expect(sentinel).toMatchObject({ password: null, username: null, image: null, bio: null, credits: 0, role: 'USER', accounts: [] });
    expect(sentinel.email.endsWith('.invalid')).toBe(true);

    // Denetim kaydı: kişiyle eşleştirilebilecek hiçbir alan yok
    const logs = await prisma.accountDeletionLog.findMany();
    expect(logs).toHaveLength(1);
    const text = JSON.stringify(logs[0]);
    for (const pii of [user.id, user.email, 'Ad full', 'u_full', 'kişisel bio']) expect(text).not.toContain(pii);
    expect(logs[0]).toMatchObject({ source: 'web', hadPassword: true, oauthProviders: ['google'], accountAgeDays: 0 });
  });

  it('Gündem serileştirmesi: silinmiş kullanıcının gönderisi `deleted` bayrağıyla, e-posta sızmadan', async () => {
    const row = await prisma.user.findUniqueOrThrow({ where: { id: DELETED_USER_ID }, select: postAuthorSelect(null) });
    const author = serializeAuthor(row);
    expect(author).toMatchObject({ id: DELETED_USER_ID, deleted: true, official: false, name: 'Silinmiş kullanıcı', username: null });
    expect(JSON.stringify(author)).not.toContain('.invalid');
  });

  it('ikinci silme aynı yer tutucuyu kullanır (tek satır)', async () => {
    const { user } = await seedFullUser('second');
    expect((await deleteOwnAccount(user.id, { confirm: 'second@example.invalid', source: 'mobile' })).ok).toBe(true);
    expect(await prisma.user.count({ where: { name: 'Silinmiş kullanıcı' } })).toBe(1);
    expect(await prisma.post.count({ where: { authorId: DELETED_USER_ID } })).toBe(2);
    expect(await prisma.paymentOrder.count({ where: { userId: DELETED_USER_ID } })).toBe(2);
  });

  it('oturumlar hemen geçersiz: önbellekteki sürüm silinir, web jwt kontrolü düşer, mobil belirteç reddedilir', async () => {
    const { user } = await seedFullUser('revoke');
    const token = await mobileTokenFor(user.id);
    // Önbellek ısınsın (silmeden önce geçerli)
    expect(await getSessionVersion(user.id)).not.toBeNull();
    expect((await getRequestAuth(bearerReq(token, 'GET'), mockRes()))?.id).toBe(user.id);
    expect([...redisState.store.keys()].some((k) => k.includes(`session-version:${user.id}`))).toBe(true);

    await deleteOwnAccount(user.id, { confirm: 'sil', source: 'web' });

    expect([...redisState.store.keys()].some((k) => k.includes(`session-version:${user.id}`))).toBe(false);
    expect(await getRequestAuth(bearerReq(token, 'GET'), mockRes())).toBeNull();
    await expect(authOptions.callbacks!.jwt!({ token: { sub: user.id, tokenVersion: 0 } } as any)).rejects.toBeInstanceOf(SessionRevokedError);
  });

  it('yanlış onay metni, yönetici, resmi hesap ve yer tutucunun kendisi silinmez', async () => {
    const { user } = await seedFullUser('guard');
    expect(await deleteOwnAccount(user.id, { confirm: 'evet', source: 'web' })).toEqual({ ok: false, reason: 'CONFIRM_MISMATCH' });
    expect(await deleteOwnAccount(user.id, { confirm: 'other-guard@example.invalid', source: 'web' })).toEqual({ ok: false, reason: 'CONFIRM_MISMATCH' });
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);

    const admin = await prisma.user.create({ data: { email: 'admin-del@example.invalid', role: 'ADMIN' } });
    expect(await deleteOwnAccount(admin.id, { confirm: 'SİL', source: 'web' })).toEqual({ ok: false, reason: 'PROTECTED_ACCOUNT' });
    const official = await prisma.user.create({ data: { email: 'info@getscor3.com' } });
    expect(await deleteOwnAccount(official.id, { confirm: 'SİL', source: 'web' })).toEqual({ ok: false, reason: 'PROTECTED_ACCOUNT' });
    expect(await deleteOwnAccount(DELETED_USER_ID, { confirm: 'SİL', source: 'web' })).toEqual({ ok: false, reason: 'PROTECTED_ACCOUNT' });
    expect(await deleteOwnAccount('yok-boyle-biri', { confirm: 'SİL', source: 'web' })).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('DELETE /api/user/me (mobil Bearer): 400 yanlış onay, 200 silme + kanal "mobile", sonra aynı belirteç 401', async () => {
    const { user } = await seedFullUser('api');
    const token = await mobileTokenFor(user.id);

    const bad = mockRes();
    await meHandler(bearerReq(token, 'DELETE', { confirm: 'hayır' }), bad);
    expect(bad.statusCode).toBe(400);
    expect(bad.body.code).toBe('CONFIRM_MISMATCH');

    const before = await prisma.accountDeletionLog.count();
    const ok = mockRes();
    await meHandler(bearerReq(token, 'DELETE', { confirm: 'API@example.invalid ' }), ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toEqual({ ok: true, deleted: true, emailSent: true });
    expect(await prisma.accountDeletionLog.count()).toBe(before + 1);
    expect((await prisma.accountDeletionLog.findFirst({ orderBy: { createdAt: 'desc' } }))?.source).toBe('mobile');

    const after = mockRes();
    await meHandler(bearerReq(token, 'GET'), after);
    expect(after.statusCode).toBe(401);
  });

  it('DELETE /api/user/me hız sınırı: 15 dakikada 5 deneme, sonra 429', async () => {
    const u = await prisma.user.create({ data: { email: 'rl-del@example.invalid' } });
    const token = await mobileTokenFor(u.id);
    for (let i = 0; i < 5; i++) {
      const r = mockRes();
      await meHandler(bearerReq(token, 'DELETE', { confirm: 'yanlış' }), r);
      expect(r.statusCode).toBe(400);
    }
    const r = mockRes();
    await meHandler(bearerReq(token, 'DELETE', { confirm: 'SİL' }), r);
    expect(r.statusCode).toBe(429);
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1);
  });
});

// ── Kullanım Şartları onayı ──────────────────────────────────────────────────

const googleRaw = (label: string) => ({
  sub: `sub-${label}`,
  name: `Google ${label}`,
  email: `${label}@example.invalid`,
  email_verified: true,
  picture: 'https://lh3.googleusercontent.com/a/itest',
});

/** OAuth callback sırası (googleLinking.pglite.test.ts ile aynı): getUserByAccount → signIn → callbackHandler → jwt. */
async function googleCallback(raw: ReturnType<typeof googleRaw>) {
  const profile = await google.profile(raw, {});
  const account = { provider: 'google', type: 'oauth', providerAccountId: raw.sub, token_type: 'bearer' };
  const byAccount = await (authOptions.adapter as any).getUserByAccount({ provider: 'google', providerAccountId: raw.sub });
  expect(await authOptions.callbacks!.signIn!({ user: byAccount ?? profile, account, profile: raw } as any)).toBe(true);
  const { user, isNewUser } = await callbackHandler({
    sessionToken: undefined,
    profile,
    account,
    options: { adapter: authOptions.adapter, jwt: {}, events: authOptions.events, session: { strategy: 'jwt', maxAge: 60 }, provider: google },
  });
  return authOptions.callbacks!.jwt!({
    token: { name: user.name, email: user.email, picture: user.image, sub: String(user.id) },
    user,
    account,
    profile: raw,
    isNewUser,
    trigger: isNewUser ? 'signUp' : 'signIn',
  } as any);
}

const sessionOf = async (token: any) =>
  (await authOptions.callbacks!.session!({ session: { user: {}, expires: '' }, token } as any)) as { user: { termsAccepted?: boolean } };

describe('Google ilk girişi ve onay', () => {
  it('Google ile ilk giriş onaysız açılır → oturumda termsAccepted=false; onay ucu kaydeder, update tetiği hemen true yapar', async () => {
    const token = await googleCallback(googleRaw('g-first'));
    expect(token.termsAccepted).toBe(false);
    expect((await sessionOf(token)).user.termsAccepted).toBe(false);
    const userId = String(token.sub);

    // Web (çerez) isteği: yazma kapısı 403 TERMS_REQUIRED
    const webReq = { method: 'POST', headers: {}, cookies: {}, query: {}, body: {} } as unknown as NextApiRequest;
    const gated = mockRes();
    expect(await requireTermsConsent(webReq, gated, userId)).toBe(false);
    expect(gated.statusCode).toBe(403);
    expect(gated.body.code).toBe('TERMS_REQUIRED');
    // Mobil (Bearer) muaf — yayındaki sürümler kilitlenmesin
    expect(await requireTermsConsent(bearerReq('x', 'POST'), mockRes(), userId)).toBe(true);

    const mobile = await mobileTokenFor(userId);
    const missing = mockRes();
    await termsHandler(bearerReq(mobile, 'POST', { acceptedTerms: 'true' }), missing);
    expect(missing.statusCode).toBe(400);
    const ok = mockRes();
    await termsHandler(bearerReq(mobile, 'POST', { acceptedTerms: true }), ok);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toMatchObject({ ok: true, termsVersion: '2026-10-14' });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { termsAcceptedAt: true, termsVersion: true } });
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);

    // İkinci onay ilk zamanı değiştirmez
    await termsHandler(bearerReq(mobile, 'POST', { acceptedTerms: true }), mockRes());
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).termsAcceptedAt).toEqual(row.termsAcceptedAt);

    expect(await requireTermsConsent(webReq, mockRes(), userId)).toBe(true);
    // Onay sayfası `update({ termsAccepted: true })`: 60 sn beklemeden DB'den (istemci değeri değil) tazelenir
    const refreshed = await authOptions.callbacks!.jwt!({ token: { ...token }, trigger: 'update', session: { termsAccepted: true } } as any);
    expect(refreshed.termsAccepted).toBe(true);
  });

  it('istemci update ile onayı taklit edemez: DB boşsa termsAccepted false kalır', async () => {
    const token = await googleCallback(googleRaw('g-spoof'));
    const refreshed = await authOptions.callbacks!.jwt!({ token: { ...token }, trigger: 'update', session: { termsAccepted: true } } as any);
    expect(refreshed.termsAccepted).toBe(false);
  });

  it('eski hesap (termsAcceptedAt boş, şifreli giriş) → false; kayıt onayı olan → true', async () => {
    const pw = await hash('Gecerli-Sifre-123', 4);
    await prisma.user.create({ data: { email: 'old@example.invalid', password: pw } });
    await prisma.user.create({ data: { email: 'new@example.invalid', password: pw, termsAcceptedAt: new Date(), termsVersion: '2026-10-14' } });
    const creds = authOptions.providers.find((p) => p.id === 'credentials') as any;
    for (const [email, expected] of [['old@example.invalid', false], ['new@example.invalid', true]] as const) {
      const user = await creds.options.authorize({ identifier: email, password: 'Gecerli-Sifre-123' });
      const token = await authOptions.callbacks!.jwt!({ token: { sub: user.id }, user, trigger: 'signIn' } as any);
      expect(token.termsAccepted, email).toBe(expected);
    }
  });
});

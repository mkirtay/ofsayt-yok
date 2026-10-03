/* eslint-disable @typescript-eslint/no-explicit-any -- entegrasyon testinde yanıt gövdeleri gevşek şemalı */
/**
 * GERÇEK veritabanı entegrasyon testi: Google girişi. Google'a gidilmez — OAuth dönüşünden SONRAKİ adım, NextAuth'un
 * kendi `callbackHandler`'ı + gerçek PrismaAdapter + bizim `signIn`/`events` ayarlarımızla çalıştırılır (callback route'unun
 * * yaptığı sırayla). Kapsam: mevcut hesaba e-postayla bağlanma, doğrulanmamış e-posta, başlangıç kredisinin tek sefer verilmesi,
 * Gündem kullanıcı adı zorunluluğu, mobil şifreli girişte "Google ile oluşturuldu" hatası.
 *
 * Çalıştırma: `npm run test:db`. Tüm veriler `itest-<runId>` önekli e-postalarla oluşturulur, test sonunda silinir.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRequire } from 'node:module';
import path from 'node:path';

// Redis `null` → rate limit süreç içi fallback (prod Redis'e yazılmaz).
vi.mock('@/lib/redis', () => ({ getRedisClient: () => null, withRedis: async (_fn: unknown, fallback: unknown) => fallback }));
// Kayıt doğrulama e-postası gerçekten gönderilmesin.
vi.mock('@/lib/security', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security')>();
  return { ...actual, createAndSendEmailVerification: vi.fn(async () => undefined) };
});

const ENABLED = process.env.DB_INTEGRATION === '1';
const d = ENABLED ? describe : describe.skip;

type Captured = { status: number; body: any };
type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

function makeReq(opts: { method: string; query?: Record<string, string>; body?: unknown; token?: string }): NextApiRequest {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      host: 'localhost:3001',
      'x-forwarded-for': '203.0.113.21',
    },
    socket: { remoteAddress: '203.0.113.21' },
    cookies: {},
  } as unknown as NextApiRequest;
}
async function call(handler: Handler, req: NextApiRequest): Promise<Captured> {
  const out: Captured = { status: 200, body: undefined };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(b: unknown) {
      out.body = b;
      return this;
    },
    setHeader() {
      return this;
    },
    getHeader() {
      return undefined;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return out;
}

d('DB entegrasyonu — Google ile giriş', () => {
  const runId = `itest-${Math.random().toString(16).slice(2, 10)}`;
  const email = (label: string) => `${runId}-${label}@example.invalid`;

  let prisma: typeof import('@/lib/prisma').prisma;
  let authOptions: typeof import('@/lib/auth-options').authOptions;
  let google: any;
  let callbackHandler: (params: any) => Promise<{ user: any; isNewUser?: boolean }>;
  let issueMobileToken: typeof import('@/lib/mobileAuth').issueMobileToken;
  let createUserAccount: typeof import('@/lib/accounts').createUserAccount;
  let grantVerifiedSignupBonus: typeof import('@/lib/credits').grantVerifiedSignupBonus;
  let postsHandler: Handler;
  let commentsHandler: Handler;
  let meHandler: Handler;
  let mobileLoginHandler: Handler;

  const googleProfile = (label: string, sub: string, over: Record<string, unknown> = {}) => ({
    sub,
    name: `ITest ${label}`,
    email: email(label),
    email_verified: true,
    picture: 'https://lh3.googleusercontent.com/a/itest',
    ...over,
  });

  /** NextAuth OAuth callback route'unun sırası: signIn callback → (izin verilirse) callbackHandler (adapter + events). */
  async function googleCallback(raw: ReturnType<typeof googleProfile>) {
    const profile = await google.profile(raw, {});
    const account = { provider: 'google', type: 'oauth', providerAccountId: raw.sub, token_type: 'bearer', scope: 'openid email profile' };
    const allowed = await authOptions.callbacks!.signIn!({ user: profile, account, profile: raw } as any);
    if (allowed !== true) return { redirect: allowed };
    const result = await callbackHandler({
      sessionToken: undefined,
      profile,
      account,
      options: {
        adapter: authOptions.adapter,
        jwt: {},
        events: authOptions.events,
        session: { strategy: 'jwt', maxAge: 60 },
        provider: google,
      },
    });
    return { user: result.user, isNewUser: result.isNewUser };
  }

  const bonusCount = (userId: string) => prisma.creditTransaction.count({ where: { userId, type: 'SIGNUP_BONUS' } });

  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    ({ authOptions } = await import('@/lib/auth-options'));
    const { oauthProviders } = await import('@/lib/oauth');
    const [p] = oauthProviders({ GOOGLE_CLIENT_ID: 'itest-client', GOOGLE_CLIENT_SECRET: 'itest-secret' }) as any[];
    google = { ...p, ...p.options }; // NextAuth çekirdeğinin yaptığı gibi kullanıcı seçenekleri provider'a birleşir
    // İç modül paket `exports`'unda yok → dosya yolundan (NextAuth'un kendi OAuth callback işleyicisi)
    callbackHandler = createRequire(import.meta.url)(path.resolve('node_modules/next-auth/core/lib/callback-handler.js')).default;
    ({ issueMobileToken } = await import('@/lib/mobileAuth'));
    ({ createUserAccount } = await import('@/lib/accounts'));
    ({ grantVerifiedSignupBonus } = await import('@/lib/credits'));
    postsHandler = (await import('@/pages/api/gundem/posts/index')).default;
    commentsHandler = (await import('@/pages/api/gundem/posts/[postId]/comments')).default;
    meHandler = (await import('@/pages/api/user/me')).default;
    mobileLoginHandler = (await import('@/pages/api/mobile/auth/login')).default;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: runId } } }); // Account/CreditTransaction/Post cascade
    const left = await prisma.user.count({ where: { email: { startsWith: runId } } });
    await prisma.$disconnect();
    expect(left).toBe(0);
  });

  it('yeni doğrulanmış Google kullanıcısı: hesap + Account, ad/foto profilden, e-posta doğrulanmış, kayıt bonusu (2) TEK sefer', async () => {
    const first = await googleCallback(googleProfile('new', `${runId}-sub-new`));
    expect(first.isNewUser).toBe(true);
    const row = await prisma.user.findUniqueOrThrow({
      where: { email: email('new') },
      select: { id: true, name: true, image: true, username: true, password: true, role: true, credits: true, emailVerified: true, accounts: { select: { provider: true, providerAccountId: true } } },
    });
    expect(row).toMatchObject({ name: 'ITest new', image: 'https://lh3.googleusercontent.com/a/itest', username: null, password: null, role: 'USER', credits: 2 });
    expect(row.emailVerified).toBeInstanceOf(Date);
    expect(row.accounts).toEqual([{ provider: 'google', providerAccountId: `${runId}-sub-new` }]);
    expect(await bonusCount(row.id)).toBe(1);

    // İkinci giriş aynı kullanıcı; yeni hesap/bonus yok. Tekrar çağrılan bonus kaydı da no-op.
    const second = await googleCallback(googleProfile('new', `${runId}-sub-new`));
    expect(second.user.id).toBe(row.id);
    expect(second.isNewUser).toBe(false);
    expect(await grantVerifiedSignupBonus(row.id)).toBe(false);
    expect(await Promise.all([grantVerifiedSignupBonus(row.id), grantVerifiedSignupBonus(row.id)])).toEqual([false, false]);
    expect(await bonusCount(row.id)).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: row.id }, select: { credits: true } })).credits).toBe(2);
  });

  it('e-posta/şifre kaydı 0 krediyle başlar; bonus (2) e-posta doğrulanınca bir kez', async () => {
    const r = await createUserAccount({ email: email('cred'), password: 'Itest-Pass-123!', name: 'Cred' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await prisma.user.findUniqueOrThrow({ where: { id: r.user.id }, select: { credits: true } })).credits).toBe(0);
    expect(await bonusCount(r.user.id)).toBe(0);
    expect(await grantVerifiedSignupBonus(r.user.id)).toBe(true);
    expect(await grantVerifiedSignupBonus(r.user.id)).toBe(false);
    expect(await bonusCount(r.user.id)).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: r.user.id }, select: { credits: true } })).credits).toBe(2);
  });

  it('aynı e-postalı (doğrulanmış) hesabı varsa Google o hesaba bağlanır ve o hesapla girilir; şifre, ad, bakiye aynen kalır', async () => {
    const r = await createUserAccount({ email: email('linkv'), password: 'Itest-Pass-123!', name: 'Mevcut Ad' });
    if (!r.ok) throw new Error(r.error);
    await prisma.user.update({ where: { id: r.user.id }, data: { emailVerified: new Date('2026-01-01T00:00:00Z') } });
    const pick = { id: true, name: true, image: true, password: true, credits: true, emailVerified: true } as const;
    const before = await prisma.user.findUniqueOrThrow({ where: { id: r.user.id }, select: pick });

    // Büyük harfli Google e-postası da aynı hesaba denk gelir (küçük harfe çevrilir)
    const first = await googleCallback(googleProfile('linkv', `${runId}-sub-linkv`, { email: email('linkv').toUpperCase() }));
    expect(first.user.id).toBe(r.user.id);
    expect(await prisma.account.findMany({ where: { userId: r.user.id }, select: { provider: true, providerAccountId: true } })).toEqual([
      { provider: 'google', providerAccountId: `${runId}-sub-linkv` },
    ]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: r.user.id }, select: pick })).toEqual(before);
    expect(await prisma.user.count({ where: { email: { in: [email('linkv'), email('linkv').toUpperCase()] } } })).toBe(1);

    // Sonraki girişler aynı hesap; yeni bağ/bonus yok
    const again = await googleCallback(googleProfile('linkv', `${runId}-sub-linkv`, { email: email('linkv') }));
    expect(again.user.id).toBe(r.user.id);
    expect(await prisma.account.count({ where: { userId: r.user.id } })).toBe(1);
    // Hesap testte elle doğrulanmış (bonus yolundan geçmedi); zaten doğrulanmış hesaba bağlama bonus vermez.
    expect(await bonusCount(r.user.id)).toBe(0);
  });

  it('aynı e-postalı hesap bizde doğrulanmamışsa da bağlanır; e-posta doğrulanır ve önceden konmuş şifre silinir', async () => {
    const r = await createUserAccount({ email: email('linku'), password: 'Itest-Pass-123!', name: 'Doğrulanmamış' });
    if (!r.ok) throw new Error(r.error);
    const got = await googleCallback(googleProfile('linku', `${runId}-sub-linku`));
    expect(got.user.id).toBe(r.user.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: r.user.id }, select: { password: true, emailVerified: true, credits: true } });
    expect(after.password).toBeNull();
    expect(after.emailVerified).toBeInstanceOf(Date);
    // E-posta bu bağlamayla doğrulandı → kayıt bonusu (2)
    expect(after.credits).toBe(2);
    expect(await bonusCount(r.user.id)).toBe(1);
  });

  it("Google'da e-postası doğrulanmamış hesap giremez; kullanıcı oluşturulmaz", async () => {
    const r = await googleCallback(googleProfile('unverified', `${runId}-sub-unv`, { email_verified: false }));
    expect(r).toEqual({ redirect: '/auth/signin?error=GoogleEmailNotVerified' });
    expect(await prisma.user.count({ where: { email: email('unverified') } })).toBe(0);
    expect(await prisma.account.count({ where: { providerAccountId: `${runId}-sub-unv` } })).toBe(0);
  });

  it('Gündem: kullanıcı adsız Google kullanıcısı post/yorum atamaz (403 USERNAME_REQUIRED); ad seçince atar. Şifreli adsız kullanıcı etkilenmez', async () => {
    const g = await prisma.user.findUniqueOrThrow({ where: { email: email('new') }, select: { id: true } });
    const gToken = await issueMobileToken({ sub: g.id, role: 'USER', credits: 5 });
    const c = await prisma.user.findUniqueOrThrow({ where: { email: email('cred') }, select: { id: true, username: true } });
    expect(c.username).toBeNull();
    const cToken = await issueMobileToken({ sub: c.id, role: 'USER', credits: 5 });

    const blocked = await call(postsHandler, makeReq({ method: 'POST', token: gToken, body: { body: 'itest google post' } }));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('USERNAME_REQUIRED');

    // Şifreli kullanıcı (kullanıcı adı yok) bugünkü gibi paylaşır
    const credPost = await call(postsHandler, makeReq({ method: 'POST', token: cToken, body: { body: 'itest cred post' } }));
    expect(credPost.status).toBe(201);

    const blockedComment = await call(commentsHandler, makeReq({ method: 'POST', query: { postId: credPost.body.id }, token: gToken, body: { body: 'yorum' } }));
    expect(blockedComment.status).toBe(403);
    expect(blockedComment.body.code).toBe('USERNAME_REQUIRED');

    // Mevcut kullanıcı adı doğrulama kuralları geçerli
    const bad = await call(meHandler, makeReq({ method: 'PATCH', token: gToken, body: { username: 'a b' } }));
    expect(bad.status).toBe(400);
    const uname = `it_${runId.slice(-8)}`;
    const ok = await call(meHandler, makeReq({ method: 'PATCH', token: gToken, body: { username: uname } }));
    expect(ok.status).toBe(200);
    expect(ok.body.username).toBe(uname);

    const post = await call(postsHandler, makeReq({ method: 'POST', token: gToken, body: { body: 'itest google post' } }));
    expect(post.status).toBe(201);
    const comment = await call(commentsHandler, makeReq({ method: 'POST', query: { postId: credPost.body.id }, token: gToken, body: { body: 'yorum' } }));
    expect(comment.status).toBe(201);
  });

  it('mobil şifreli giriş: Google ile oluşmuş hesapta anlamlı hata; şifreli hesap bugünkü gibi girer', async () => {
    const g = await call(mobileLoginHandler, makeReq({ method: 'POST', body: { identifier: email('new'), password: 'Herhangi-Bir-1!' } }));
    expect(g.status).toBe(401);
    expect(g.body).toMatchObject({ code: 'OAUTH_ACCOUNT_GOOGLE', error: 'Bu hesap Google ile oluşturuldu. Lütfen Google ile giriş yap.' });

    const wrong = await call(mobileLoginHandler, makeReq({ method: 'POST', body: { identifier: email('cred'), password: 'Yanlis-Sifre-1!' } }));
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBeUndefined();

    const ok = await call(mobileLoginHandler, makeReq({ method: 'POST', body: { identifier: email('cred'), password: 'Itest-Pass-123!' } }));
    expect(ok.status).toBe(200);
    expect(typeof ok.body.token).toBe('string');
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- NextAuth iç modülleri gevşek tipli */
/**
 * Google ile e-postaya göre mevcut hesaba bağlama — hesabı önceden açma saldırısı (GUVENLIK_RAPORU Y3). GERÇEK SQL
 * motoru (PGlite, bellek içi; ağdaki hiçbir DB'ye bağlanılmaz) + gerçek PrismaAdapter + NextAuth'un kendi
 * `callbackHandler`'ı + bizim `signIn` / `jwt` / `events` ayarlarımız, OAuth callback route'unun sırasıyla
 * (`node_modules/next-auth/core/routes/callback.js`: getUserByAccount → signIn → callbackHandler → jwt).
 * Redis iki kipte: yok (sessionVersion DB yedeği) ve bellek içi sahte Redis (önbellek silme kanıtı).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createRequire } from 'node:module';
import path from 'node:path';
import { hash } from 'bcryptjs';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

const redisState = vi.hoisted(() => ({ on: false, store: new Map<string, unknown>() }));
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => null,
  withRedis: async (fn: (r: unknown) => Promise<unknown>, fallback: unknown) => {
    if (!redisState.on) return fallback;
    const r = {
      get: async (k: string) => (redisState.store.has(k) ? redisState.store.get(k) : null),
      set: async (k: string, v: unknown) => {
        redisState.store.set(k, v);
        return 'OK';
      },
      del: async (k: string) => (redisState.store.delete(k) ? 1 : 0),
    };
    return fn(r);
  },
}));

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let authOptions: typeof import('@/lib/auth-options').authOptions;
let SessionRevokedError: typeof import('@/lib/auth-options').SessionRevokedError;
let issueMobileToken: typeof import('@/lib/mobileAuth').issueMobileToken;
let getRequestAuth: typeof import('@/lib/mobileAuth').getRequestAuth;
let google: any;
let callbackHandler: (params: any) => Promise<{ user: any; isNewUser?: boolean }>;

beforeAll(async () => {
  server = await startPgliteServer();
  // Prisma yalnız yerel PGlite'a: modüller bu atamadan SONRA yüklenir.
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  process.env.AUTH_SECRET = 'itest-secret-google-linking';
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  ({ authOptions, SessionRevokedError } = await import('@/lib/auth-options'));
  ({ issueMobileToken, getRequestAuth } = await import('@/lib/mobileAuth'));
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
  redisState.on = false;
  redisState.store.clear();
});

const email = (label: string) => `${label}@example.invalid`;
const googleRaw = (label: string, sub = `sub-${label}`) => ({
  sub,
  name: `Google ${label}`,
  email: email(label),
  email_verified: true,
  picture: 'https://lh3.googleusercontent.com/a/itest',
});

/** callback.js:66-125 sırası. Dönen `token` yeni oturumun JWT'sidir. */
async function googleCallback(raw: ReturnType<typeof googleRaw>) {
  const profile = await google.profile(raw, {});
  const account = { provider: 'google', type: 'oauth', providerAccountId: raw.sub, token_type: 'bearer' };
  const byAccount = await (authOptions.adapter as any).getUserByAccount({ provider: 'google', providerAccountId: raw.sub });
  const allowed = await authOptions.callbacks!.signIn!({ user: byAccount ?? profile, account, profile: raw } as any);
  if (allowed !== true) return { redirect: allowed } as const;
  const { user, isNewUser } = await callbackHandler({
    sessionToken: undefined,
    profile,
    account,
    options: { adapter: authOptions.adapter, jwt: {}, events: authOptions.events, session: { strategy: 'jwt', maxAge: 60 }, provider: google },
  });
  const token = await authOptions.callbacks!.jwt!({
    token: { name: user.name, email: user.email, picture: user.image, sub: String(user.id) },
    user,
    account,
    profile: raw,
    isNewUser,
    trigger: isNewUser ? 'signUp' : 'signIn',
  } as any);
  return { user, token };
}

/** Sonraki istekteki web oturum kontrolü (jwt callback, `user` yok). */
const webCheck = (token: Record<string, unknown>) => authOptions.callbacks!.jwt!({ token: { ...token } } as any);

async function mobileAuth(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` }, cookies: {}, query: {} } as unknown as NextApiRequest;
  return getRequestAuth(req, {} as NextApiResponse);
}

const bonusCount = (userId: string) => prisma.creditTransaction.count({ where: { userId, type: 'SIGNUP_BONUS' } });
const pick = (id: string) =>
  prisma.user.findUniqueOrThrow({ where: { id }, select: { password: true, tokenVersion: true, emailVerified: true, credits: true } });

/** Saldırganın (ya da meşru sahibin) şifreyle açtığı hesap + o şifreyle alınmış web JWT'si ve 30 günlük mobil belirteç. */
async function passwordAccount(label: string, verified: boolean) {
  const u = await prisma.user.create({
    data: { email: email(label), password: await hash('Saldirgan-Pass-1!', 4), name: 'Şifreli', emailVerified: verified ? new Date('2026-01-01T00:00:00Z') : null },
  });
  const webToken = { sub: u.id, tokenVersion: u.tokenVersion, roleSyncedAt: Date.now() };
  const mobileToken = await issueMobileToken({ sub: u.id, role: 'USER', tokenVersion: u.tokenVersion });
  // Bağlamadan önce ikisi de geçerli
  await expect(webCheck(webToken)).resolves.toMatchObject({ sub: u.id });
  expect((await mobileAuth(mobileToken))?.id).toBe(u.id);
  return { user: u, webToken, mobileToken };
}

describe.each([
  ['Redis yok (DB yedeği)', false],
  ['Redis var (önbellek silinir)', true],
])('Google e-postayla bağlama — %s', (label, redisOn) => {
  const tag = redisOn ? 'r' : 'n';

  it('doğrulanmamış şifreli hesap: şifre silinir, tokenVersion +1, eski web/mobil oturum düşer, bonus bir kez; yeni oturum geçerli', async () => {
    redisState.on = redisOn;
    const { user, webToken, mobileToken } = await passwordAccount(`unv-${tag}`, false);
    if (redisOn) expect([...redisState.store.keys()].some((k) => k.endsWith(`session-version:${user.id}`))).toBe(true);

    const got = await googleCallback(googleRaw(`unv-${tag}`));
    if ('redirect' in got) throw new Error(String(got.redirect));
    expect(got.user.id).toBe(user.id);

    const after = await pick(user.id);
    expect(after.password).toBeNull();
    expect(after.tokenVersion).toBe(user.tokenVersion + 1);
    expect(after.emailVerified).toBeInstanceOf(Date);
    expect(after.credits).toBe(2);
    expect(await bonusCount(user.id)).toBe(1);

    // Saldırganın oturumları
    expect(await mobileAuth(mobileToken)).toBeNull();
    await expect(webCheck(webToken)).rejects.toBeInstanceOf(SessionRevokedError);

    // Kurbanın yeni Google oturumu güncel sürümü taşır; sonraki isteklerde düşmez
    expect(got.token.tokenVersion).toBe(after.tokenVersion);
    const second = await webCheck(got.token);
    await expect(webCheck(second)).resolves.toMatchObject({ sub: user.id });

    // Tekrar Google girişi (artık bağlı): sürüm / bonus değişmez, oturum geçerli
    const again = await googleCallback(googleRaw(`unv-${tag}`));
    if ('redirect' in again) throw new Error(String(again.redirect));
    expect((await pick(user.id)).tokenVersion).toBe(after.tokenVersion);
    expect(await bonusCount(user.id)).toBe(1);
    await expect(webCheck(got.token)).resolves.toMatchObject({ sub: user.id });
    await expect(webCheck(again.token)).resolves.toMatchObject({ sub: user.id });
  });

  it('doğrulanmış şifreli hesap: şifre silinir, eski oturumlar düşer, bonus yok; yeni oturum geçerli', async () => {
    redisState.on = redisOn;
    const { user, webToken, mobileToken } = await passwordAccount(`ver-${tag}`, true);
    const got = await googleCallback(googleRaw(`ver-${tag}`));
    if ('redirect' in got) throw new Error(String(got.redirect));
    expect(got.user.id).toBe(user.id);

    const after = await pick(user.id);
    expect(after.password).toBeNull();
    expect(after.tokenVersion).toBe(user.tokenVersion + 1);
    expect(after.emailVerified).toEqual(new Date('2026-01-01T00:00:00Z')); // doğrulama tarihi korunur
    expect(after.credits).toBe(0);
    expect(await bonusCount(user.id)).toBe(0);
    expect(await mobileAuth(mobileToken)).toBeNull();
    await expect(webCheck(webToken)).rejects.toBeInstanceOf(SessionRevokedError);
    await expect(webCheck(await webCheck(got.token))).resolves.toMatchObject({ sub: user.id });
  });

  it('yalnız Google (şifresiz, doğrulanmış) hesap: yeni kayıt ve sonraki girişlerde sürüm değişmez, bonus bir kez', async () => {
    redisState.on = redisOn;
    const first = await googleCallback(googleRaw(`g-${tag}`));
    if ('redirect' in first) throw new Error(String(first.redirect));
    expect(first.user.email).toBe(email(`g-${tag}`));
    const row = await pick(first.user.id);
    expect(row).toMatchObject({ password: null, tokenVersion: 0, credits: 2 });
    expect(await bonusCount(first.user.id)).toBe(1);
    const mobile = await issueMobileToken({ sub: first.user.id, tokenVersion: 0 });

    const again = await googleCallback(googleRaw(`g-${tag}`));
    if ('redirect' in again) throw new Error(String(again.redirect));
    expect(again.user.id).toBe(first.user.id);
    expect(await pick(first.user.id)).toEqual(row);
    expect((await mobileAuth(mobile))?.id).toBe(first.user.id);
    await expect(webCheck(first.token)).resolves.toMatchObject({ sub: first.user.id });
  });

  it('şifresiz + doğrulanmış hesaba (ör. başka OAuth / eski Google kaydı) e-postayla bağlama: değişiklik yok', async () => {
    redisState.on = redisOn;
    const u = await prisma.user.create({ data: { email: email(`nopw-${tag}`), emailVerified: new Date('2026-02-02T00:00:00Z') } });
    const mobile = await issueMobileToken({ sub: u.id, tokenVersion: 0 });
    const got = await googleCallback(googleRaw(`nopw-${tag}`));
    if ('redirect' in got) throw new Error(String(got.redirect));
    expect(got.user.id).toBe(u.id);
    expect(await pick(u.id)).toEqual({ password: null, tokenVersion: 0, emailVerified: new Date('2026-02-02T00:00:00Z'), credits: 0 });
    expect(await bonusCount(u.id)).toBe(0);
    expect((await mobileAuth(mobile))?.id).toBe(u.id);
  });
});

describe('signIn reddi ve sınırlar', () => {
  it("Google'da e-postası doğrulanmamışsa mevcut şifreli hesaba dokunulmaz", async () => {
    const { user, mobileToken } = await passwordAccount('gunv', false);
    const got = await googleCallback({ ...googleRaw('gunv'), email_verified: false as unknown as true });
    expect(got).toEqual({ redirect: '/auth/signin?error=GoogleEmailNotVerified' });
    const after = await pick(user.id);
    expect(after.password).not.toBeNull();
    expect(after.tokenVersion).toBe(0);
    expect((await mobileAuth(mobileToken))?.id).toBe(user.id);
  });

  it('aynı posta kutusunun varyantı (gmail nokta/+) yeni hesap açamaz; mevcut hesaba dokunulmaz', async () => {
    const u = await prisma.user.create({
      data: { email: 'ali.veli@gmail.com', emailNormalized: 'aliveli@gmail.com', password: await hash('X-Pass-123!', 4) },
    });
    const got = await googleCallback({ ...googleRaw('dup'), email: 'aliveli+x@gmail.com' });
    expect(got).toEqual({ redirect: '/auth/signin?error=EmailAlreadyRegistered' });
    expect((await pick(u.id)).tokenVersion).toBe(0);
    expect((await pick(u.id)).password).not.toBeNull();
  });
});

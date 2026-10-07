import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const tx = { user: { findUnique: vi.fn(), updateMany: vi.fn() } };
  return {
    tx,
    prisma: {
      account: { findUnique: vi.fn() },
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
    invalidate: vi.fn(async () => undefined),
    grant: vi.fn(async () => true),
  };
});
vi.mock('@/lib/prisma', () => ({ prisma: db.prisma }));
vi.mock('@/lib/sessionVersion', () => ({ invalidateSessionVersion: db.invalidate, getSessionVersion: vi.fn() }));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: db.grant }));

import {
  checkOAuthSignIn,
  googleProfileToUser,
  isGoogleAuthEnabled,
  oauthProviders,
  prepareOAuthEmailLink,
  secureAccountForOAuthLink,
} from '@/lib/oauth';
import { mustChooseUsername } from '@/lib/gundem/authorGate';
import { safeCallbackPath } from '@/lib/authRedirect';

describe('Google provider env kapısı', () => {
  it('iki env de yoksa/boşsa pasif: provider yok', () => {
    expect(isGoogleAuthEnabled({})).toBe(false);
    expect(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: 'id' })).toBe(false);
    expect(isGoogleAuthEnabled({ GOOGLE_CLIENT_SECRET: 'secret' })).toBe(false);
    expect(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: 'secret' })).toBe(false);
    expect(oauthProviders({})).toEqual([]);
    expect(oauthProviders({ GOOGLE_CLIENT_ID: 'id' })).toEqual([]);
  });

  it('iki env de doluysa Google aktif; aynı e-postalı mevcut hesaba bağlanır (hızlı giriş)', () => {
    const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
    expect(isGoogleAuthEnabled(env)).toBe(true);
    const [google, ...rest] = oauthProviders(env);
    expect(rest).toHaveLength(0);
    expect(google.id).toBe('google');
    const opts = (google as unknown as { options: { allowDangerousEmailAccountLinking?: boolean } }).options;
    expect(opts.allowDangerousEmailAccountLinking).toBe(true);
  });

  it('authOptions env yokken yalnızca Credentials içerir (site bugünkü gibi)', async () => {
    const prevId = process.env.GOOGLE_CLIENT_ID;
    const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    vi.resetModules();
    const { authOptions } = await import('@/lib/auth-options');
    expect(authOptions.providers.map((p) => p.id)).toEqual(['credentials']);
    if (prevId !== undefined) process.env.GOOGLE_CLIENT_ID = prevId;
    if (prevSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = prevSecret;
  });
});

describe('Google signIn kontrolü', () => {
  it('email_verified true değilse giriş sayfasına hata koduyla döner', () => {
    expect(checkOAuthSignIn('google', { email_verified: false })).toBe('/auth/signin?error=GoogleEmailNotVerified');
    expect(checkOAuthSignIn('google', {})).toBe('/auth/signin?error=GoogleEmailNotVerified');
    expect(checkOAuthSignIn('google', undefined)).toBe('/auth/signin?error=GoogleEmailNotVerified');
    expect(checkOAuthSignIn('google', { email_verified: 'true' })).toBe('/auth/signin?error=GoogleEmailNotVerified');
  });

  it('doğrulanmış Google e-postası geçer', () => {
    expect(checkOAuthSignIn('google', { email_verified: true })).toBe(true);
  });
});

describe('Google profil → kullanıcı', () => {
  it('ad ve fotoğraf profilden, e-posta küçük harf, kullanıcı adı boş', () => {
    const u = googleProfileToUser({
      sub: '123',
      name: ' Ali Veli ',
      email: 'Ali.Veli@Gmail.com',
      picture: 'https://lh3.googleusercontent.com/a/x',
      email_verified: true,
    } as never);
    expect(u).toEqual({
      id: '123',
      name: 'Ali Veli',
      email: 'ali.veli@gmail.com',
      image: 'https://lh3.googleusercontent.com/a/x',
      role: 'USER',
      username: null,
    });
  });
});

describe('Gündem kullanıcı adı zorunluluğu', () => {
  it('yalnızca OAuth hesabı olan, şifresiz ve kullanıcı adsız hesapta zorunlu', () => {
    expect(mustChooseUsername({ username: null, password: null, _count: { accounts: 1 } })).toBe(true);
    expect(mustChooseUsername({ username: '  ', password: null, _count: { accounts: 1 } })).toBe(true);
    expect(mustChooseUsername({ username: 'ali_10', password: null, _count: { accounts: 1 } })).toBe(false);
    // Şifreli (e-posta) hesaplar ve OAuth kaydı olmayanlar (bot vb.) etkilenmez
    expect(mustChooseUsername({ username: null, password: 'hash', _count: { accounts: 0 } })).toBe(false);
    expect(mustChooseUsername({ username: null, password: null, _count: { accounts: 0 } })).toBe(false);
    expect(mustChooseUsername({ username: null })).toBe(false);
  });
});

describe('callbackUrl güvenliği', () => {
  it('yalnızca site içi göreli yol', () => {
    expect(safeCallbackPath('/gundem?tab=all')).toBe('/gundem?tab=all');
    expect(safeCallbackPath(['/matches/1'])).toBe('/matches/1');
    expect(safeCallbackPath('https://evil.example')).toBe('/');
    expect(safeCallbackPath('//evil.example')).toBe('/');
    expect(safeCallbackPath('/\\evil.example')).toBe('/');
    expect(safeCallbackPath(undefined)).toBe('/');
  });
});

describe('OAuth callback oturum çerezi koruması', () => {
  it('yalnızca OAuth callback isteğinde devreye girer', async () => {
    const { isOAuthCallback } = await import('@/lib/oauthCallbackGuard');
    expect(isOAuthCallback(['callback', 'google'])).toBe(true);
    expect(isOAuthCallback(['callback', 'credentials'])).toBe(false);
    expect(isOAuthCallback(['signin', 'google'])).toBe(false);
    expect(isOAuthCallback(['session'])).toBe(false);
    expect(isOAuthCallback(undefined)).toBe(false);
  });

  it('oturum çerezlerini (parçalı ve __Secure dahil) düşürür, diğerlerini korur', async () => {
    const { withoutSessionCookies } = await import('@/lib/oauthCallbackGuard');
    expect(
      withoutSessionCookies({
        'next-auth.session-token': 'a',
        'next-auth.session-token.0': 'b',
        '__Secure-next-auth.session-token': 'c',
        'next-auth.state': 's',
        'next-auth.pkce.code_verifier': 'p',
        '__Host-next-auth.csrf-token': 'x',
      }),
    ).toEqual({ 'next-auth.state': 's', 'next-auth.pkce.code_verifier': 'p', '__Host-next-auth.csrf-token': 'x' });
  });
});

describe('Google e-postayla bağlama hazırlığı (hesabı önceden açma)', () => {
  const reset = () => {
    for (const f of [db.prisma.account.findUnique, db.prisma.user.findUnique, db.tx.user.findUnique, db.tx.user.updateMany, db.invalidate, db.grant]) f.mockReset();
    db.tx.user.updateMany.mockResolvedValue({ count: 1 });
  };

  it('Google hesabı zaten bağlıysa (normal giriş) ve e-posta yoksa hiçbir şey yapmaz', async () => {
    reset();
    db.prisma.account.findUnique.mockResolvedValue({ userId: 'u1' });
    await prepareOAuthEmailLink('google', 'sub', 'a@b.c');
    await prepareOAuthEmailLink('google', 'sub', null);
    expect(db.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(db.tx.user.findUnique).not.toHaveBeenCalled();
    expect(db.invalidate).not.toHaveBeenCalled();
  });

  it('doğrulanmamış şifreli hesap: şifre silinir, sürüm +1, e-posta doğrulanır, önbellek silinir, bonus', async () => {
    reset();
    db.prisma.account.findUnique.mockResolvedValue(null);
    db.prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    db.tx.user.findUnique.mockResolvedValue({ password: 'hash', emailVerified: null, tokenVersion: 3 });
    await prepareOAuthEmailLink('google', 'sub', ' Kurban@Gmail.com ');
    expect(db.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'kurban@gmail.com' }, select: { id: true } });
    const arg = db.tx.user.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'u1', tokenVersion: 3 });
    expect(arg.data).toMatchObject({ password: null, tokenVersion: { increment: 1 } });
    expect(arg.data.emailVerified).toBeInstanceOf(Date);
    expect(db.invalidate).toHaveBeenCalledWith('u1');
    expect(db.grant).toHaveBeenCalledWith('u1');
  });

  it('doğrulanmış şifreli hesap: aynı temizlik, doğrulama tarihi korunur, bonus yok', async () => {
    reset();
    const verified = new Date('2026-01-01T00:00:00Z');
    db.tx.user.findUnique.mockResolvedValue({ password: 'hash', emailVerified: verified, tokenVersion: 0 });
    expect(await secureAccountForOAuthLink('u2')).toBe(true);
    expect(db.tx.user.updateMany.mock.calls[0][0].data).toEqual({ password: null, tokenVersion: { increment: 1 }, emailVerified: verified });
    expect(db.invalidate).toHaveBeenCalledWith('u2');
    expect(db.grant).not.toHaveBeenCalled();
  });

  it('şifresiz + doğrulanmış hesap ya da eşzamanlı ikinci dönüş (sürüm değişmiş): no-op', async () => {
    reset();
    db.tx.user.findUnique.mockResolvedValue({ password: null, emailVerified: new Date(), tokenVersion: 1 });
    expect(await secureAccountForOAuthLink('u3')).toBe(false);
    expect(db.tx.user.updateMany).not.toHaveBeenCalled();
    db.tx.user.findUnique.mockResolvedValue({ password: 'hash', emailVerified: null, tokenVersion: 1 });
    db.tx.user.updateMany.mockResolvedValue({ count: 0 });
    expect(await secureAccountForOAuthLink('u3')).toBe(false);
    expect(db.invalidate).not.toHaveBeenCalled();
    expect(db.grant).not.toHaveBeenCalled();
  });
});

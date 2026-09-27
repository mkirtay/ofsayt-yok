import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { checkOAuthSignIn, googleProfileToUser, isGoogleAuthEnabled, oauthProviders } from '@/lib/oauth';
import { mustChooseUsername } from '@/lib/gundem/authorGate';
import { googleCallbackUrl, safeCallbackPath } from '@/lib/authRedirect';

describe('Google provider env kapısı', () => {
  it('iki env de yoksa/boşsa pasif: provider yok', () => {
    expect(isGoogleAuthEnabled({})).toBe(false);
    expect(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: 'id' })).toBe(false);
    expect(isGoogleAuthEnabled({ GOOGLE_CLIENT_SECRET: 'secret' })).toBe(false);
    expect(isGoogleAuthEnabled({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: 'secret' })).toBe(false);
    expect(oauthProviders({})).toEqual([]);
    expect(oauthProviders({ GOOGLE_CLIENT_ID: 'id' })).toEqual([]);
  });

  it('iki env de doluysa Google aktif ve e-posta ile otomatik bağlama KAPALI', () => {
    const env = { GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' };
    expect(isGoogleAuthEnabled(env)).toBe(true);
    const [google, ...rest] = oauthProviders(env);
    expect(rest).toHaveLength(0);
    expect(google.id).toBe('google');
    const opts = (google as unknown as { options: { allowDangerousEmailAccountLinking?: boolean } }).options;
    expect(opts.allowDangerousEmailAccountLinking).toBe(false);
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
    expect(mustChooseUsername({ username: 'ali_1907', password: null, _count: { accounts: 1 } })).toBe(false);
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

  it('Google dönüşü kullanıcı adı adımından geçer', () => {
    expect(googleCallbackUrl('/gundem')).toBe('/auth/choose-username?callbackUrl=%2Fgundem');
    expect(googleCallbackUrl('https://evil.example')).toBe('/auth/choose-username?callbackUrl=%2F');
  });
});

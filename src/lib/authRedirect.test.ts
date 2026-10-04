import { describe, expect, it } from 'vitest';
import { safeCallbackPath, signedInRedirectPath } from './authRedirect';

describe('oturum açıkken giriş / kayıt sayfasından yönlendirme', () => {
  it('geçerli callbackUrl → oraya; yoksa / geçersizse ana sayfa', () => {
    expect(signedInRedirectPath('/matches/123?tab=ai')).toBe('/matches/123?tab=ai');
    expect(signedInRedirectPath(['/credits'])).toBe('/credits');
    expect(signedInRedirectPath(undefined)).toBe('/');
    expect(signedInRedirectPath('https://evil.example')).toBe('/');
    expect(signedInRedirectPath('//evil.example')).toBe('/');
  });

  it('hedef yine giriş / kayıt sayfasıysa (dil önekiyle de) ana sayfa — döngü yok', () => {
    for (const p of ['/auth/signin', '/auth/signup?callbackUrl=%2F', '/en/auth/signin', '/auth/signup#x']) {
      expect(signedInRedirectPath(p)).toBe('/');
    }
    expect(signedInRedirectPath('/auth/verify-email-sent')).toBe('/auth/verify-email-sent');
    expect(signedInRedirectPath('/auth/signinx')).toBe('/auth/signinx');
  });
});

describe('safeCallbackPath — open redirect (güvenlik denetimi 2026-10-04)', () => {
  it.each([
    '//evil.com',
    '/%09/evil.com'.replace('%09', '\t'), // router.query çözülmüş gelir: /<TAB>/evil.com
    '/\n/evil.com',
    '/\r/evil.com',
    '/\\evil.com',
    '/\\/evil.com',
    '/x\\..\\..\\evil.com',
    'https://evil.com',
    'javascript:alert(1)',
    '/\u0000/evil.com',
    '',
    undefined,
    42,
  ])('reddedilir: %j', (raw) => {
    expect(safeCallbackPath(raw)).toBe('/');
    expect(new URL(safeCallbackPath(raw), 'https://ofsaytyok.app').host).toBe('ofsaytyok.app');
  });

  it('URL-kodlu sekme de (çözülmeden gelirse) site içinde kalır', () => {
    const p = safeCallbackPath('/%09/evil.com');
    expect(new URL(p, 'https://ofsaytyok.app').host).toBe('ofsaytyok.app');
  });

  it.each(['/', '/matches/123?tab=ai#yorum', '/teams/34', '/en/credits', '/search?q=a%2Fb'])('kabul: %s', (p) => {
    expect(safeCallbackPath(p)).toBe(p);
  });
});

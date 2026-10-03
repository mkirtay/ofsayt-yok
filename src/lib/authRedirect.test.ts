import { describe, expect, it } from 'vitest';
import { signedInRedirectPath } from './authRedirect';

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

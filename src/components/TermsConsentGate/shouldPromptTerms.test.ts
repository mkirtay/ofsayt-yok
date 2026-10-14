import { describe, expect, it } from 'vitest';
import { shouldPromptTerms } from './index';

const base = { status: 'authenticated' as const, termsAccepted: false, pathname: '/', alreadyPrompted: false };

describe('Kullanım Şartları onay yönlendirmesi', () => {
  it('oturumlu + onay kesin yok + bu oturumda sorulmadı → yönlendir', () => {
    expect(shouldPromptTerms(base)).toBe(true);
    expect(shouldPromptTerms({ ...base, pathname: '/matches/[slug]' })).toBe(true);
    expect(shouldPromptTerms({ ...base, pathname: '/gundem' })).toBe(true);
  });

  it('onay var / bilinmiyor (eski belirteç) / oturum yok / yükleniyor → yönlendirme yok', () => {
    expect(shouldPromptTerms({ ...base, termsAccepted: true })).toBe(false);
    expect(shouldPromptTerms({ ...base, termsAccepted: undefined })).toBe(false);
    expect(shouldPromptTerms({ ...base, status: 'unauthenticated' })).toBe(false);
    expect(shouldPromptTerms({ ...base, status: 'loading' })).toBe(false);
  });

  it('oturum başına bir kez: sorulduysa tekrar yönlendirmez (kullanıcı kilitlenmez)', () => {
    expect(shouldPromptTerms({ ...base, alreadyPrompted: true })).toBe(false);
  });

  it('giriş / onay / yasal metin / iletişim / yönetim / hata sayfalarında yönlendirmez', () => {
    for (const p of ['/auth/onay', '/auth/signin', '/auth/choose-username', '/kullanim-sartlari', '/gizlilik-politikasi',
      '/kvkk-aydinlatma-metni', '/cerez-politikasi', '/iletisim', '/admin', '/admin/users', '/404', '/_error']) {
      expect(shouldPromptTerms({ ...base, pathname: p }), p).toBe(false);
    }
  });
});

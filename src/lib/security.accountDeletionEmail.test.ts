/** Hesap silme e-postaları (TR / EN): "siz istemediyseniz yok sayın" uyarısı konu ve gövdede, bağlantı, dil etiketi. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: vi.fn() }));

import { accountDeletedEmail, accountDeletionRequestEmail, checkTurnstileGate, emailLocale } from './security';
import { BRAND } from '@/config/brand';

const LINK = `https://www.getscor3.com/hesap-silme/onay#token=${'a'.repeat(64)}`;

describe('hesap silme talebi e-postası', () => {
  it('TR: konu ve gövdede "siz yapmadıysanız yok sayın"; 1 saat, tek kullanım, düğme adı; HTML lang=tr', () => {
    const m = accountDeletionRequestEmail(LINK, 'tr');
    expect(m.subject).toBe(`${BRAND.name} - Hesap silme onayı (siz istemediyseniz yok sayın)`);
    for (const part of [m.html, m.text]) {
      expect(part).toContain('Bu isteği siz yapmadıysanız bu e-postayı yok sayın');
      expect(part).toContain('1 saat');
      expect(part).toContain('bir kez kullanılabilir');
      expect(part).toContain('Hesabımı sil');
      expect(part).toContain(LINK);
    }
    expect(m.html).toMatch(/^<!doctype html><html lang="tr">/);
    expect(m.html).toContain(`<a href="${LINK}">${LINK}</a>`);
    expect(m.text).not.toMatch(/<[a-z]/i);
  });

  it('EN: konu ve gövdede "ignore"; HTML lang=en', () => {
    const m = accountDeletionRequestEmail(LINK, 'en');
    expect(m.subject).toContain('ignore if you did not request this');
    for (const part of [m.html, m.text]) {
      expect(part).toContain('If you did not make this request, ignore this email');
      expect(part).toContain('1 hour');
      expect(part).toContain(LINK);
    }
    expect(m.html).toMatch(/^<!doctype html><html lang="en">/);
  });

  it('silindi bilgisi iki dilde; varsayılan Türkçe (mevcut çağrılar değişmez)', () => {
    expect(accountDeletedEmail().subject).toBe(`${BRAND.name} - Hesabınız silindi`);
    expect(accountDeletedEmail('en').subject).toBe(`${BRAND.name} - Your account has been deleted`);
    expect(accountDeletedEmail('en').html).toMatch(/^<!doctype html><html lang="en">/);
    expect(accountDeletedEmail('en').text).toContain(BRAND.contactEmail);
  });

  it('dil: yalnız "en" İngilizce, gerisi Türkçe', () => {
    expect(emailLocale('en')).toBe('en');
    for (const v of ['tr', 'EN', 'de', undefined, null, 1]) expect(emailLocale(v)).toBe('tr');
  });
});

describe('checkTurnstileGate (talep formu)', () => {
  it('üretimde anahtar yoksa 503 ve verilen metin; geliştirmede atlanır', async () => {
    expect(await checkTurnstileGate(undefined, '1.1.1.1', { unavailableError: 'X', env: { NODE_ENV: 'development' } })).toEqual({ ok: true });
    const r = await checkTurnstileGate('t', '1.1.1.1', { unavailableError: 'Talep alınamıyor', env: { NODE_ENV: 'production' } });
    expect(r).toEqual({ ok: false, status: 503, error: 'Talep alınamıyor' });
    expect(await checkTurnstileGate('', '1.1.1.1', { unavailableError: 'X', env: { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 's' } }))
      .toMatchObject({ ok: false, status: 400 });
  });
});

import { describe, expect, it } from 'vitest';
import { DISPOSABLE_EMAIL_DOMAINS_TEXT } from '@/config/disposableEmailDomains.generated';
import { MAX_LABELS, isDisposableEmail } from './disposableEmail';

describe('isDisposableEmail', () => {
  it('listedeki alan adı ve alt alan adı → true; büyük harf / boşluk önemsiz', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail(' A@Sub.Mailinator.COM ')).toBe(true);
    expect(isDisposableEmail('x@0-mail.com')).toBe(true);
  });

  it('derin alt alan adı, sondaki nokta ve ek liste', () => {
    expect(isDisposableEmail('a@x.y.z.w.mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@mailinator.com.')).toBe(true);
    expect(isDisposableEmail('a@temp-mail.io')).toBe(true);
    expect(isDisposableEmail('a@inbox.tempmail.dev')).toBe(true);
    expect(isDisposableEmail('a@ethereal.email')).toBe(true);
    // son ek eşleşmesi etiket sınırında olmalı
    expect(isDisposableEmail('a@ofsaytmailinator.com')).toBe(false);
    expect(isDisposableEmail('a@mailinator.com.tr')).toBe(false);
  });

  it('yaygın sağlayıcılar ve Türk alan adları → false; bozuk adres → false', () => {
    for (const e of [
      'a@gmail.com', 'a@hotmail.com', 'a@outlook.com', 'a@yandex.com.tr', 'a@icloud.com', 'a@ofsaytyok.app',
      'a@duck.com', 'bozuk', 'a@', '@', 'a@.',
    ]) {
      expect(isDisposableEmail(e)).toBe(false);
    }
  });

  it('listedeki en uzun kayıt MAX_LABELS sınırının altında (liste yenilenince kontrol)', () => {
    const longest = Math.max(...DISPOSABLE_EMAIL_DOMAINS_TEXT.split('\n').map((d) => d.split('.').length));
    expect(longest).toBeLessThan(MAX_LABELS);
  });

  it('çok parçalı / çok uzun ana makine: doğrusal ve sınırlı iş', () => {
    const many = `a@${'x.'.repeat(200_000)}mailinator.com`;
    const huge = `a@${'a'.repeat(1_000_000)}.com`;
    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      expect(isDisposableEmail(many)).toBe(true);
      expect(isDisposableEmail(huge)).toBe(false);
    }
    // Eski O(n²) sürüm `many` için tek çağrıda saniyeler sürüyordu; burada 400 çağrı toplamı.
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});

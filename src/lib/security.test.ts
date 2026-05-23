import { describe, it, expect } from 'vitest';
import { sanitizePlainText, isSafeHttpUrl } from './security';

describe('sanitizePlainText', () => {
  it('HTML etiketlerini temizler (içeriği korur)', () => {
    // Fonksiyon tag'leri siler, tag içindeki text içeriğini korur
    expect(sanitizePlainText('<script>alert(1)</script>Metin')).toBe('alert(1)Metin');
    expect(sanitizePlainText('<b>kalın</b>')).toBe('kalın');
    expect(sanitizePlainText('<br />')).toBe('');
  });

  it('kontrol karakterlerini temizler', () => {
    expect(sanitizePlainText('abc\x00def')).toBe('abcdef');
    expect(sanitizePlainText('abc\x1Fdef')).toBe('abcdef');
  });

  it('başındaki ve sonundaki boşlukları temizler', () => {
    expect(sanitizePlainText('  metin  ')).toBe('metin');
  });

  it('normal metni değiştirmez', () => {
    expect(sanitizePlainText('Galatasaray 2-1 Fenerbahçe')).toBe('Galatasaray 2-1 Fenerbahçe');
  });

  it('boş string döner', () => {
    expect(sanitizePlainText('')).toBe('');
  });
});

describe('isSafeHttpUrl', () => {
  it('https URL kabul eder', () => {
    expect(isSafeHttpUrl('https://example.com')).toBe(true);
    expect(isSafeHttpUrl('https://ofsaytyok.com/images/logo.svg')).toBe(true);
  });

  it('http URL kabul eder', () => {
    expect(isSafeHttpUrl('http://example.com')).toBe(true);
  });

  it('javascript: protokolünü reddeder', () => {
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  });

  it('data: URI reddeder', () => {
    expect(isSafeHttpUrl('data:text/html,<h1>test</h1>')).toBe(false);
  });

  it('geçersiz URL reddeder', () => {
    expect(isSafeHttpUrl('not-a-url')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
  });
});

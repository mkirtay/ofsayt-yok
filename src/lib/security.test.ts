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

  it('varsayılan davranış: satır sonlarını da siler (maç yorumları eski davranışta kalır)', () => {
    expect(sanitizePlainText('a\nb')).toBe('ab');
    expect(sanitizePlainText('a\r\nb\tc')).toBe('abc');
  });
});

describe('sanitizePlainText — allowNewlines (Gündem gövdesi)', () => {
  const nl = { allowNewlines: true };

  it('\n korunur; CRLF ve CR \n\'ye çevrilir', () => {
    expect(sanitizePlainText('a\nb', nl)).toBe('a\nb');
    expect(sanitizePlainText('a\r\nb\rc', nl)).toBe('a\nb\nc');
  });

  it('diğer kontrol karakterleri (tab, NUL, ESC…) hâlâ temizlenir', () => {
    expect(sanitizePlainText('a\tb\x00c\x1Bd\x7Fe', nl)).toBe('abcde');
  });

  it('ardışık 3+ satır sonu 2\'ye iner (boşluklu boş satırlar dahil); 2 korunur', () => {
    expect(sanitizePlainText('a\n\n\n\n\nb', nl)).toBe('a\n\nb');
    expect(sanitizePlainText('a\n \n  \n\nb', nl)).toBe('a\n\nb');
    expect(sanitizePlainText('a\n\nb', nl)).toBe('a\n\nb');
  });

  it('HTML etiketlerini yine temizler, baş/son satır sonlarını kırpar', () => {
    expect(sanitizePlainText('\n\n<b>x</b>\ny\n\n', nl)).toBe('x\ny');
  });

  it('yalnızca satır sonlarından oluşan girdi boş döner', () => {
    expect(sanitizePlainText('\n \n\n', nl)).toBe('');
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

import { describe, it, expect } from 'vitest';
import { sanitizePlainText, isSafeHttpUrl, PlainTextTooLongError } from './security';

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

// Eski (kuadratik) regex uygulaması: yeni doğrusal sürüm bununla birebir aynı sonucu vermeli.
function legacySanitize(input: string, options?: { allowNewlines?: boolean }): string {
  const noTags = input.replace(/<[^>]*>/g, '');
  if (!options?.allowNewlines) {
    return noTags.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  }
  return noTags
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

describe('sanitizePlainText — eski regex ile eşdeğerlik ve doğrusal süre', () => {
  const tricky = [
    'a<b<c>d',
    '<<<x>',
    '<a>>b',
    'x < y > z',
    '1 < 2',
    '<',
    '>',
    '<<<<',
    'a<b\nc>d',
    '  a  \n  b  \n  c  ',
    '   \n',
    '\n   ',
    '   a \n   b ',
    'a \t\n\t b',
    'a \r\n b\r c',
    'x\n \n \n \n y',
    '<b> x </b>\n<i> y </i>',
    '   ',
    'tek satır  ',
  ];

  it.each(tricky)('elle seçilmiş girdi: %j', (input) => {
    expect(sanitizePlainText(input)).toBe(legacySanitize(input));
    expect(sanitizePlainText(input, { allowNewlines: true })).toBe(legacySanitize(input, { allowNewlines: true }));
  });

  it('rastgele girdilerde (5000 örnek) eski regex ile aynı', () => {
    const alphabet = ['<', '>', ' ', ' ', '\n', '\r', '\t', 'a', 'b', '/', ' ', '\x00', 'ş'];
    let seed = 42;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let n = 0; n < 5000; n += 1) {
      const len = Math.floor(rnd() * 24);
      let s = '';
      for (let k = 0; k < len; k += 1) s += alphabet[Math.floor(rnd() * alphabet.length)];
      expect(sanitizePlainText(s)).toBe(legacySanitize(s));
      expect(sanitizePlainText(s, { allowNewlines: true })).toBe(legacySanitize(s, { allowNewlines: true }));
    }
  });

  it('100.000 karakterlik `<` ve boşluk girdilerinde < 50 ms (eskisi ~3,5 sn)', () => {
    const inputs = ['<'.repeat(100_000), ' '.repeat(100_000) + 'x', '< '.repeat(50_000), `${' '.repeat(50_000)}\n${' '.repeat(50_000)}`];
    for (const input of inputs) {
      for (const opts of [undefined, { allowNewlines: true }]) {
        const t = performance.now();
        sanitizePlainText(input, opts);
        expect(performance.now() - t).toBeLessThan(50);
      }
    }
  });

  it('maxInputLength aşılınca temizlemeden PlainTextTooLongError fırlatır', () => {
    expect(() => sanitizePlainText('x'.repeat(11), { maxInputLength: 10 })).toThrow(PlainTextTooLongError);
    expect(sanitizePlainText(' <b>x</b> ', { maxInputLength: 10 })).toBe('x');
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

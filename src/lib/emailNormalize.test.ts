import { describe, expect, it } from 'vitest';
import { canonicalEmail, sameMailboxWhere } from './emailNormalize';

describe('canonicalEmail', () => {
  it('gmail: + etiketi ve noktalar atılır, googlemail → gmail', () => {
    for (const e of ['ali.veli@gmail.com', 'AliVeli+1@gmail.com', ' a.l.i.v.e.l.i+x+y@GoogleMail.com ', 'aliveli@gmail.com']) {
      expect(canonicalEmail(e)).toBe('aliveli@gmail.com');
    }
  });

  it.each([
    // [girdi, beklenen]
    [' Ali.Veli+x@Outlook.com ', 'ali.veli@outlook.com'],
    ['ali+1@outlook.com', 'ali@outlook.com'],
    ['ali+a+b@hotmail.com', 'ali@hotmail.com'],
    ['ali+@live.com', 'ali@live.com'],
    ['ali+promo@icloud.com', 'ali@icloud.com'],
    ['ali+x@proton.me', 'ali@proton.me'],
    ['ali+x@yandex.com.tr', 'ali@yandex.com.tr'],
    ['ali+x@ofsaytyok.app', 'ali@ofsaytyok.app'],
    // nokta yalnız gmail'de anlamsız
    ['a.b@outlook.com', 'a.b@outlook.com'],
    ['a.b+c@sub.gmail.com', 'a.b@sub.gmail.com'],
    // Yahoo `-` takma adı atılmaz (yanlış pozitif riski — bkz. dosya başı)
    ['ali-veli@yahoo.com', 'ali-veli@yahoo.com'],
    ['ali-veli+x@yahoo.com', 'ali-veli@yahoo.com'],
    // alan adı: küçük harf, sondaki/baştaki nokta, boşluk
    ['ALI@GMAIL.COM.', 'ali@gmail.com'],
    ['ali@outlook.com..', 'ali@outlook.com'],
    ['ali@ outlook.com ', 'ali@outlook.com'],
    ['a.li+x@googlemail.com.', 'ali@gmail.com'],
  ])('%s → %s', (input, expected) => {
    expect(canonicalEmail(input)).toBe(expected);
  });

  it('IDN / Unicode alan adı: tam genişlik eşdeğeri tek biçime iner, benzer harfli sahte alan gmail sayılmaz', () => {
    expect(canonicalEmail('a.li+x@ｇｍａｉｌ．ｃｏｍ')).toBe('ali@gmail.com');
    expect(canonicalEmail('a.li@gmaıl.com')).toBe('a.li@xn--gmal-nza.com');
    expect(canonicalEmail('ali+x@Bücher.de')).toBe('ali@xn--bcher-kva.de');
    expect(canonicalEmail('ali@xn--bcher-kva.de')).toBe('ali@xn--bcher-kva.de');
    // çevrilemeyen / ayırıcı içeren alan: istisna yok, ham (küçük harfli) değer
    expect(canonicalEmail('a@exa mple.çom')).toBe('a@exa mple.çom');
    expect(canonicalEmail('a@x/ÿ.com')).toBe('a@x/ÿ.com');
  });

  it('bozuk girdi olduğu gibi (küçük harf); boş taban korunur', () => {
    expect(canonicalEmail('Yok')).toBe('yok');
    expect(canonicalEmail('@gmail.com')).toBe('@gmail.com');
    expect(canonicalEmail('+@gmail.com')).toBe('+@gmail.com');
    expect(canonicalEmail('+x@outlook.com')).toBe('+x@outlook.com');
    expect(canonicalEmail('...@gmail.com')).toBe('...@gmail.com');
    expect(canonicalEmail('a@')).toBe('a@');
    expect(canonicalEmail('"a+b"@Example.com')).toBe('"a+b"@example.com');
  });

  it('idempotent', () => {
    for (const e of ['Ali.Veli+x@GoogleMail.com', 'ali+1@outlook.com.', 'x@ｇｍａｉｌ．ｃｏｍ', 'a-b@yahoo.com']) {
      expect(canonicalEmail(canonicalEmail(e))).toBe(canonicalEmail(e));
    }
  });
});

describe('sameMailboxWhere', () => {
  it('kanonik alan, ham e-posta ve + varyantı; gmail için googlemail varyantı', () => {
    expect(sameMailboxWhere('ali@outlook.com')).toEqual([
      { emailNormalized: 'ali@outlook.com' },
      { email: 'ali@outlook.com' },
      { email: { startsWith: 'ali+', endsWith: '@outlook.com' } },
    ]);
    expect(sameMailboxWhere('ali@gmail.com')).toContainEqual({ email: { startsWith: 'ali+', endsWith: '@googlemail.com' } });
  });
});

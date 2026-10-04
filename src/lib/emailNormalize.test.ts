import { describe, expect, it } from 'vitest';
import { canonicalEmail } from './emailNormalize';

describe('canonicalEmail', () => {
  it('gmail: + etiketi ve noktalar atılır, googlemail → gmail', () => {
    for (const e of ['ali.veli@gmail.com', 'AliVeli+1@gmail.com', ' a.l.i.v.e.l.i+x+y@GoogleMail.com ', 'aliveli@gmail.com']) {
      expect(canonicalEmail(e)).toBe('aliveli@gmail.com');
    }
  });

  it('diğer sağlayıcılar yalnız küçük harf / kırpma', () => {
    expect(canonicalEmail(' Ali.Veli+x@Outlook.com ')).toBe('ali.veli+x@outlook.com');
    expect(canonicalEmail('a@sub.gmail.com')).toBe('a@sub.gmail.com');
  });

  it('bozuk girdi olduğu gibi (küçük harf)', () => {
    expect(canonicalEmail('Yok')).toBe('yok');
    expect(canonicalEmail('+@gmail.com')).toBe('+@gmail.com');
  });
});

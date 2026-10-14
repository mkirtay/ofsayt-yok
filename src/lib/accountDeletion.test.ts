import { describe, expect, it } from 'vitest';
import { DELETE_CONFIRM_WORD, isDeletionConfirmed } from './accountDeletion';

describe('hesap silme onayı', () => {
  const email = 'Kisi.Adi@Example.com';

  it('"SİL" (Türkçe büyük/küçük harf ve noktasız SIL dahil) kabul', () => {
    expect(DELETE_CONFIRM_WORD).toBe('SİL');
    for (const v of ['SİL', 'sil', ' Sil ', 'SIL', 'Sİl']) expect(isDeletionConfirmed(v, email), v).toBe(true);
  });

  it('hesabın e-postası (büyük/küçük harf ve boşluk farkı yok) kabul', () => {
    expect(isDeletionConfirmed('kisi.adi@example.com', email)).toBe(true);
    expect(isDeletionConfirmed('  KISI.ADI@EXAMPLE.COM ', email)).toBe(true);
  });

  it('başka e-posta, boş, başka kelime, dize olmayan ve aşırı uzun girdi reddedilir', () => {
    for (const v of ['', '   ', 'evet', 'SİLL', 'si l', 'baska@example.com', 'kisi.adi@example.co']) {
      expect(isDeletionConfirmed(v, email), v).toBe(false);
    }
    for (const v of [null, undefined, true, 1, ['SİL'], { confirm: 'SİL' }]) expect(isDeletionConfirmed(v, email)).toBe(false);
    expect(isDeletionConfirmed(`${'a'.repeat(400)}@x.com`, `${'a'.repeat(400)}@x.com`)).toBe(false);
    // Hesap e-postası boşsa yalnız kelime geçerli
    expect(isDeletionConfirmed('', '')).toBe(false);
    expect(isDeletionConfirmed('SİL', '')).toBe(true);
  });
});

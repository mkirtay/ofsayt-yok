import { describe, expect, it } from 'vitest';
import { checkGuestName } from './nickname';
import { cleanName } from './protocol';

describe('mini saha takma adı', () => {
  it('Türkçe harf, boşluk ve _ . - serbest; boşluklar sadeleşir', () => {
    expect(checkGuestName('Mücahid')).toEqual({ ok: true, value: 'Mücahid' });
    expect(checkGuestName('  Kanat  Ustası ')).toEqual({ ok: true, value: 'Kanat Ustası' });
    expect(cleanName('  Kanat  Ustası ')).toBe('Kanat Ustası');
    expect(checkGuestName('Kanat Ustası')).toEqual({ ok: true, value: 'Kanat Ustası' });
    expect(checkGuestName('ali_10.x-y')).toMatchObject({ ok: true });
  });

  it('uzunluk ve karakter kuralı', () => {
    expect(checkGuestName('ab')).toEqual({ ok: false, reason: 'format' });
    expect(checkGuestName('a'.repeat(17))).toEqual({ ok: false, reason: 'format' });
    expect(checkGuestName('ali<script>')).toEqual({ ok: false, reason: 'format' });
    expect(checkGuestName(5)).toEqual({ ok: false, reason: 'format' });
  });

  it('uygunsuz ve ayrılmış adlar reddedilir (Frikik filtresi)', () => {
    expect(checkGuestName('orospu cocugu')).toEqual({ ok: false, reason: 'blocked' });
    expect(checkGuestName('Admin')).toEqual({ ok: false, reason: 'reserved' });
  });

  it('sunucu biçim kontrolü: geçersizse null', () => {
    expect(cleanName('x'.repeat(40))).toBeNull();
    expect(cleanName('a\u0000b c')).toBeNull();
    expect(cleanName(null)).toBeNull();
  });
});

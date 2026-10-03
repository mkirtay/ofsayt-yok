import { describe, expect, it } from 'vitest';
import { isDisposableEmail } from './disposableEmail';

describe('isDisposableEmail', () => {
  it('listedeki alan adı ve alt alan adı → true; büyük harf / boşluk önemsiz', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail(' A@Sub.Mailinator.COM ')).toBe(true);
    expect(isDisposableEmail('x@0-mail.com')).toBe(true);
  });
  it('yaygın sağlayıcılar ve Türk alan adları → false; bozuk adres → false', () => {
    for (const e of ['a@gmail.com', 'a@hotmail.com', 'a@outlook.com', 'a@yandex.com.tr', 'a@icloud.com', 'a@ofsaytyok.app', 'bozuk']) {
      expect(isDisposableEmail(e)).toBe(false);
    }
  });
});

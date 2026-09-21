import { afterEach, describe, expect, it } from 'vitest';
import { getBotAccountEmail, getOfficialAccountEmails, isOfficialUser } from './official';

describe('isOfficialUser', () => {
  afterEach(() => {
    delete process.env.OFFICIAL_ACCOUNT_EMAILS;
    delete process.env.GUNDEM_BOT_EMAIL;
  });

  it('varsayılan allowlist: bilgi.ofsaytyok@gmail.com (büyük/küçük harf ve boşluk duyarsız)', () => {
    expect(isOfficialUser({ email: 'bilgi.ofsaytyok@gmail.com' })).toBe(true);
    expect(isOfficialUser({ email: '  Bilgi.OfsaytYok@Gmail.com ' })).toBe(true);
  });

  it('eski seed hesabı artık resmi değil; OFFICIAL_BOT gönderisi (legacy) resmi kalır', () => {
    expect(isOfficialUser({ email: 'official@ofsaytyok.invalid' })).toBe(false);
    expect(isOfficialUser({ email: 'biri@example.com' }, 'OFFICIAL_BOT')).toBe(true);
    expect(isOfficialUser(null, 'OFFICIAL_BOT')).toBe(true);
  });

  it('sıradan kullanıcı ve e-postasız kayıt resmi değil', () => {
    expect(isOfficialUser({ email: 'biri@example.com' })).toBe(false);
    expect(isOfficialUser({ email: null })).toBe(false);
    expect(isOfficialUser(undefined, 'USER')).toBe(false);
  });

  it('env listesi allowlist’i genişletir', () => {
    process.env.OFFICIAL_ACCOUNT_EMAILS = 'a@x.com, B@x.com';
    expect(getOfficialAccountEmails()).toEqual(expect.arrayContaining(['a@x.com', 'b@x.com', 'bilgi.ofsaytyok@gmail.com']));
    expect(isOfficialUser({ email: 'b@x.com' })).toBe(true);
  });

  it('bot hesabı: varsayılan tek resmi hesap, GUNDEM_BOT_EMAIL ile değiştirilebilir', () => {
    expect(getBotAccountEmail()).toBe('bilgi.ofsaytyok@gmail.com');
    process.env.GUNDEM_BOT_EMAIL = ' Bot@X.com ';
    expect(getBotAccountEmail()).toBe('bot@x.com');
  });
});

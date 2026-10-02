import { describe, expect, it } from 'vitest';
import { isValidLogoPath, logoProxyMode, logoSrc, logoWidthFor, sportmonksImagePath } from './logoUrl';

const TEAM = 'https://cdn.sportmonks.com/images/soccer/teams/0/4192.png';

describe('logoWidthFor (2x retina, beyaz liste)', () => {
  it('görüntü boyutunun 2 katını karşılayan en küçük genişlik', () => {
    expect(logoWidthFor(14)).toBe(32);
    expect(logoWidthFor(16)).toBe(32);
    expect(logoWidthFor(18)).toBe(48);
    expect(logoWidthFor(22)).toBe(48);
    expect(logoWidthFor(28)).toBe(64);
    expect(logoWidthFor(40)).toBe(96);
    expect(logoWidthFor(56)).toBe(128);
    expect(logoWidthFor(96)).toBe(128);
  });
});

describe('sportmonksImagePath / isValidLogoPath', () => {
  it('yalnız cdn.sportmonks.com/images altındaki güvenli yollar', () => {
    expect(sportmonksImagePath(TEAM)).toBe('soccer/teams/0/4192.png');
    expect(sportmonksImagePath('https://cdn.sportmonks.com/images/countries/png/short/tr.png')).toBe('countries/png/short/tr.png');
    expect(sportmonksImagePath('https://evil.com/images/soccer/teams/0/1.png')).toBeNull();
    expect(sportmonksImagePath('https://cdn.sportmonks.com.evil.com/images/a.png')).toBeNull();
    expect(sportmonksImagePath('/images/ofsaytyok-logo.svg')).toBeNull();
  });

  it('yol geçişi ve garip karakterler reddedilir', () => {
    expect(isValidLogoPath('soccer/../../etc/passwd.png')).toBe(false);
    expect(isValidLogoPath('/soccer/teams/1.png')).toBe(false);
    expect(isValidLogoPath('soccer/teams/1.png?x=1')).toBe(false);
    expect(isValidLogoPath('soccer/teams/1.exe')).toBe(false);
    expect(isValidLogoPath('soccer/teams/a b.png')).toBe(false);
    expect(isValidLogoPath('soccer/teams/12/1234.png')).toBe(true);
  });
});

describe('logoSrc', () => {
  it('self (varsayılan): kendi ucumuz', () => {
    expect(logoSrc(TEAM, 16, 'self')).toBe('/api/img/logo?src=soccer/teams/0/4192.png&w=32');
  });

  it('wsrv: dış proxy, hata olursa orijinale döner (default)', () => {
    const u = new URL(logoSrc(TEAM, 18, 'wsrv')!);
    expect(u.host).toBe('wsrv.nl');
    expect(u.searchParams.get('url')).toBe('cdn.sportmonks.com/images/soccer/teams/0/4192.png');
    expect(u.searchParams.get('w')).toBe('48');
    expect(u.searchParams.get('output')).toBe('webp');
    expect(u.searchParams.get('default')).toBe(TEAM);
  });

  it('off: orijinal; Sportmonks dışı kaynak ve boş değer aynen', () => {
    expect(logoSrc(TEAM, 16, 'off')).toBe(TEAM);
    expect(logoSrc('/images/uefa.svg', 20, 'self')).toBe('/images/uefa.svg');
    expect(logoSrc(null, 16)).toBeNull();
    expect(logoSrc('', 16)).toBeNull();
  });

  it('env değeri: yalnız wsrv/off tanınır, gerisi self', () => {
    expect(logoProxyMode(undefined)).toBe('self');
    expect(logoProxyMode('wsrv')).toBe('wsrv');
    expect(logoProxyMode('off')).toBe('off');
    expect(logoProxyMode('OFF')).toBe('self');
  });
});

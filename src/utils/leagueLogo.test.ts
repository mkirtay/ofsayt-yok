import { describe, expect, it } from 'vitest';
import { parseLeagueImagePath, resolveSidebarLeagueLogo, sportmonksLeagueLogoUrl } from './leagueLogo';
import { SIDEBAR_LEAGUES } from '@/config/leagues';

describe('parseLeagueImagePath', () => {
  it('geçerli https URL ve yerel yolu kabul eder', () => {
    expect(parseLeagueImagePath('https://cdn.sportmonks.com/images/soccer/leagues/24/600.png')).toBe(
      'https://cdn.sportmonks.com/images/soccer/leagues/24/600.png',
    );
    expect(parseLeagueImagePath('/images/uefa-logo.svg')).toBe('/images/uefa-logo.svg');
    expect(parseLeagueImagePath('  https://x.test/a.png ')).toBe('https://x.test/a.png');
  });
  it('boş / null / placeholder / bozuk değerleri reddeder', () => {
    for (const bad of [undefined, null, '', '   ', 'null', 'undefined', 42, 'not a url', '//cdn.x/a.png', 'javascript:alert(1)', 'https://cdn.sportmonks.com/images/soccer/placeholder.png']) {
      expect(parseLeagueImagePath(bad)).toBeNull();
    }
  });
});

describe('sportmonksLeagueLogoUrl', () => {
  it('CDN klasör kuralı id % 32', () => {
    expect(sportmonksLeagueLogoUrl(600)).toBe('https://cdn.sportmonks.com/images/soccer/leagues/24/600.png');
    expect(sportmonksLeagueLogoUrl(8)).toBe('https://cdn.sportmonks.com/images/soccer/leagues/8/8.png');
    expect(sportmonksLeagueLogoUrl(384)).toBe('https://cdn.sportmonks.com/images/soccer/leagues/0/384.png');
  });
  it('geçersiz id null', () => {
    expect(sportmonksLeagueLogoUrl(0)).toBeNull();
    expect(sportmonksLeagueLogoUrl(-3)).toBeNull();
    expect(sportmonksLeagueLogoUrl(1.5)).toBeNull();
  });
});

describe('resolveSidebarLeagueLogo', () => {
  it('API image_path config logosundan önceliklidir', () => {
    expect(resolveSidebarLeagueLogo({ id: 6, logo: 'https://a.test/x.png' }, 'https://api.test/y.png')).toBe('https://api.test/y.png');
  });
  it('API yoksa config logosu', () => {
    expect(resolveSidebarLeagueLogo({ id: 6, logo: 'https://a.test/x.png' })).toBe('https://a.test/x.png');
  });
  it('config logosu da yoksa doğrulanmış Sportmonks id\'sinden türetir', () => {
    expect(resolveSidebarLeagueLogo({ id: 6 })).toBe('https://cdn.sportmonks.com/images/soccer/leagues/24/600.png');
  });
  it('UEFA kupaları yerel svg', () => {
    expect(resolveSidebarLeagueLogo({ id: 244 })).toBe('/images/uefa-logo.svg');
  });
  it('bilinmeyen lig → null (kırık görsel yerine placeholder)', () => {
    expect(resolveSidebarLeagueLogo({ id: 999999 })).toBeNull();
  });
  it('tüm SIDEBAR_LEAGUES için bir logo çözülür', () => {
    for (const l of SIDEBAR_LEAGUES) expect(resolveSidebarLeagueLogo(l)).toBeTruthy();
  });
});

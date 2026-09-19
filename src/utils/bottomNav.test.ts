import { describe, expect, it } from 'vitest';
import { activeBottomNavKey, bottomNavTarget, parseMatchTab, parseSidebarTab } from './bottomNav';

describe('bottomNav', () => {
  it('hedef query eşlemesi', () => {
    expect(bottomNavTarget('live')).toEqual({ tab: 'live' });
    expect(bottomNavTarget('favorites')).toEqual({ tab: 'favorites' });
    expect(bottomNavTarget('standings')).toEqual({ panel: 'standings' });
    expect(bottomNavTarget('leagues')).toEqual({ panel: 'leagues' });
  });
  it('geçersiz değerleri reddeder', () => {
    expect(parseMatchTab('nope')).toBeNull();
    expect(parseSidebarTab('x')).toBeNull();
    expect(parseMatchTab(['live'])).toBe('live');
  });
  it('yan panel sekmeleri: Puan Durumu | Ligler | Gol Krallığı (Haberler kaldırıldı; eski ?panel=news → null → varsayılan)', () => {
    expect(parseSidebarTab('scorers')).toBe('scorers');
    expect(parseSidebarTab('news')).toBeNull();
  });
  it('aktif sekme yalnızca ana sayfada', () => {
    expect(activeBottomNavKey('/teams/[id]', { tab: 'live' })).toBeNull();
    expect(activeBottomNavKey('/', { tab: 'live' })).toBe('live');
    expect(activeBottomNavKey('/', { panel: 'standings' })).toBe('standings');
    expect(activeBottomNavKey('/', { panel: 'leagues', tab: 'live' })).toBe('leagues');
    expect(activeBottomNavKey('/', {})).toBeNull();
  });
});

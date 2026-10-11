import { describe, expect, it } from 'vitest';
import { canSeeGame, gameSitemapRoutes, parseAllowlist, parseGameMode } from './gameFlag';

describe('GAME_ENABLED bayrağı', () => {
  it('varsayılan ve bilinmeyen değerler KAPALI', () => {
    for (const v of [undefined, null, '', ' ', '0', 'false', 'off', 'no', 'evet', 'publik']) expect(parseGameMode(v), String(v)).toBe('off');
  });
  it('açık (1/true/on/preview) = önizleme; herkese açmak için ayrıca "public"', () => {
    for (const v of ['1', 'true', 'TRUE', ' on ', 'preview']) expect(parseGameMode(v), v).toBe('preview');
    expect(parseGameMode('public')).toBe('public');
    expect(parseGameMode(' Public ')).toBe('public');
  });
  it('allowlist: virgül/boşluk ayrımlı, küçük harf, geçersizler atılır', () => {
    expect([...parseAllowlist(' A@x.com, b@Y.com;c@z.com  notanemail ')]).toEqual(['a@x.com', 'b@y.com', 'c@z.com']);
    expect(parseAllowlist(undefined).size).toBe(0);
  });
  it('kim görür', () => {
    const allow = parseAllowlist('tester@x.com');
    expect(canSeeGame('off', { role: 'ADMIN', email: 'tester@x.com' }, allow)).toBe(false);
    expect(canSeeGame('preview', null, allow)).toBe(false);
    expect(canSeeGame('preview', { role: 'USER', email: 'baska@x.com' }, allow)).toBe(false);
    expect(canSeeGame('preview', { role: 'USER', email: 'Tester@X.com' }, allow)).toBe(true);
    expect(canSeeGame('preview', { role: 'ADMIN', email: null }, allow)).toBe(true);
    expect(canSeeGame('public', null, allow)).toBe(true);
  });
  it('site haritası yalnız herkese açıkken', () => {
    expect(gameSitemapRoutes('off')).toEqual([]);
    expect(gameSitemapRoutes('preview')).toEqual([]);
    expect(gameSitemapRoutes('public').map((r) => r.path)).toEqual(['/tahmin', '/tahmin/siralama', '/tahmin/kurallar']);
  });
});

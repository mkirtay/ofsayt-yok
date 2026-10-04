import { describe, expect, it } from 'vitest';
import { refereeComparePath, refereeTablePath, seasonSlugOf, shortSeasonName } from './refereeTableLeagues';

describe('/hakemler adresleri', () => {
  it('kanonik adres: varsayılan lig güncel sezonda yalnız /hakemler; geçmiş sezon ve diğer ligler slug ile', () => {
    expect(refereeTablePath('super-lig', null, true)).toBe('/hakemler');
    expect(refereeTablePath('super-lig', '2025-2026', false)).toBe('/hakemler/super-lig/2025-2026');
    expect(refereeTablePath('1-lig', null, true)).toBe('/hakemler/1-lig');
    expect(refereeTablePath('1-lig', '2025-2026', false)).toBe('/hakemler/1-lig/2025-2026');
  });

  it('sezon slug ve kısa ad (başlık: "2026/27")', () => {
    expect(seasonSlugOf('2026/2027')).toBe('2026-2027');
    expect(shortSeasonName('2026/2027')).toBe('2026/27');
    expect(shortSeasonName('2026')).toBe('2026');
  });

  it('hakem sayfasından karşılaştırma linki: en son sezonun ligi + sezonu, hakem seçili', () => {
    const seasons = [
      { leagueId: 2, seasonName: '2026/2027' },
      { leagueId: 600, seasonName: '2026/2027' },
    ];
    expect(refereeComparePath(seasons, 'batuhan-kolak-62331')).toBe('/hakemler/super-lig/2026-2027?a=batuhan-kolak-62331');
    expect(refereeComparePath([{ leagueId: 603, seasonName: '2025/2026' }], 'x-1')).toBe('/hakemler/1-lig/2025-2026?a=x-1');
    expect(refereeComparePath([], 'x-1')).toBe('/hakemler?a=x-1');
  });
});

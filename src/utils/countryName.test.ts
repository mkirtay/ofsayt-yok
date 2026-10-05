import { describe, expect, it } from 'vitest';
import { countryDisplayName } from './countryName';

describe('ülke adı görünen dilde', () => {
  it('TR: ISO koduna göre Türkçe ("Turkey" → "Türkiye"); EN ve kodsuz: Sportmonks adı', () => {
    expect(countryDisplayName({ name: 'Turkey', iso2: 'TR' }, 'tr')).toBe('Türkiye');
    expect(countryDisplayName({ name: 'Germany', iso2: 'DE' }, 'tr')).toBe('Almanya');
    expect(countryDisplayName({ name: 'Turkey', iso2: 'TR' }, 'en')).toBe('Turkey');
    expect(countryDisplayName({ name: 'Turkey' }, 'tr')).toBe('Turkey');
    expect(countryDisplayName({ name: 'X', iso2: 'zz' }, 'tr')).toBe('X');
  });

  it('TR: kodu yanıltıcı bölgeler ada göre (Sportmonks: Scotland GB, England EN, Europe EU)', () => {
    expect(countryDisplayName({ name: 'Scotland', iso2: 'GB' }, 'tr')).toBe('İskoçya');
    expect(countryDisplayName({ name: 'England', iso2: 'EN' }, 'tr')).toBe('İngiltere');
    expect(countryDisplayName({ name: 'Europe', iso2: 'EU' }, 'tr')).toBe('Avrupa');
    expect(countryDisplayName({ name: 'Scotland', iso2: 'GB' }, 'en')).toBe('Scotland');
  });
});

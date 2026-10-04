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
});

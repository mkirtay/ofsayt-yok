import { describe, expect, it } from 'vitest';
import { personPhoto } from './personPhoto';

describe('personPhoto', () => {
  it('Sportmonks yer tutucusu ve geçersiz değerler → null (baş harf avatarı)', () => {
    for (const bad of [undefined, null, '', 'null', 'x', 'http://cdn.sportmonks.com/images/soccer/referees/1/1.png', 'https://cdn.sportmonks.com/images/soccer/placeholder.png']) {
      expect(personPhoto(bad)).toBeNull();
    }
  });
  it('gerçek görsel: çift eğik çizgi tekleşir', () => {
    expect(personPhoto('https://cdn.sportmonks.com/images//soccer/referees/4/14532.png')).toBe('https://cdn.sportmonks.com/images/soccer/referees/4/14532.png');
  });
});

import { describe, expect, it } from 'vitest';
import { parseScore } from './parseScore';

describe('parseScore', () => {
  it('Sportmonks boşluksuz "1-0" ve eski boşluklu "1 - 0" formatlarını okur', () => {
    expect(parseScore('1-0')).toEqual([1, 0]);
    expect(parseScore('2 - 3')).toEqual([2, 3]);
    expect(parseScore(' 10-12 ')).toEqual([10, 12]);
  });
  it('boş/okunamayan skor null', () => {
    expect(parseScore(undefined)).toBeNull();
    expect(parseScore(null)).toBeNull();
    expect(parseScore('')).toBeNull();
    expect(parseScore('-')).toBeNull();
    expect(parseScore('a-b')).toBeNull();
  });
});

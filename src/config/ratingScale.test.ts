import { describe, expect, it } from 'vitest';
import { formatRating, ratingTone } from './ratingScale';

describe('ratingTone — sınır değerler', () => {
  it.each([
    [5.99, 'bad'],
    [6.0, 'poor'],
    [6.49, 'poor'],
    [6.5, 'fair'],
    [6.99, 'fair'],
    [7.0, 'good'],
    [7.99, 'good'],
    [8.0, 'excellent'],
    [10, 'excellent'],
    [3.2, 'bad'],
  ] as const)('%s → %s', (value, tone) => {
    expect(ratingTone(value)).toBe(tone);
  });

  it.each([null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])('geçersiz (%s) → none', (value) => {
    expect(ratingTone(value as number | null | undefined)).toBe('none');
  });
});

describe('formatRating — tek ondalık, kesilmiş (renk bandıyla tutarlı)', () => {
  it('kesme: yuvarlama görünen bandı değiştirmesin', () => {
    expect(formatRating(5.99)).toBe('5.9');
    expect(formatRating(7.96)).toBe('7.9');
    expect(formatRating(8.24)).toBe('8.2');
    expect(formatRating(6)).toBe('6.0');
    expect(formatRating(6.3)).toBe('6.3'); // 6.3*10 = 62.999… float hatası
  });

  it('görünen metnin bandı ham değerin bandıyla aynı', () => {
    for (let i = 550; i <= 850; i += 1) {
      const r = i / 100; // API iki ondalık verir
      expect(ratingTone(Number(formatRating(r)))).toBe(ratingTone(r));
    }
  });

  it('geçersiz → null', () => {
    expect(formatRating(null)).toBeNull();
    expect(formatRating(0)).toBeNull();
  });
});

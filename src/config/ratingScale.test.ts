import { describe, expect, it } from 'vitest';
import { formatRating, ratingTone } from './ratingScale';

describe('ratingTone — renk YUVARLANMIŞ (görünen) değerden', () => {
  it.each([
    [5.94, 'bad'], // "5.9"
    [5.95, 'poor'], // "6.0"
    [5.99, 'poor'],
    [6.0, 'poor'],
    [6.44, 'poor'], // "6.4"
    [6.45, 'fair'], // "6.5"
    [6.5, 'fair'],
    [6.94, 'fair'],
    [6.95, 'good'], // "7.0"
    [7.0, 'good'],
    [7.94, 'good'],
    [7.95, 'excellent'], // "8.0"
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

describe('formatRating — tek ondalık, yuvarlanmış (SofaScore/FotMob ile aynı)', () => {
  it('yuvarlama', () => {
    expect(formatRating(7.68)).toBe('7.7');
    expect(formatRating(5.94)).toBe('5.9');
    expect(formatRating(5.95)).toBe('6.0');
    expect(formatRating(6.45)).toBe('6.5');
    expect(formatRating(7.95)).toBe('8.0');
    expect(formatRating(8.24)).toBe('8.2');
    expect(formatRating(6)).toBe('6.0');
  });

  it('görünen metnin bandı rengin bandıyla aynı (API iki ondalık verir)', () => {
    for (let i = 300; i <= 1000; i += 1) {
      const r = i / 100;
      expect(ratingTone(Number(formatRating(r)))).toBe(ratingTone(r));
    }
  });

  it('geçersiz → null', () => {
    expect(formatRating(null)).toBeNull();
    expect(formatRating(0)).toBeNull();
  });
});

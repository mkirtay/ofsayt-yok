/** "(1 credits)" dilbilgisi hatası: EN tekil/çoğul ayrı anahtar; TR tek biçim. */
import { describe, expect, it } from 'vitest';
import enMatch from '../../../public/locales/en/match.json';
import trMatch from '../../../public/locales/tr/match.json';
import { resolvePluralKey } from '@/lib/i18nPlural';

const a = (d: typeof enMatch | typeof trMatch) => d.analysis as unknown as Record<string, string>;
const label = (d: typeof enMatch | typeof trMatch, locale: string, count: number) => {
  const key = resolvePluralKey('generateCost', count, locale, (k) => k in a(d));
  return a(d)[key]!.replace('{{count}}', String(count));
};

describe('analysis.generateCost', () => {
  it('EN: 1 credit / 2 credits', () => {
    expect(label(enMatch, 'en', 1)).toBe('(1 credit)');
    expect(label(enMatch, 'en', 2)).toBe('(2 credits)');
  });
  it('TR: 1 kredi', () => {
    expect(label(trMatch, 'tr', 1)).toBe('(1 kredi)');
  });
});

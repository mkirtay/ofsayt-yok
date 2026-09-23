import { describe, expect, it } from 'vitest';
import enMatch from '../../public/locales/en/match.json';
import trMatch from '../../public/locales/tr/match.json';
import { resolvePluralKey } from './i18nPlural';

type Dict = Record<string, unknown>;
const lookup = (dict: Dict) => (key: string) =>
  key.split('.').reduce<unknown>((cur, p) => (cur && typeof cur === 'object' ? (cur as Dict)[p] : undefined), dict) !==
  undefined;
const interp = (s: string, count: number) => s.replace('{{count}}', String(count));
const get = (dict: Dict, key: string) => key.split('.').reduce<unknown>((c, p) => (c as Dict)[p], dict) as string;

function t(dict: Dict, key: string, count: number, locale: string): string {
  return interp(get(dict, resolvePluralKey(key, count, locale, lookup(dict))), count);
}

describe('resolvePluralKey', () => {
  it('en: count=1 → `_one`, diğerleri taban (çoğul) anahtar', () => {
    expect(t(enMatch as Dict, 'list.matchCount', 1, 'en')).toBe('1 match');
    expect(t(enMatch as Dict, 'list.matchCount', 0, 'en')).toBe('0 matches');
    expect(t(enMatch as Dict, 'list.matchCount', 3, 'en')).toBe('3 matches');
  });

  it('tr: `_one` anahtarı yok → her sayıda aynı biçim', () => {
    expect(t(trMatch as Dict, 'list.matchCount', 1, 'tr')).toBe('1 maç');
    expect(t(trMatch as Dict, 'list.matchCount', 3, 'tr')).toBe('3 maç');
  });

  it('count sayı değilse ya da yoksa taban anahtar', () => {
    const has = () => true;
    expect(resolvePluralKey('list.matchCount', undefined, 'en', has)).toBe('list.matchCount');
    expect(resolvePluralKey('list.matchCount', '1', 'en', has)).toBe('list.matchCount');
    expect(resolvePluralKey('list.matchCount', Number.NaN, 'en', has)).toBe('list.matchCount');
  });
});

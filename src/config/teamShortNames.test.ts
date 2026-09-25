import { describe, expect, it } from 'vitest';
import { TEAM_SHORT_NAMES } from './teamShortNames';
import superLig from './__fixtures__/superLig202627Teams.json';

/** Süper Lig 2026/27 puan durumundaki (Sportmonks season 28203) takım adı → beklenen kısaltma. */
const EXPECTED: Record<string, string> = {
  Galatasaray: 'GS',
  Fenerbahçe: 'FB',
  Beşiktaş: 'BJK',
  Trabzonspor: 'TS',
  'Amed SK': 'AMD',
  Kocaelispor: 'KOC',
  Alanyaspor: 'ALN',
  Kasımpaşa: 'KSP',
  Rizespor: 'ÇRS',
  'Gaziantep F.K.': 'GFK',
  'Çorum FK': 'ÇRM',
  'İstanbul Başakşehir': 'İBFK',
  Gençlerbirliği: 'GB',
  'Erzurumspor FK': 'ERZ',
  Konyaspor: 'KON',
  Samsunspor: 'SAM',
  Göztepe: 'GÖZ',
  Eyüpspor: 'EYP',
};

describe('TEAM_SHORT_NAMES', () => {
  it('id\'ler Süper Lig 2026/27 puan durumundaki isimlerle eşleşir', () => {
    const byName = Object.fromEntries(superLig.map((t) => [t.name, TEAM_SHORT_NAMES[t.id]]));
    expect(byName).toEqual(EXPECTED);
  });

  it('tabloda sadece bu 18 takım var', () => {
    expect(Object.keys(TEAM_SHORT_NAMES).map(Number).sort((a, b) => a - b)).toEqual(
      superLig.map((t) => t.id).sort((a, b) => a - b),
    );
  });

  it('kısaltmalar 2–4 harf, büyük harf (Türkçe kurallarıyla)', () => {
    for (const code of Object.values(TEAM_SHORT_NAMES)) {
      expect(code).toMatch(/^\p{Lu}{2,4}$/u);
      expect(code.toLocaleUpperCase('tr-TR')).toBe(code);
    }
  });
});

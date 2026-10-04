import { describe, expect, it } from 'vitest';
import { FEW_MATCHES_THRESHOLD, isFewMatches, sortRefereeRows } from './refereeTableSort';

const row = (name: string, matches: number, yellow: number | null, varPm: number | null = 0.5) => ({
  name,
  matches,
  yellowPerMatch: yellow,
  redPerMatch: 0,
  penaltiesPerMatch: 0,
  foulsPerMatch: 25,
  varPerMatch: varPm,
});

describe('/hakemler sıralaması', () => {
  const rows = [row('Ali', 3, 8.33), row('Batuhan', 4, 3.5, null), row('Cem', 2, 9), row('Davut', 4, 5), row('Emre', 1, 2)];

  it('varsayılan maç sayısı (çoktan aza), eşitlikte ad', () => {
    expect(sortRefereeRows(rows, 'matches', 'desc').map((r) => r.name)).toEqual(['Batuhan', 'Davut', 'Ali', 'Cem', 'Emre']);
    expect(sortRefereeRows(rows, 'matches', 'asc').map((r) => r.name)).toEqual(['Emre', 'Cem', 'Ali', 'Batuhan', 'Davut']);
  });

  it(`oran sütunlarında ${FEW_MATCHES_THRESHOLD} maçtan az hakem yönden bağımsız en altta; değeri olmayan onların da altında`, () => {
    expect(sortRefereeRows(rows, 'yellow', 'desc').map((r) => r.name)).toEqual(['Ali', 'Davut', 'Batuhan', 'Cem', 'Emre']);
    expect(sortRefereeRows(rows, 'yellow', 'asc').map((r) => r.name)).toEqual(['Batuhan', 'Davut', 'Ali', 'Emre', 'Cem']);
    expect(sortRefereeRows(rows, 'var', 'desc').map((r) => r.name)).toEqual(['Ali', 'Davut', 'Cem', 'Emre', 'Batuhan']);
  });

  it('"az maç" eşiği 3', () => {
    expect(isFewMatches({ matches: 2 })).toBe(true);
    expect(isFewMatches({ matches: 3 })).toBe(false);
  });
});

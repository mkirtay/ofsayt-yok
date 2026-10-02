import { describe, expect, it } from 'vitest';
import { hubSelectionIdForLeague, sportmonksLeagueIdOfHubSelection } from './hubLeagueSelection';

describe('hub lig seçimi id uzayı', () => {
  it('legacy eşlemesi olan lig legacy id ile (Süper Lig 600 → 6, Ş. Ligi 2 → 244), diğerleri negatif', () => {
    expect(hubSelectionIdForLeague(600)).toBe(6);
    expect(hubSelectionIdForLeague(2)).toBe(244);
    expect(hubSelectionIdForLeague(8)).toBe(2); // Premier League (legacy 2) — Sportmonks 2 (Ş. Ligi) ile karışmaz
    expect(hubSelectionIdForLeague(636)).toBe(-636);
  });

  it('geri çeviri: her plan ligi kendine döner', () => {
    for (const id of [600, 2, 8, 5, 301, 636, 648, 779, 1328]) {
      expect(sportmonksLeagueIdOfHubSelection(hubSelectionIdForLeague(id))).toBe(id);
    }
  });
});

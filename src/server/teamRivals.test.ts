import { describe, expect, it } from 'vitest';
import { isDerbyPair } from './teamRivals';

describe('derbi tespiti (Sportmonks rivals)', () => {
  it('biri diğerini listeliyorsa derbi; ikisi de listelemiyorsa değil', () => {
    // Gerçek (2026-10-04): Galatasaray (34) → Beşiktaş (554), Fenerbahçe (88); Kasımpaşa (1071) → boş
    expect(isDerbyPair(34, 88, [554, 88], [])).toBe(true);
    expect(isDerbyPair(88, 34, [], [554, 88])).toBe(true);
    expect(isDerbyPair(34, 1071, [554, 88], [])).toBe(false);
  });
});

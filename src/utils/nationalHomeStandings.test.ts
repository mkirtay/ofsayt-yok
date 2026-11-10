import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { FOCUS_NATIONAL_TEAM_ID, pickNationalFocus } from './nationalHomeStandings';

const m = (id: number, home: number, away: number, compAf: number): Match =>
  ({ id, home: { id: home, name: 'H' }, away: { id: away, name: 'A' }, competition: { id: 2_000_000_000 + compAf, name: 'X' } }) as unknown as Match;

describe('pickNationalFocus', () => {
  it('Türkiye\'nin Uluslar Ligi maçı → turnuva', () => {
    const r = pickNationalFocus([m(2_000_000_001, FOCUS_NATIONAL_TEAM_ID, 2_000_000_768, 5)]);
    expect(r?.competitionId).toBe(2_000_000_005);
  });
  it('hazırlık maçı → geçiş yok', () => {
    expect(pickNationalFocus([m(2_000_000_001, FOCUS_NATIONAL_TEAM_ID, 2_000_000_768, 10)])).toBeNull();
  });
  it('Türkiye oynamıyor → geçiş yok', () => {
    expect(pickNationalFocus([m(2_000_000_001, 2_000_000_001, 2_000_000_002, 5)])).toBeNull();
  });
  it('Sportmonks maçları (id < 2e9) yok sayılır', () => {
    expect(pickNationalFocus([m(555, FOCUS_NATIONAL_TEAM_ID, 1, 5)])).toBeNull();
  });
  it('maç yok → null', () => {
    expect(pickNationalFocus([])).toBeNull();
  });
});

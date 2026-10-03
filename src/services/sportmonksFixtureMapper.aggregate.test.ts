import { describe, expect, it } from 'vitest';
import { mapAggregate, mapSportmonksFixtureToMatch } from './sportmonksFixtureMapper';
import { deriveMatchScore } from './sportmonks/scoreDerivation';
import type { SportmonksFixture, SportmonksScoreRow } from './sportmonks/types';

const row = (description: string, participant: 'home' | 'away', goals: number) =>
  ({ id: 1, fixture_id: 1, type_id: 1, participant_id: 1, description, score: { goals, participant } }) as unknown as SportmonksScoreRow;

describe('iki ayaklı eşleşme — mapper', () => {
  it('2. ayakta Sportmonks sonucu (1. maçın ev sahibine göre) BU maçın ev sahibine çevrilir', () => {
    // Juventus–Galatasaray eşleşmesi, 2. ayak Galatasaray evinde, AET toplam 7-5 (Juventus önce).
    expect(mapAggregate({ leg: '2/2', aggregate: { result: '7-5', winner_participant_id: 625 } })).toEqual({ home: 5, away: 7, winner_id: 625 });
    expect(mapAggregate({ leg: '1/2', aggregate: { result: '7-5' } })).toEqual({ home: 7, away: 5 });
    expect(mapAggregate({ leg: '2/2', aggregate: null })).toBeUndefined();
    expect(mapAggregate({ leg: '2/2', aggregate: { result: null } })).toBeUndefined();
  });

  it('leg ve aggregate Match\'e geçer; tek maç ("1/1") alan taşımaz', () => {
    const base = { id: 1, participants: [], state_id: 5 } as unknown as SportmonksFixture;
    expect(mapSportmonksFixtureToMatch({ ...base, leg: '2/2', aggregate: { result: '1-3' } })).toMatchObject({ leg: '2/2', aggregate: { home: 3, away: 1 } });
    const single = mapSportmonksFixtureToMatch({ ...base, leg: '1/1' });
    expect(single.leg).toBeUndefined();
    expect(single.aggregate).toBeUndefined();
  });

  it('penaltılar ayrı (PENALTIES → ps_score); CURRENT uzatma dahil, penaltı hariç', () => {
    const score = deriveMatchScore([
      row('1ST_HALF', 'home', 1), row('1ST_HALF', 'away', 0),
      row('2ND_HALF', 'home', 1), row('2ND_HALF', 'away', 1),
      row('CURRENT', 'home', 2), row('CURRENT', 'away', 2),
      row('PENALTIES', 'home', 4), row('PENALTIES', 'away', 3),
    ]);
    expect(score).toMatchObject({ score: '2-2', ps_score: '4-3' });
    expect(deriveMatchScore([row('CURRENT', 'home', 1), row('CURRENT', 'away', 0)])?.ps_score).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { REFEREE_OVERRIDES, withRefereeOverride } from './refereeOverrides';
import { mapSportmonksFixtureToMatch } from '../sportmonksFixtureMapper';
import type { SportmonksFixture } from './types';

const GS_VILLA = 19873236;

describe('elle hakem ataması', () => {
  it('sağlayıcı boşsa tablodaki hakem maça yazılır (ad + id)', () => {
    const m = mapSportmonksFixtureToMatch({ id: GS_VILLA, referees: [] } as unknown as SportmonksFixture);
    expect(m.referee).toBe('Daniel Siebert');
    expect(m.referee_id).toBe(80234);
  });

  it('sağlayıcıda orta hakem varsa sağlayıcı kazanır', () => {
    const f = { id: GS_VILLA, referees: [{ referee_id: 1, type_id: 6, referee: { id: 1, display_name: 'X' } }] };
    expect(withRefereeOverride(f)).toBe(f);
  });

  it('tabloda olmayan maç değişmez', () => {
    const f = { id: 1, referees: [] };
    expect(withRefereeOverride(f)).toBe(f);
    expect(REFEREE_OVERRIDES[1]).toBeUndefined();
  });
});

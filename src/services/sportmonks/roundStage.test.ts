import { describe, it, expect } from 'vitest';
import { resolveRoundAndStage, pickRoundStageLabel } from './roundStage';
import roundLaLiga from './__fixtures__/roundLaLiga.json';
import stageKnockout from './__fixtures__/stageKnockout.json';

describe('resolveRoundAndStage', () => {
  it('lig maçında (Pass 2, La Liga round 6) round dolu, stage yok', () => {
    const result = resolveRoundAndStage({ round: roundLaLiga, stage: null });
    expect(result).toEqual({ round: '6', stage: null });
    expect(pickRoundStageLabel(result)).toBe('6');
  });

  it('knockout maçlarında (Pass 3 Soru 3, Şampiyonlar Ligi) round hep null, stage dolu', () => {
    // Raporun 5 gerçek maçının hepsi: round:null, stage.name dolu.
    for (const stage of stageKnockout as Array<{ name: string }>) {
      const result = resolveRoundAndStage({ round: null, stage });
      expect(result.round).toBeNull();
      expect(result.stage).toBe(stage.name);
      expect(pickRoundStageLabel(result)).toBe(stage.name);
    }
  });

  it('raporun 5 knockout aşaması isim sırasını birebir doğrular', () => {
    const names = (stageKnockout as Array<{ name: string }>).map((s) => s.name);
    expect(names).toEqual([
      'Knockout Round Play-offs',
      '8th Finals',
      'Quarter-finals',
      'Semi-finals',
      'Final',
    ]);
  });

  it('ikisi de yoksa null/null döner', () => {
    const result = resolveRoundAndStage({});
    expect(result).toEqual({ round: null, stage: null });
    expect(pickRoundStageLabel(result)).toBeNull();
  });
});

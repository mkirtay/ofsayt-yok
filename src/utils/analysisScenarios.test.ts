import { describe, expect, it } from 'vitest';
import { isAnalysisScenario, scenariosFromStored, toPublicAnalysis } from './analysisScenarios';

const scenario = { metric: '2+ gol', probability: 58.4, confidence: 'medium', reasoning: 'İki takım da son 5 maçta gol buldu.' };
const oldTip = { market: 'Üst/Alt 2.5', pick: '2.5 Üst', confidence: 'medium', reasoning: 'r', valueBet: true, avoid: false };

describe('analysisScenarios', () => {
  it('senaryo biçimi doğrulanır', () => {
    expect(isAnalysisScenario(scenario)).toBe(true);
    expect(isAnalysisScenario(oldTip)).toBe(false);
    expect(isAnalysisScenario({ ...scenario, probability: 120 })).toBe(false);
    expect(isAnalysisScenario({ ...scenario, confidence: 'x' })).toBe(false);
    expect(isAnalysisScenario({ ...scenario, metric: ' ' })).toBe(false);
  });

  it('eski bahis maddeleri gizlenir; yeni maddeler yuvarlanmış olasılıkla', () => {
    expect(scenariosFromStored([oldTip, oldTip])).toEqual([]);
    expect(scenariosFromStored([oldTip, scenario])).toEqual([{ ...scenario, probability: 58 }]);
    expect(scenariosFromStored(null)).toEqual([]);
    expect(scenariosFromStored({})).toEqual([]);
  });

  it('API yanıtı: bettingTips her zaman boş, scenarios ayrı', () => {
    const out = toPublicAnalysis({ id: 'a1', bettingTips: [oldTip, scenario] });
    expect(out).toEqual({ id: 'a1', bettingTips: [], scenarios: [{ ...scenario, probability: 58 }] });
    expect(JSON.stringify(out)).not.toContain('valueBet');
  });
});

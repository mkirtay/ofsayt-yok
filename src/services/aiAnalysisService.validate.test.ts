import { describe, expect, it, vi } from 'vitest';

const logged = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('@/lib/logger', () => ({ captureError: (ctx: string, e: Error) => void logged.calls.push(`${ctx}: ${e.message}`) }));

import { validateSchema } from './aiAnalysisService';

const base = () => ({
  matchSummary: {},
  matchPrediction: { home: 50, draw: 25, away: 25, reasoning: '' },
  teamAnalyses: { home: { narrative: 'n' }, away: { narrative: 'n' } },
  tacticalAnalysis: { home: {}, away: {} },
  heatmapAnalysis: {},
  scorePrediction: {},
  goalExpectation: {},
  scenarios: [
    { metric: '2+ gol', probability: 61, confidence: 'medium', reasoning: 'Son 5 maçta ortalama 3,2 gol.' },
    { market: '1X2', pick: 'MS 1', confidence: 'high', reasoning: 'r', valueBet: true, avoid: false },
  ],
  riskLevel: 'low',
  riskFactors: [],
  analystComment: 'Ev sahibi formda.',
  overallConfidence: 60,
});

describe('AI çıktısı doğrulama — olasılık senaryoları', () => {
  it('`scenarios` zorunlu; eski `bettingTips` biçimi kabul edilmez', () => {
    const { scenarios, ...rest } = base();
    void scenarios;
    expect(() => validateSchema({ ...rest, bettingTips: [] })).toThrow('eksik alan: scenarios');
  });

  it('geçersiz senaryo maddesi atılır (analiz yanmaz)', () => {
    logged.calls.length = 0;
    const out = validateSchema(base());
    expect(out.scenarios).toEqual([{ metric: '2+ gol', probability: 61, confidence: 'medium', reasoning: 'Son 5 maçta ortalama 3,2 gol.' }]);
  });

  it('bahis dili geçerse kayda düşer, analiz engellenmez', () => {
    logged.calls.length = 0;
    validateSchema({ ...base(), analystComment: 'Banko kupon: value bet var.' });
    expect(logged.calls).toHaveLength(1);
    expect(logged.calls[0]).toMatch(/^analysis-gambling-terms: AI çıktısında bahis dili: .*kupon.*banko|banko.*kupon/);
    logged.calls.length = 0;
    validateSchema(base());
    expect(logged.calls).toEqual([]);
  });
});

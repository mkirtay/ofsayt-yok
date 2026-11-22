import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { prepareProbabilities } from './saveMatchAnalysis';
import { toPublicAnalysis } from '@/utils/analysisScenarios';

const analysis = {
  matchPrediction: { home: 55, draw: 25, away: 20, reasoning: 'r' },
  goalExpectation: { over15: 65, over25: 45, over35: 20, btts: 50, htOver05: 60, htOver15: 25, homeToScore: 70, awayToScore: 55, bttsFirstHalf: 15, reasoning: 'g' },
  scenarios: [{ metric: '2+ gol', probability: 65, confidence: 'medium', reasoning: 'x' }],
} as never;

afterEach(() => {
  delete process.env.AI_CALIBRATION_ENABLED;
});

describe('kayıt öncesi kalibrasyon (büyüme raporu 1.4/1.5)', () => {
  it('olasılıklar kalibre; ham hali + tablo sürümü + öne çıkan 3 tahmin kayda', () => {
    const { analysis: a, extra } = prepareProbabilities(analysis);
    const mp = a.matchPrediction as unknown as Record<string, number>;
    expect(mp.home + mp.draw + mp.away).toBe(100);
    expect((a.goalExpectation as unknown as Record<string, number>).over15).not.toBe(65);
    // senaryo "2+ gol" ile gol beklentisi over15 aynı eğriden → aynı yüzde
    expect(a.scenarios![0]!.probability).toBe((a.goalExpectation as unknown as Record<string, number>).over15);
    expect(extra.rawProbabilities).toMatchObject({ goalExpectation: { over15: 65 } });
    expect(String(extra.calibrationVersion)).toMatch(/^iso-/);
    expect(extra.topPickKeys).toHaveLength(3);
  });

  it('AI_CALIBRATION_ENABLED=false → aynen, ek alan yok', () => {
    process.env.AI_CALIBRATION_ENABLED = 'false';
    const { analysis: a, extra } = prepareProbabilities(analysis);
    expect(a).toBe(analysis);
    expect(extra).toEqual({});
  });

  it('herkese açık yanıt ham olasılıkları ve tablo sürümünü taşımaz; seçim kalır', () => {
    const pub = toPublicAnalysis({
      bettingTips: [],
      modelVersion: 'v7-x',
      fullReport: { analystComment: 'a', rawProbabilities: { x: 1 }, calibrationVersion: 'iso-1', topPickKeys: ['home'] },
    });
    expect(pub.fullReport).toEqual({ analystComment: 'a', topPickKeys: ['home'] });
  });
});

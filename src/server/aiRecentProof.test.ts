import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ value: [] as unknown[], fail: false }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    predictionRecord: {
      findMany: async () => {
        if (rows.fail) throw new Error('db');
        return rows.value;
      },
    },
  },
}));

import { loadRecentProof, MIN_PICKS, resetRecentProofCache } from './aiRecentProof';

const rec = (score: string, mv = 'v7-x') => ({
  evaluatedAt: new Date(),
  matchId: '1',
  modelVersion: mv,
  actualResult: 'HOME',
  actualScore: score,
  extendedHits: null,
  createdAt: new Date(),
  matchAnalysis: {
    homeTeamName: 'A',
    awayTeamName: 'B',
    competitionId: '600',
    matchPrediction: { home: 60, draw: 20, away: 20 },
    goalExpectation: { over15: 80, homeToScore: 85 },
    fullReport: null,
  },
});

beforeEach(() => {
  resetRecentProofCache();
  rows.fail = false;
});

describe('kilidin yanındaki kanıt', () => {
  it('son 7 gün: öne çıkan tahminlerin isabeti; eski model sayılmaz', async () => {
    rows.value = [...Array.from({ length: 4 }, () => rec('2-0')), rec('0-1'), rec('2-0', 'v4-x')];
    // 5 sayılan maç × 3 rozet = 15; 2-0'da üçü de tuttu (12), 0-1'de hiçbiri (0)
    expect(await loadRecentProof()).toEqual({ hits: 12, picks: 15, matches: 5, days: 7 });
  });

  it(`örnek azsa (< ${MIN_PICKS} tahmin) ya da DB hatasında yok`, async () => {
    rows.value = [rec('2-0')];
    expect(await loadRecentProof()).toBeNull();
    resetRecentProofCache();
    rows.fail = true;
    expect(await loadRecentProof()).toBeNull();
  });
});

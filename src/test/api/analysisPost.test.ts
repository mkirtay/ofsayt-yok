import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * POST /api/matches/[id]/analysis — "zaten var" yalnızca AYNI maçın analizi için döner. Aynı iki takımın
 * başka (eski) maçına ait analiz yeni maça verilmez: yeni analiz üretilir (26 Ekim derbisi senaryosu).
 */
const h = vi.hoisted(() => ({
  analyses: new Map<string, { id: string; matchId: string; homeTeamId: string; awayTeamId: string; bettingTips?: unknown }>(),
  spent: 0,
  generated: 0,
  created: [] as Array<Record<string, unknown>>,
  lockHeld: false,
  released: 0,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchAnalysis: {
      findUnique: vi.fn(async ({ where }: { where: { matchId_matchStatus: { matchId: string } } }) =>
        h.analyses.get(where.matchId_matchStatus.matchId) ?? null,
      ),
      findFirst: vi.fn(async () => {
        throw new Error('takım çifti yedeğine düşülmemeli');
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.created.push(data);
        return { id: `new-${h.created.length}`, ...data };
      }),
    },
    predictionRecord: { findUnique: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => ({ role: 'USER', credits: 50 })) },
  },
}));
vi.mock('@/lib/requireAuth', () => ({ requireAuth: async () => ({ ok: true, userId: 'u1' }) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: async () => ({ success: true, remaining: 9, resetAt: 0 }) }));
vi.mock('@/lib/premium', () => ({ analysisIsFree: () => false }));
vi.mock('@/lib/credits', () => ({
  reserveCredits: vi.fn(async () => {
    h.spent += 1;
    return { id: 'r1', amount: 5, balanceAfter: 45 };
  }),
  settleCredits: vi.fn(async () => true),
  refundCredits: vi.fn(),
  refundStalePendingSpends: vi.fn(async () => 0),
  analysisIdempotencyKey: (id: string) => `analysis:${id}:PRE`,
  isUniqueViolation: () => false,
  recordFreeAnalysis: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  DuplicateSpendError: class extends Error {},
}));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), stale: false, failed: false }),
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/analysisGenerationLock', () => ({
  acquireAnalysisLock: vi.fn(async (matchId: string) => (h.lockHeld ? null : { key: `lock:${matchId}`, token: 't' })),
  releaseAnalysisLock: vi.fn(async (lock: unknown) => {
    if (lock) h.released += 1;
  }),
}));
vi.mock('@/lib/predictionRecords', () => ({ ensurePredictionRecordForAnalysis: vi.fn() }));
vi.mock('@/services/aiAnalysisService', () => ({
  AnalysisTimeoutError: class extends Error {},
  generateMatchAnalysis: vi.fn(async () => {
    h.generated += 1;
    const t = { narrative: 'n' };
    return {
      analysis: {
        teamAnalyses: { home: t, away: t },
        matchPrediction: {},
        scorePrediction: {},
        goalExpectation: {},
        scenarios: [{ metric: '2+ gol', probability: 58, confidence: 'medium', reasoning: 'r' }],
        matchSummary: '',
        tacticalAnalysis: '',
        heatmapAnalysis: '',
        riskFactors: [],
        analystComment: '',
        riskLevel: 'LOW',
        riskReasoning: '',
        overallConfidence: 50,
      },
      modelVersion: 'test',
      tokensUsed: 1,
    };
  }),
}));
vi.mock('@/server/buildMatchAnalysisContext', () => ({
  buildMatchAnalysisContext: vi.fn(async (matchId: string) => ({
    archived: false,
    matchPhase: 'PRE',
    match: { id: Number(matchId), competition: { id: 600, name: 'Süper Lig' } },
    homeTeam: { teamId: 34, teamName: 'Galatasaray' },
    awayTeam: { teamId: 88, teamName: 'Fenerbahçe' },
  })),
}));

import handler from '@/pages/api/matches/[id]/analysis';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

function post(id: string) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(b: unknown) {
      this.body = b;
      return this;
    },
    setHeader() {},
  };
  const req = { method: 'POST', query: { id }, headers: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res as typeof res & { body: Record<string, unknown> });
}

describe('POST /api/matches/[id]/analysis — takım çifti yedeği yok', () => {
  beforeEach(() => {
    h.analyses.clear();
    h.created.length = 0;
    h.spent = 0;
    h.generated = 0;
    h.lockHeld = false;
    h.released = 0;
    vi.mocked(buildMatchAnalysisContext).mockClear();
  });

  it('aynı eşleşmenin ESKİ maçına ait analiz yeni maça dönmez: yeni analiz üretilir, kredi harcanır', async () => {
    // Geçen sezonun GS–FB derbisi analizi (başka matchId).
    h.analyses.set('19172058', { id: 'old', matchId: '19172058', homeTeamId: '34', awayTeamId: '88' });

    const res = await post('19889999');

    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(false);
    expect((res.body.analysis as { id: string }).id).not.toBe('old');
    expect(h.generated).toBe(1);
    expect(h.spent).toBe(1);
    expect(h.created[0]!.matchId).toBe('19889999');
  });

  it('aynı maçın analizi varsa kredi harcamadan döner (cached)', async () => {
    h.analyses.set('19889999', { id: 'same', matchId: '19889999', homeTeamId: '34', awayTeamId: '88' });

    const res = await post('19889999');

    expect(res.statusCode).toBe(200);
    expect(res.body.cached).toBe(true);
    expect((res.body.analysis as { id: string }).id).toBe('same');
    expect(h.generated).toBe(0);
    expect(h.spent).toBe(0);
    // Önbellekten açılışta maç bağlamı (Sportmonks) hiç kurulmaz.
    expect(buildMatchAnalysisContext).not.toHaveBeenCalled();
  });

  it('yeni analiz: olasılık senaryoları eski sütuna yazılır, yanıtta `scenarios`; `bettingTips` boş', async () => {
    const res = await post('19889999');
    const scenario = { metric: '2+ gol', probability: 58, confidence: 'medium', reasoning: 'r' };
    expect(h.created[0]!.bettingTips).toEqual([scenario]);
    expect(res.body.analysis).toMatchObject({ scenarios: [scenario], bettingTips: [] });
  });

  it('eski kayıt (bahis maddeleri) bozulmadan döner: bahis bölümü gizli (scenarios boş, maddeler yanıtta yok)', async () => {
    h.analyses.set('19889999', {
      id: 'old-format',
      matchId: '19889999',
      homeTeamId: '34',
      awayTeamId: '88',
      bettingTips: [{ market: 'Üst/Alt 2.5', pick: '2.5 Üst', confidence: 'high', reasoning: 'r', valueBet: true, avoid: false }],
    });
    const res = await post('19889999');
    expect(res.body.analysis).toMatchObject({ id: 'old-format', scenarios: [], bettingTips: [] });
    expect(JSON.stringify(res.body)).not.toMatch(/valueBet|2\.5 Üst/);
  });

  it('üretim kilidi başkasındaysa (kullanıcı ya da cron) kredi rezerve edilmeden 409 ANALYSIS_IN_PROGRESS', async () => {
    h.lockHeld = true;
    const res = await post('19889999');
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('ANALYSIS_IN_PROGRESS');
    expect(h.spent).toBe(0);
    expect(h.generated).toBe(0);
  });

  it('üretimden sonra kilit bırakılır', async () => {
    await post('19889999');
    expect(h.generated).toBe(1);
    expect(h.released).toBe(1);
  });
});

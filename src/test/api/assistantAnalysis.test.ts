import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** Uç düzeyinde kredi duvarı: açılmamış analizde yanıt gövdesinde kilitli alan YOK; uç hiçbir koşulda üretim yapmaz. */
const h = vi.hoisted(() => ({ unlock: null as { id: string } | null, generated: 0 }));
const row = {
  id: 'a1', matchId: '19746594', modelVersion: 'v5-2026-10-openai:gpt-6-luna', homeTeamName: 'Galatasaray', awayTeamName: 'Kasımpaşa',
  matchPrediction: { home: 55, draw: 25, away: 20, reasoning: 'KILITLI_GEREKCE.' },
  scorePrediction: { mostLikely: '3-1' },
  bettingTips: [{ metric: '2+ gol', probability: 78, confidence: 'medium', reasoning: 'KILITLI_SENARYO' }],
  teamAnalyses: { home: { narrative: 'KILITLI_TAKIM' }, away: { narrative: 'KILITLI_TAKIM' } },
  fullReport: { matchSummary: { tempo: 'Tempo yüksek.', dominantSide: 'Galatasaray baskın.' }, analystComment: 'KILITLI_ANALIST.', tacticalAnalysis: { keyBattleZones: 'KILITLI_TAKTIK' } },
};
vi.mock('@/lib/prisma', () => ({ prisma: { predictionRecord: { findUnique: vi.fn(async () => null) } } }));
vi.mock('@/lib/matchAnalysisLookup', () => ({ findStoredMatchAnalysis: vi.fn(async () => row) }));
vi.mock('@/lib/analysisUnlock', () => ({ ANALYSIS_UNLOCK_COST: 1, findUnlock: vi.fn(async () => h.unlock) }));
vi.mock('@/server/analysisAccess', () => ({
  isAnalysisMatchFinished: vi.fn(async () => false),
  loadViewer: vi.fn(async (id?: string) => (id ? { id, role: 'USER', credits: 0, premiumUntil: null, emailVerified: null, createdAt: new Date() } : null)),
}));
vi.mock('@/lib/mobileAuth', () => ({ getRequestAuth: vi.fn(async (req: { headers: { cookie?: string } }) => (req.headers.cookie ? { id: 'u1' } : null)) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: async () => ({ success: true, remaining: 1, resetAt: 0 }), requestIp: () => '1.1.1.1' }));
vi.mock('@/services/teamPage', () => ({
  getTeamOverview: vi.fn(async () => ({ recent: [], fixtures: [{ id: 19746594, home: { id: 34, name: 'Galatasaray' }, away: { id: 1071, name: 'Kasımpaşa' }, status: 'NOT STARTED', kickoff_ts: 1 }] })),
}));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn(async () => ({ data: [] })) }));
vi.mock('@/services/aiAnalysisService', () => ({ generateMatchAnalysis: vi.fn(async () => { h.generated++; }) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import handler from '@/pages/api/assistant/analysis';

function post(body: unknown, cookie?: string) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k] = v; },
  };
  const req = { method: 'POST', body, headers: cookie ? { cookie } : {}, socket: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

const LOCKED = /KILITLI_|3-1|scenarios|bettingTips|teamAnalyses|fullReport|analystComment/;

describe('POST /api/assistant/analysis — kredi duvarı', () => {
  beforeEach(() => {
    h.unlock = null;
    h.generated = 0;
  });

  it('açılmamış analiz (girişli / girişsiz): yanıt gövdesinde kilitli alan yok, yalnız önizleme', async () => {
    for (const cookie of ['s=1', undefined]) {
      const r = await post({ text: 'GS–Kasımpaşa maçını analiz et' }, cookie);
      expect(r.statusCode).toBe(200);
      expect(JSON.stringify(r.body)).not.toMatch(LOCKED);
      expect(r.body).toMatchObject({ card: { kind: 'locked', preview: { top: { outcome: 'HOME', pct: 55 } } } });
      expect(r.headers['Cache-Control']).toBe('private, no-store');
    }
    expect(h.generated).toBe(0);
  });

  it('açılmışsa özet; maç kimliğiyle yenileme de aynı kuralı izler', async () => {
    h.unlock = { id: 'u' };
    const r = await post({ match: { id: 19746594, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: 1 } }, 's=1');
    expect(r.body).toMatchObject({ card: { kind: 'summary', points: ['KILITLI_ANALIST.', 'KILITLI_GEREKCE.', 'Galatasaray baskın.'] } });
    h.unlock = null;
    const locked = await post({ match: { id: 19746594, home: 'Galatasaray', away: 'Kasımpaşa', kickoffMs: 1 } }, 's=1');
    expect(JSON.stringify(locked.body)).not.toMatch(LOCKED);
  });

  it('geçersiz istek 400, GET 405', async () => {
    expect((await post({ text: '' })).statusCode).toBe(400);
    expect((await post({ match: { id: 'x' } })).statusCode).toBe(400);
    const res = { statusCode: 0, status(c: number) { this.statusCode = c; return this; }, json() { return this; }, setHeader() {} };
    await handler({ method: 'GET', headers: {}, socket: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.statusCode).toBe(405);
  });
});

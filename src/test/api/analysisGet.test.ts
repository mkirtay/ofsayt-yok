import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const db = vi.hoisted(() => ({
  analysis: new Map<string, { id: string; matchId: string }>(),
  buildCalls: 0,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchAnalysis: {
      findUnique: vi.fn(async ({ where }: { where: { matchId_matchStatus: { matchId: string } } }) =>
        db.analysis.get(where.matchId_matchStatus.matchId) ?? null,
      ),
      findFirst: vi.fn(async () => {
        throw new Error('GET takım çifti yedeğine düşmemeli');
      }),
    },
    predictionRecord: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock('@/server/buildMatchAnalysisContext', () => ({
  buildMatchAnalysisContext: vi.fn(async () => {
    db.buildCalls += 1;
    throw new Error('GET maç bağlamı kurmamalı');
  }),
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import handler from '@/pages/api/matches/[id]/analysis';

function call(id: string) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
    setHeader() {},
  };
  const req = { method: 'GET', query: { id }, headers: {} } as unknown as NextApiRequest;
  return Promise.resolve(handler(req, res as unknown as NextApiResponse)).then(() => res);
}

describe('GET /api/matches/[id]/analysis', () => {
  beforeEach(() => {
    db.analysis.clear();
    db.buildCalls = 0;
  });

  it('kayıtlı analiz yoksa 404 döner, maç sağlayıcısına gitmez', async () => {
    const res = await call('19000001');
    expect(res.statusCode).toBe(404);
    expect(db.buildCalls).toBe(0);
  });

  it('kayıtlı analizi yalnızca DB\'den döner', async () => {
    db.analysis.set('19000002', { id: 'a1', matchId: '19000002' });
    const res = await call('19000002');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ analysis: { id: 'a1', matchId: '19000002' }, predictionRecord: null });
    expect(db.buildCalls).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; matchId: string; matchStatus: string; modelVersion: string; createdAt: Date }>,
  created: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
  generated: 0,
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchTrivia: {
      findFirst: vi.fn(async () => h.rows[0] ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.created.push(data);
        return { id: 'new', ...data };
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.updated.push(data);
        return { id: 'upd', ...data };
      }),
    },
  },
}));
vi.mock('@/lib/requireAuth', () => ({ requireAuth: async () => ({ ok: true, userId: 'u1' }) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: async () => ({ success: true, remaining: 9, resetAt: 0 }) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/server/buildMatchAnalysisContext', () => ({
  buildMatchAnalysisContext: vi.fn(async () => ({ archived: false, matchPhase: 'POST', match: { id: 1 } })),
}));
vi.mock('@/services/aiTriviaService', () => ({
  TriviaTimeoutError: class extends Error {},
  generateMatchTrivia: vi.fn(async () => {
    h.generated++;
    return { trivia: { ertemFacts: ['f'], contextual: '', rivalryContext: '' }, modelVersion: 'v2-trivia-data-2026-10-openai:gpt-6-luna', tokensUsed: 1 };
  }),
}));

import handler from '@/pages/api/matches/[id]/trivia';
import { buildMatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

function get(id: string) {
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
  return Promise.resolve(handler({ method: 'GET', query: { id }, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse)).then(
    () => res as typeof res & { body: Record<string, unknown> },
  );
}

describe('GET /api/matches/[id]/trivia — maç başına tek üretim', () => {
  beforeEach(() => {
    h.rows = [];
    h.created = [];
    h.updated = [];
    h.generated = 0;
    vi.mocked(buildMatchAnalysisContext).mockClear();
  });

  it('güncel sürüm trivia varsa (faz değişse de) bağlam kurulmaz, üretim yok', async () => {
    h.rows = [{ id: 't1', matchId: '1', matchStatus: 'PRE', modelVersion: 'v2-trivia-data-2026-10-openai:gpt-6-luna', createdAt: new Date() }];
    const r = await get('1');
    expect(r.body.cached).toBe(true);
    expect(h.generated).toBe(0);
    expect(buildMatchAnalysisContext).not.toHaveBeenCalled();
  });

  it('eski (v1) kayıt bir kez v2 ile yerinde güncellenir; süresi dolmaz', async () => {
    h.rows = [{ id: 'old', matchId: '1', matchStatus: 'PRE', modelVersion: 'v1-trivia-claude-sonnet-4-5-2026-04-openai:gpt-4.1', createdAt: new Date() }];
    await get('1');
    expect(h.generated).toBe(1);
    expect(h.updated[0]).toMatchObject({ expiresAt: null, modelVersion: 'v2-trivia-data-2026-10-openai:gpt-6-luna' });
    expect(h.created).toHaveLength(0);
  });

  it('kayıt yoksa yeni satır, expiresAt boş', async () => {
    await get('1');
    expect(h.created[0]).toMatchObject({ matchId: '1', matchStatus: 'POST', expiresAt: null });
  });

  it('aylık LLM bütçesi dolu: 503 LLM_BUDGET, nazik mesaj; kayıt yazılmaz', async () => {
    const { LlmBudgetExceededError } = await import('@/server/llmBudget');
    const { generateMatchTrivia } = await import('@/services/aiTriviaService');
    vi.mocked(generateMatchTrivia).mockRejectedValueOnce(new LlmBudgetExceededError());
    const res = await get('1');
    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({ code: 'LLM_BUDGET', error: expect.stringContaining('bu ay') });
    expect(h.created).toHaveLength(0);
  });
});

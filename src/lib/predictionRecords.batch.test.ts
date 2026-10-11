import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'http';

const h = vi.hoisted(() => ({
  pending: [] as { id: string; matchId: string; createdAt: Date }[],
  redis: new Map<string, unknown>(),
  lookups: [] as string[],
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchAnalysis: { findMany: async () => [] },
    predictionRecord: { findMany: async () => h.pending, update: async () => ({}) },
  },
}));
vi.mock('@/lib/redis', () => ({
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>) =>
    fn({
      get: async (k: string) => h.redis.get(k) ?? null,
      set: async (k: string, v: unknown) => void h.redis.set(k, v),
    }),
}));
// Başlamamış maç: kayıt beklemede kalır (skipped), her turda yeniden sorulurdu.
vi.mock('@/lib/resolveLiveMatch', () => ({
  resolveSportmonksMatch: async (id: string) => {
    h.lookups.push(id);
    return { kind: 'found', match: { id, status: 'NOT STARTED', date: '2099-01-01' } };
  },
}));

import { EVALUATION_MAX_MATCHES_PER_RUN, evaluatePendingPredictionRecords, selectEvaluationBatch } from './predictionRecords';

const req = {} as IncomingMessage;
const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);

describe('selectEvaluationBatch — tur başına en çok N farklı maç, sırayla dolaşır', () => {
  it('sınırın altındaysa hepsi, imleç yok', () => {
    expect(selectEvaluationBatch(ids(3), 'm2', 5)).toEqual({ selected: ['m1', 'm2', 'm3'], nextCursor: null });
  });

  it('imleçten sonrası; sona gelince başa sarar; imleç listede yoksa baştan', () => {
    const list = ids(7);
    expect(selectEvaluationBatch(list, null, 3)).toEqual({ selected: ['m1', 'm2', 'm3'], nextCursor: 'm3' });
    expect(selectEvaluationBatch(list, 'm3', 3)).toEqual({ selected: ['m4', 'm5', 'm6'], nextCursor: 'm6' });
    expect(selectEvaluationBatch(list, 'm6', 3)).toEqual({ selected: ['m7', 'm1', 'm2'], nextCursor: 'm2' });
    expect(selectEvaluationBatch(list, 'gitti', 3).selected).toEqual(['m1', 'm2', 'm3']);
  });
});

describe('evaluatePendingPredictionRecords — tur sınırı', () => {
  beforeEach(() => {
    h.redis.clear();
    h.lookups = [];
    // 30 farklı maç; ilk maçın iki kaydı var (aynı maç tek istek)
    h.pending = ids(30).map((m, i) => ({ id: `r${i}`, matchId: m, createdAt: new Date(2026, 9, 1, 0, i) }));
    h.pending.push({ id: 'r-dup', matchId: 'm1', createdAt: new Date(2026, 9, 2) });
  });

  it('tek turda en çok 25 maç sorgulanır, kalanlar "deferred"; sonraki tur kaldığı yerden devam eder', async () => {
    const a = await evaluatePendingPredictionRecords(req);
    expect(h.lookups).toHaveLength(EVALUATION_MAX_MATCHES_PER_RUN);
    expect(h.lookups.slice(0, 2)).toEqual(['m1', 'm2']);
    expect(a.deferred).toBe(5);
    expect(a.skipped).toBe(26); // 25 maç + m1'in ikinci kaydı

    h.lookups = [];
    await evaluatePendingPredictionRecords(req);
    // İmleç m25'te: m26–m30 + başa sarıp m1–m20 (kayıt sırasıyla işlenir)
    expect(new Set(h.lookups)).toEqual(new Set([...ids(30).slice(25), ...ids(20)]));
    expect(h.lookups).toHaveLength(EVALUATION_MAX_MATCHES_PER_RUN);
  });

  it('sınırın altında davranış aynı: hepsine bakılır, deferred 0', async () => {
    h.pending = h.pending.slice(0, 4);
    const r = await evaluatePendingPredictionRecords(req);
    expect(h.lookups).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(r.deferred).toBe(0);
  });
});

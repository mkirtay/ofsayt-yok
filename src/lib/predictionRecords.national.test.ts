import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'http';

type Row = { id: string; matchId: string; createdAt: Date; actualResult: string | null; predictedHomePct: number; predictedDrawPct: number; predictedAwayPct: number; predictedScore: string; predictedOver25: number; predictedBtts: number; extendedPredictions: unknown };

const h = vi.hoisted(() => ({
  rows: [] as Row[],
  updates: [] as { id: string; data: Record<string, unknown> }[],
  sm: [] as string[],
  af: [] as string[],
  afResult: new Map<string, unknown>(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchAnalysis: { findMany: async () => [] },
    predictionRecord: {
      findMany: async () => h.rows,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => void h.updates.push({ id: where.id, data }),
    },
  },
}));
vi.mock('@/lib/redis', () => ({ withRedis: async () => null }));
vi.mock('@/lib/resolveLiveMatch', () => ({
  resolveSportmonksMatch: async (id: string) => {
    h.sm.push(id);
    return { kind: 'missing' };
  },
}));
vi.mock('@/server/apiFootball/nationalMatch', () => ({
  lookupNationalMatch: async (id: string) => {
    h.af.push(id);
    return h.afResult.get(id) ?? { kind: 'missing' };
  },
}));

import { evaluatePendingPredictionRecords, isRetryableUnresolved, isUnresolvedActualResult } from './predictionRecords';

const NATIONAL = '2001528905';
const row = (over: Partial<Row>): Row => ({
  id: 'r1',
  matchId: NATIONAL,
  createdAt: new Date('2026-11-10T10:00:00Z'),
  actualResult: null,
  predictedHomePct: 20,
  predictedDrawPct: 25,
  predictedAwayPct: 55,
  predictedScore: '1-2',
  predictedOver25: 70,
  predictedBtts: 60,
  extendedPredictions: { awayToScore: 79, homeToScore: 40 },
  ...over,
});
const finished = {
  kind: 'found',
  bundle: { match: { id: Number(NATIONAL), status: 'FINISHED', date: '2026-11-12', scores: { ft_score: '1 - 3', ht_score: '0 - 1' } } },
};

describe('milli maç değerlendirmesi (API-Football)', () => {
  beforeEach(() => {
    h.rows = [];
    h.updates = [];
    h.sm = [];
    h.af = [];
    h.afResult.clear();
  });

  it('milli maç skoru AF\'den alınır, Sportmonks\'a sorulmaz; isabetler yazılır', async () => {
    h.rows = [row({})];
    h.afResult.set(NATIONAL, finished);
    const res = await evaluatePendingPredictionRecords({} as IncomingMessage);
    expect(res.evaluated).toBe(1);
    expect(h.af).toEqual([NATIONAL]);
    expect(h.sm).toEqual([]);
    const data = h.updates[0]!.data;
    expect(data.actualScore).toBe('1-3');
    expect(data.actualResult).toBe('AWAY');
    expect(data.result1x2Hit).toBe(true);
    expect(data.scoreExactHit).toBe(false);
    expect((data.extendedHits as Record<string, unknown>).awayToScoreHit).toBe(true);
    expect(data.evaluatedAt).toBeInstanceOf(Date);
  });

  it('eski hatayla UNRESOLVED kapatılmış milli kayıt yeniden denenir; kulüp kaydı denenmez', async () => {
    h.rows = [row({ actualResult: 'UNRESOLVED' }), row({ id: 'club', matchId: '19431234', actualResult: 'UNRESOLVED' })];
    h.afResult.set(NATIONAL, finished);
    const res = await evaluatePendingPredictionRecords({} as IncomingMessage);
    expect(res.evaluated).toBe(1);
    expect(h.updates.map((u) => u.id)).toEqual(['r1']);
    expect(h.sm).toEqual([]);
  });

  it('AF\'de de bulunamayan eski milli kayıt UNRESOLVED_AF ile kalıcı kapanır', async () => {
    h.rows = [row({ createdAt: new Date('2026-01-01T00:00:00Z') })];
    const res = await evaluatePendingPredictionRecords({} as IncomingMessage);
    expect(res.unresolved).toBe(1);
    expect(h.updates[0]!.data.actualResult).toBe('UNRESOLVED_AF');
    expect(isRetryableUnresolved({ matchId: NATIONAL, actualResult: 'UNRESOLVED_AF' })).toBe(false);
  });

  it('işaret yardımcıları', () => {
    expect(isUnresolvedActualResult('UNRESOLVED')).toBe(true);
    expect(isUnresolvedActualResult('UNRESOLVED_AF')).toBe(true);
    expect(isUnresolvedActualResult('HOME')).toBe(false);
    expect(isUnresolvedActualResult(null)).toBe(false);
    expect(isRetryableUnresolved({ matchId: NATIONAL, actualResult: 'UNRESOLVED' })).toBe(true);
    expect(isRetryableUnresolved({ matchId: '19431234', actualResult: 'UNRESOLVED' })).toBe(false);
  });
});

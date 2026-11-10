import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ analyses: [] as unknown[], records: [] as unknown[] }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchAnalysis: { findMany: vi.fn(async () => db.analyses) },
    predictionRecord: { findMany: vi.fn(async () => db.records) },
  },
}));
const day = vi.hoisted(() => ({ matches: [] as unknown[] }));
vi.mock('@/server/homeDay', () => ({ loadHomeDay: vi.fn(async () => ({ date: 'x', fixtureMatches: day.matches, liveMatches: [] })) }));
vi.mock('@/server/cronJobs', () => ({ readCronHeartbeats: vi.fn() }));
vi.mock('@/lib/predictionRecords', () => ({ UNRESOLVED_ACTUAL_RESULT: 'UNRESOLVED' }));

import { loadComboCandidates, loadComboHistory } from './candidates';

const m = (id: number, scheduled: string, home = 'A', away = 'B') => ({
  id, status: 'NS', date: '2026-11-12', scheduled, time: scheduled, home: { id: 1, name: home }, away: { id: 2, name: away }, competition: { id: 1, name: 'Lig' },
});
const analysis = (matchId: string, over: Record<string, unknown> = {}, v = 'v6-2026-10-openai:x') => ({
  matchId, modelVersion: v,
  matchPrediction: { home: 50, draw: 25, away: 25 },
  goalExpectation: { over15: 84, over25: 60, btts: 55 },
  ...over,
});

describe('loadComboCandidates', () => {
  beforeEach(() => {
    day.matches = [m(1, '18:00'), m(2, '19:00'), m(3, '20:00'), m(2_000_000_005, '20:00')];
    db.analyses = [analysis('1'), analysis('2', {}, 'v4-old'), analysis('2000000005')];
  });
  const now = Date.parse('2026-11-12T10:00:00Z');

  it('her maçtan tek en güçlü pazar; eski prompt (v<5), analizsiz ve milli maç elenir', async () => {
    const rows = await loadComboCandidates('2026-11-12', { now });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ matchId: '1', key: 'over15', pct: 84, homeName: 'A', awayName: 'B' });
    expect(rows[0].kickoffIso).toBe('2026-11-12T18:00:00.000Z');
  });

  it('başlamış maç varsayılan dışarıda, includePast ile gelir', async () => {
    const late = Date.parse('2026-11-12T18:30:00Z');
    expect(await loadComboCandidates('2026-11-12', { now: late })).toHaveLength(0);
    expect(await loadComboCandidates('2026-11-12', { now: late, includePast: true })).toHaveLength(1);
  });
});

describe('loadComboHistory', () => {
  it('değerlendirilmiş maçların en güçlü tek pazarını bantlara dağıtır; v<5 sayılmaz', async () => {
    const rec = (v: string, score: string) => ({
      modelVersion: v, actualScore: score, extendedHits: null,
      matchAnalysis: { matchPrediction: { home: 50, draw: 25, away: 25 }, goalExpectation: { over15: 84 } },
    });
    db.records = [rec('v6-x', '2-1'), rec('v6-x', '0-1'), rec('v3-x', '3-3')];
    const h = await loadComboHistory();
    expect(h.evaluatedMatches).toBe(2);
    const b = h.bands.find((x) => x.min === 80)!;
    expect(b).toMatchObject({ matches: 2, hits: 1, rate: 50 });
  });
});

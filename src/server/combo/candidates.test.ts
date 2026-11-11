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
vi.mock('@/services/liveScoreService', () => ({ getCompetitionTableFull: vi.fn(async () => null) }));
vi.mock('@/server/cronJobs', () => ({ readCronHeartbeats: vi.fn() }));
vi.mock('@/lib/predictionRecords', () => ({ UNRESOLVED_ACTUAL_RESULT: 'UNRESOLVED' }));

import { loadComboCandidates, loadComboHistory } from './candidates';

const m = (id: number, scheduled: string, home = 'A', away = 'B') => ({
  id, status: 'NS', date: '2026-11-12', scheduled, time: scheduled, home: { id: 1, name: home }, away: { id: 2, name: away }, competition: { id: 600, name: 'Lig' },
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

  const noTests = async () => [];
  it('her maçtan tek en güçlü pazar; eski prompt (v<5), analizsiz ve analizi olmayan milli maç elenir', async () => {
    const rows = await loadComboCandidates('2026-11-12', { now, testAnalyses: noTests });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ matchId: '1', key: 'over15', pct: 84, homeName: 'A', awayName: 'B', source: 'db', national: false });
    expect(rows[0].kickoffIso).toBe('2026-11-12T18:00:00.000Z');
  });

  it('havuz dışı lig elenir (poolOnly=false ile gelir)', async () => {
    day.matches = [{ ...(day.matches[0] as object), competition: { id: 999, name: 'Başka' } }];
    expect(await loadComboCandidates('2026-11-12', { now, testAnalyses: noTests })).toHaveLength(0);
    expect(await loadComboCandidates('2026-11-12', { now, testAnalyses: noTests, poolOnly: false })).toHaveLength(1);
  });

  it('milli maç yalnız test analiziyle aday olur (source=test); kayıtlı analiz önce gelir', async () => {
    day.matches = [
      ...day.matches,
      { id: 2001528958, status: 'NS', date: '2026-11-12', scheduled: '17:00', time: '17:00', home: { id: 1, name: 'Türkiye' }, away: { id: 2, name: 'Belçika' }, competition: { id: 2000000005, name: 'UEFA Uluslar Ligi' } },
    ];
    const tests = async () => [
      { matchId: '2001528958', homeTeamName: 'Türkiye', awayTeamName: 'Belçika', matchPrediction: { home: 30, draw: 30, away: 40 }, goalExpectation: { over15: 78 } },
      { matchId: '1', homeTeamName: 'A', awayTeamName: 'B', matchPrediction: { home: 99 }, goalExpectation: { over15: 99 } },
    ];
    const rows = await loadComboCandidates('2026-11-12', { now, testAnalyses: tests });
    const nat = rows.find((r) => r.matchId === '2001528958')!;
    expect(nat).toMatchObject({ source: 'test', national: true, key: 'over15', pct: 78 });
    expect(rows.find((r) => r.matchId === '1')).toMatchObject({ source: 'db', pct: 84 });
  });

  it('başlamış maç varsayılan dışarıda, includePast ile gelir', async () => {
    const late = Date.parse('2026-11-12T18:30:00Z');
    expect(await loadComboCandidates('2026-11-12', { now: late, testAnalyses: noTests })).toHaveLength(0);
    expect(await loadComboCandidates('2026-11-12', { now: late, includePast: true, testAnalyses: noTests })).toHaveLength(1);
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

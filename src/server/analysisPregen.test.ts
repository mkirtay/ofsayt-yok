import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fixtures: [] as unknown[],
  stored: new Set<string>(),
  locked: new Set<string>(),
  generated: [] as string[],
  phase: 'PRE' as string,
  fail: false,
  released: 0,
}));

vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn(async () => h.fixtures) }));
vi.mock('@/services/liveScoreService', () => ({
  getCompetitionTableFull: vi.fn(async () => ({ table: [1, 2, 3, 4, 5, 6, 7].map((id) => ({ rank: id, team: { id: 100 + id } })) })),
}));
vi.mock('@/server/sportmonks/cachedFetch', () => ({
  trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), stale: false, failed: false, calls: 14, upstream: 6 }),
}));
vi.mock('@/lib/matchAnalysisLookup', () => ({ findStoredMatchAnalysis: vi.fn(async (id: string) => (h.stored.has(id) ? { id } : null)) }));
vi.mock('@/lib/analysisGenerationLock', () => ({
  acquireAnalysisLock: vi.fn(async (id: string) => (h.locked.has(id) ? null : { key: id, token: 't' })),
  releaseAnalysisLock: vi.fn(async (l: unknown) => {
    if (l) h.released++;
  }),
}));
vi.mock('@/server/buildMatchAnalysisContext', () => ({
  buildMatchAnalysisContext: vi.fn(async (id: string) => ({ archived: false, matchPhase: h.phase, match: { id: Number(id) } })),
}));
vi.mock('@/services/aiAnalysisService', () => ({
  generateMatchAnalysis: vi.fn(async (ctx: { match: { id: number } }) => {
    if (h.fail) throw new Error('zaman aşımı');
    h.generated.push(String(ctx.match.id));
    return { analysis: {}, modelVersion: 'v5-2026-10-openai:gpt-6-luna', tokensUsed: 5000 };
  }),
}));
vi.mock('@/server/saveMatchAnalysis', () => ({ saveGeneratedAnalysis: vi.fn(async () => ({ id: 'a' })) }));
vi.mock('@/lib/predictionRecords', () => ({ ensurePredictionRecordForAnalysis: vi.fn() }));
vi.mock('@/lib/credits', () => ({ isUniqueViolation: () => false }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import { runAnalysisPregen, selectPregenCandidates, topTeamIds, TURKEY_COUNTRY_ID } from './analysisPregen';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const at = (hoursFromNow: number) => new Date(NOW + hoursFromNow * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
const fx = (id: number, league: number, hours: number, teams: Array<[number, number?]>, state = 1) => ({
  id,
  name: `M${id}`,
  league_id: league,
  state_id: state,
  starting_at: at(hours),
  participants: teams.map(([tid, country]) => ({ id: tid, name: `T${tid}`, country_id: country ?? 1 })),
});

describe('maç öncesi ön üretim — aday seçimi', () => {
  const top = new Map([[8, new Set([101, 102, 103])]]);

  it('pencere ~3 sa (2 sa – 3 sa 15 dk); başlamamış maçlar; başlama saatine göre sıralı', () => {
    const list = selectPregenCandidates(
      [fx(1, 600, 3, [[1], [2]]), fx(2, 600, 1.5, [[1], [2]]), fx(3, 600, 3.5, [[1], [2]]), fx(4, 600, 2.1, [[1], [2]]), fx(5, 600, 3, [[1], [2]], 10)] as never,
      { now: NOW, topTeamsByLeague: top },
    );
    expect(list.map((c) => c.id)).toEqual([4, 1]);
  });

  it('Süper Lig tamamı; Avrupa\'da yalnız Türk takımı varsa; büyük 5\'te iki takım da ilk 6\'daysa', () => {
    const list = selectPregenCandidates(
      [
        fx(10, 600, 3, [[1], [2]]),
        fx(11, 2, 3, [[34, TURKEY_COUNTRY_ID], [83, 32]]),
        fx(12, 2, 3, [[3, 32], [4, 462]]),
        fx(13, 8, 3, [[101], [102]]),
        fx(14, 8, 3, [[101], [999]]),
        fx(15, 72, 3, [[1], [2]]),
      ] as never,
      { now: NOW, topTeamsByLeague: top },
    );
    expect(list.map((c) => [c.id, c.reason])).toEqual([
      [10, 'super-lig'],
      [11, 'uefa-turkish'],
      [13, 'big5-top'],
    ]);
  });

  it('lig tablosundan ilk 6', () => {
    const ids = topTeamIds({ table: [1, 2, 6, 7].map((r) => ({ rank: r, team: { id: r * 10 } })) } as never);
    expect([...ids]).toEqual([10, 20, 60]);
  });
});

describe('maç öncesi ön üretim — çalıştırma', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    h.fixtures = [fx(1, 600, 3, [[1], [2]]), fx(2, 600, 2.5, [[1], [2]]), fx(3, 600, 2.2, [[1], [2]]), fx(4, 600, 2.8, [[1], [2]])];
    h.stored.clear();
    h.locked.clear();
    h.generated = [];
    h.phase = 'PRE';
    h.fail = false;
    h.released = 0;
  });

  it('tek üretim: analizi olan atlanır, kilitli olan atlanır; çağrı başına en fazla 3 üretim; kilit bırakılır', async () => {
    h.stored.add('3');
    h.locked.add('2');
    const r = await runAnalysisPregen({ now: NOW });
    expect(r.items.map((i) => [i.matchId, i.status])).toEqual([
      [3, 'exists'],
      [2, 'locked'],
      [4, 'generated'],
      [1, 'generated'],
    ]);
    expect(r.items[2]).toMatchObject({ sportmonksCalls: 14, sportmonksUpstream: 6, modelVersion: 'v5-2026-10-openai:gpt-6-luna' });
    expect(h.released).toBe(2);
    expect(r.selection).toEqual({ sportmonksCalls: 14, sportmonksUpstream: 6 });

    h.fixtures = [1, 2, 3, 4, 5].map((id) => fx(10 + id, 600, 2.5, [[1], [2]]));
    h.stored.clear();
    h.locked.clear();
    const r2 = await runAnalysisPregen({ now: NOW });
    expect(r2.items.filter((i) => i.status === 'generated')).toHaveLength(3);
  });

  it('dryRun: LLM çağrısı yok; başlamış maç ve hata raporlanır', async () => {
    const dry = await runAnalysisPregen({ now: NOW, dryRun: true });
    expect(dry.items.every((i) => i.status === 'dry-run')).toBe(true);
    expect(h.generated).toEqual([]);

    h.phase = 'LIVE';
    expect((await runAnalysisPregen({ now: NOW })).items[0]!.status).toBe('not-pre');

    h.phase = 'PRE';
    h.fail = true;
    const failed = await runAnalysisPregen({ now: NOW });
    expect(failed.items[0]).toMatchObject({ status: 'error', error: 'zaman aşımı' });
    expect(h.released).toBeGreaterThan(0);
  });
});

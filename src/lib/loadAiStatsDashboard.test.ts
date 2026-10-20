import { describe, expect, it, vi } from 'vitest';

/** Kredi modeli v2: oynanmamış maçın tahmini (skor tahmini dahil) herkese açık geçmişte görünmez. */
const rec = (matchId: string, evaluatedAt: Date | null, modelVersion = 'v6-2026-10-openai:gpt-6-luna') => ({
  matchId,
  evaluatedAt,
  modelVersion,
  actualResult: evaluatedAt ? 'HOME' : null,
  actualScore: evaluatedAt ? '1-0' : null,
  extendedHits: evaluatedAt ? { htOver05Hit: false } : null,
  createdAt: new Date('2026-10-01'),
  matchAnalysis: {
    matchStatus: 'PRE',
    homeTeamName: 'H',
    awayTeamName: 'A',
    matchPrediction: { home: 58, draw: 24, away: 18 },
    goalExpectation: { over15: 80, homeToScore: 85, htOver05: 70, over25: 50 },
  },
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    predictionRecord: {
      findMany: vi.fn(async () => [
        rec('pending-1', null),
        rec('done-1', new Date('2026-10-02')),
        // Eski model aileleri (v1 Claude / v2 GPT-4.1) — sayfada hiç sayılmaz.
        rec('legacy-v1', new Date('2026-08-02'), 'v1-2026-07-anthropic:claude'),
        rec('legacy-v2', null, 'v2-2026-09-openai:gpt-4.1'),
      ]),
    },
  },
}));

vi.mock('@/server/cronJobs', () => ({
  readCronHeartbeats: vi.fn(async () => ({ 'evaluate-predictions': { lastRunAt: '2026-10-04T10:00:00Z', ms: 1, ok: true, summary: {}, trigger: 'cron' }, 'analysis-pregenerate': null })),
}));

import { loadAiStatsDashboard, promptVersion } from './loadAiStatsDashboard';

describe('loadAiStatsDashboard — bekleyen tahmin sızıntısı', () => {
  it('ziyaretçi / kullanıcı: geçmişte yalnız bitmiş maç; bekleyen yalnız sayı', async () => {
    const d = await loadAiStatsDashboard({ role: null });
    expect(d.history.map((h) => h.matchId)).toEqual(['done-1']);
    expect(d.pendingCount).toBe(1);
    expect(JSON.stringify(d.history)).not.toContain('pending-1');
  });

  it('yönetici bekleyenleri de görür', async () => {
    const d = await loadAiStatsDashboard({ role: 'ADMIN' });
    expect(d.history.map((h) => h.matchId).sort()).toEqual(['done-1', 'pending-1']);
  });

  it('yanıtta skor öngörüsü yok (tahmini skor, gerçek skor, tam skor isabeti) — gerçek skor yalnız isabet hesabında okunur', async () => {
    const d = await loadAiStatsDashboard({ role: 'ADMIN' });
    expect(JSON.stringify(d)).not.toMatch(/predictedScore|actualScore|scoreExact|result1x2|2-1|1-0/);
    expect(d.history.find((h) => h.matchId === 'done-1')).toMatchObject({ actualResult: 'HOME' });
  });

  it('en güçlü 3 tahmin: kart rozetleri ve isabet (1-0: ev gol ✓, 2+ gol ✗, ilk yarı gol ✗) — oran ve satır', async () => {
    const d = await loadAiStatsDashboard({ role: null });
    expect(d.topPicks).toEqual({ matches: 1, picks: 3, hits: 1, rate: 33.3 });
    expect(d.history[0]!.topPicks).toEqual([
      { key: 'homeToScore', pct: 85, hit: true },
      { key: 'over15', pct: 80, hit: false },
      { key: 'htOver05', pct: 70, hit: false },
    ]);
  });

  it('bekleyen maçın rozetleri yalnız yöneticiye, isabetsiz', async () => {
    const d = await loadAiStatsDashboard({ role: 'ADMIN' });
    expect(d.history.find((h) => h.matchId === 'pending-1')!.topPicks.every((p) => p.hit === null)).toBe(true);
  });

  it('eski model kayıtları (prompt v1/v2) ne sayılır ne listelenir', async () => {
    const d = await loadAiStatsDashboard({ role: 'ADMIN' });
    expect(d.totalRecords).toBe(2);
    expect(d.totalEvaluated).toBe(1);
    expect(d.pendingCount).toBe(1);
    expect(d.history.map((h) => h.matchId)).not.toEqual(expect.arrayContaining(['legacy-v1']));
    expect(JSON.stringify(d.history)).not.toContain('legacy');
  });

  it('promptVersion: sürüm öneki çözülür, tanınmayan 0', () => {
    expect(promptVersion('v6-2026-10-openai:gpt-6-luna')).toBe(6);
    expect(promptVersion('v12-x')).toBe(12);
    expect(promptVersion('claude-legacy')).toBe(0);
  });

  it('zamanlanmış iş nabzı yalnız yöneticiye', async () => {
    expect((await loadAiStatsDashboard({ role: null })).cronStatus).toBeUndefined();
    expect((await loadAiStatsDashboard({ role: 'ADMIN' })).cronStatus?.['evaluate-predictions']?.ok).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';

/** Kredi modeli v2: oynanmamış maçın tahmini (skor tahmini dahil) herkese açık geçmişte görünmez. */
const rec = (matchId: string, evaluatedAt: Date | null) => ({
  matchId,
  evaluatedAt,
  result1x2Hit: evaluatedAt ? true : null,
  scoreExactHit: evaluatedAt ? false : null,
  predictedHomePct: 58,
  predictedDrawPct: 24,
  predictedAwayPct: 18,
  predictedScore: '2-1',
  actualResult: evaluatedAt ? 'HOME' : null,
  actualScore: evaluatedAt ? '1-0' : null,
  createdAt: new Date('2026-10-01'),
  matchAnalysis: { matchStatus: 'PRE', homeTeamName: 'H', awayTeamName: 'A' },
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    predictionRecord: {
      findMany: vi.fn(async () => [rec('pending-1', null), rec('done-1', new Date('2026-10-02'))]),
    },
  },
}));

vi.mock('@/server/cronJobs', () => ({
  readCronHeartbeats: vi.fn(async () => ({ 'evaluate-predictions': { lastRunAt: '2026-10-04T10:00:00Z', ms: 1, ok: true, summary: {}, trigger: 'cron' }, 'analysis-pregenerate': null })),
}));

import { loadAiStatsDashboard } from './loadAiStatsDashboard';

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

  it('yanıtta skor öngörüsü yok (tahmini skor, gerçek skor, tam skor isabeti) — DB alanları seçilmez bile', async () => {
    const d = await loadAiStatsDashboard({ role: 'ADMIN' });
    expect(JSON.stringify(d)).not.toMatch(/predictedScore|actualScore|scoreExact|2-1|1-0/);
    expect(d.history.find((h) => h.matchId === 'done-1')).toMatchObject({ predictedHomePct: 58, actualResult: 'HOME', result1x2Hit: true });
  });

  it('zamanlanmış iş nabzı yalnız yöneticiye', async () => {
    expect((await loadAiStatsDashboard({ role: null })).cronStatus).toBeUndefined();
    expect((await loadAiStatsDashboard({ role: 'ADMIN' })).cronStatus?.['evaluate-predictions']?.ok).toBe(true);
  });
});

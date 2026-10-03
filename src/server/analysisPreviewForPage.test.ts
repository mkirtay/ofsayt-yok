import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ row: null as unknown, fail: false }));
vi.mock('@/lib/matchAnalysisLookup', () => ({
  findStoredMatchAnalysis: async () => {
    if (h.fail) throw new Error('db');
    return h.row;
  },
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import { loadAnalysisPreviewForPage } from './analysisPreviewForPage';

describe('loadAnalysisPreviewForPage (maç sayfası SSR)', () => {
  it('analiz varsa yalnız önizleme alanları; yoksa / DB hatasında null (sayfa çizilir)', async () => {
    h.row = {
      homeTeamName: 'A',
      awayTeamName: 'B',
      modelVersion: 'v4',
      matchPrediction: { home: 20, draw: 30, away: 50 },
      fullReport: { matchSummary: { tempo: 'Düşük tempo.', dominantSide: 'Deplasman önde.' }, analystComment: 'GİZLİ' },
      scorePrediction: { home: 0, away: 1 },
    };
    const p = await loadAnalysisPreviewForPage('1');
    expect(p).toEqual({ homeTeamName: 'A', awayTeamName: 'B', summary: ['Düşük tempo.', 'Deplasman önde.'], top: { outcome: 'AWAY', pct: 50 } });
    expect(JSON.stringify(p)).not.toContain('GİZLİ');
    h.row = null;
    expect(await loadAnalysisPreviewForPage('2')).toBeNull();
    h.fail = true;
    expect(await loadAnalysisPreviewForPage('3')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { buildAnalysisPreview } from './analysisPreview';

const row = {
  homeTeamName: 'Galatasaray',
  awayTeamName: 'Fenerbahçe',
  modelVersion: 'v4',
  matchPrediction: { home: 58, draw: 24, away: 18 },
  fullReport: {
    matchSummary: {
      tempo: 'Yüksek tempolu bir maç bekleniyor. İlk yarı baskılı geçecek.',
      dominantSide: 'Ev sahibi topa daha çok sahip olacak.',
      balanceType: 'GİZLİ',
      homeAwayImpact: 'GİZLİ',
    },
    tacticalAnalysis: 'GİZLİ TAKTİK',
    analystComment: 'GİZLİ YORUM',
  },
  scorePrediction: { home: 2, away: 1 },
  teamAnalyses: { home: { narrative: 'GİZLİ' } },
  bettingTips: [{ x: 'GİZLİ' }],
  homeTeamNarrative: 'GİZLİ',
};

describe('buildAnalysisPreview', () => {
  it('özet: tempo + baskın tarafın ilk cümlesi; ana olasılık en yüksek sonuç', () => {
    expect(buildAnalysisPreview(row)).toEqual({
      homeTeamName: 'Galatasaray',
      awayTeamName: 'Fenerbahçe',
      summary: ['Yüksek tempolu bir maç bekleniyor.', 'Ev sahibi topa daha çok sahip olacak.'],
      top: { outcome: 'HOME', pct: 58 },
    });
  });

  it('kilitli içerikten hiçbir şey sızmaz (yalnız izinli alanlar)', () => {
    const json = JSON.stringify(buildAnalysisPreview(row));
    expect(json).not.toMatch(/GİZLİ|scorePrediction|teamAnalyses|scenarios|bettingTips|analyst/);
  });

  it('deplasman / beraberlik önde, eşitlikte ev; bozuk olasılık → null; özet yoksa boş', () => {
    expect(buildAnalysisPreview({ ...row, matchPrediction: { home: 20, draw: 30, away: 50 } }).top).toEqual({ outcome: 'AWAY', pct: 50 });
    expect(buildAnalysisPreview({ ...row, matchPrediction: { home: 30, draw: 40, away: 30 } }).top).toEqual({ outcome: 'DRAW', pct: 40 });
    expect(buildAnalysisPreview({ ...row, matchPrediction: { home: 40, draw: 20, away: 40 } }).top?.outcome).toBe('HOME');
    expect(buildAnalysisPreview({ ...row, matchPrediction: {} }).top).toBeNull();
    expect(buildAnalysisPreview({ ...row, fullReport: null }).summary).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MatchAnalysisState } from '@/hooks/useMatchAnalysis';
import type { ApiAnalysis, ApiPredictionRecord } from './types';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import trMatch from '../../../public/locales/tr/match.json';
import enMatch from '../../../public/locales/en/match.json';
import trAi from '../../../public/locales/tr/ai.json';
import enAi from '../../../public/locales/en/ai.json';

vi.mock('@/components/KuralKosesi/DailyFactCard', () => ({ default: () => null }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }));

import MatchAnalysis from './index';

const analysis = (over: Partial<ApiAnalysis> = {}): ApiAnalysis =>
  ({
    id: 'a1',
    matchId: '19746609',
    matchStatus: 'PRE',
    homeTeamName: 'Trabzonspor',
    awayTeamName: 'Galatasaray',
    matchPrediction: { home: 30, draw: 25, away: 45, reasoning: 'Form farkı.' },
    scorePrediction: { mostLikely: '1-2', alternatives: [], reasoning: '' },
    goalExpectation: {
      over15: 70, over25: 55, over35: 30, btts: 65, htOver05: 60, htOver15: 40, homeToScore: 75, awayToScore: 80,
      bttsFirstHalf: 20, reasoning: 'İki takım da gol buluyor.',
    },
    bettingTips: [],
    teamAnalyses: {
      home: { narrative: 'n', keyFactors: [], formSummary: '', vsOpponentHistory: '' },
      away: { narrative: 'n', keyFactors: [], formSummary: '', vsOpponentHistory: '' },
    },
    fullReport: null,
    riskLevel: 'medium',
    riskReasoning: 'Dengeli.',
    confidenceScore: 75,
    ...over,
  }) as unknown as ApiAnalysis;

const record = {
  id: 'p1', actualResult: 'HOME', actualScore: '4-0', result1x2Hit: false, scoreExactHit: false, evaluatedAt: '2026-09-19T20:00:00Z',
  extendedHits: { over25Hit: true, bttsHit: false },
} as ApiPredictionRecord;

const render = (a: ApiAnalysis) => {
  const state = {
    analysis: a, predictionRecord: record, serverPhase: 'POST', loading: false, generating: false, error: null,
    credits: 0, unlimited: false, isAuthenticated: false, generate: async () => {},
  } as MatchAnalysisState;
  return renderToStaticMarkup(<MatchAnalysis match={null} state={state} />);
};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const scenario = { metric: '3+ gol', probability: 55, confidence: 'medium' as const, reasoning: 'İki takım da son 5 maçta ortalama 3 gol.' };

describe('AI analizi — olasılık senaryoları ve istatistik etiketleri', () => {
  it('yeni kayıt: "Olasılık Senaryoları" bölümü — olay, yüzde, güven düzeyi; Value Bet / Kaçın yok', () => {
    const t = text(render(analysis({ scenarios: [scenario] })));
    expect(t).toContain('Olasılık Senaryoları');
    expect(t).toMatch(/3\+ gol %55 Orta İki takım da son 5 maçta/);
    expect(t).not.toMatch(/Value Bet|Kaçın|Bahis|İddia/);
  });

  it('eski kayıt (senaryo yok): bölüm hiç çizilmez, analizin geri kalanı bozulmaz', () => {
    const t = text(render(analysis({ scenarios: [] })));
    expect(t).not.toContain('Olasılık Senaryoları');
    expect(t).toContain('Maç Sonucu Tahmini');
    expect(t).toContain('Gol Beklentisi');
  });

  it('çipler, sonuç kartları, isabet satırları ve uyarı istatistik dilinde; bahis terimi yok', () => {
    const t = text(render(analysis({ scenarios: [scenario] })));
    for (const label of ['Ev sahibi kazanır', 'Beraberlik', 'Deplasman kazanır', '2+ gol', 'İki takım da gol atar', 'İlk yarıda gol', 'Ev sahibi gol bulur', 'Maç sonucu', 'Doğru', 'Yanlış', 'Bilgi amaçlı istatistiksel tahmindir.']) {
      expect(t).toContain(label);
    }
    expect(t).not.toMatch(/MS [12X]|1X2|Üst [0-9]|[0-9] Üst|KG Var|Tuttu|Tutmadı|Ev Gol Atar/);
    expect(findGamblingTerms(t)).toEqual([]);
  });
});

describe('metin katalogları (TR/EN): AI analizi ve AI İstatistikleri bahis dilinden arınmış', () => {
  it.each([
    ['tr match.analysis', trMatch.analysis],
    ['en match.analysis', enMatch.analysis],
    ['tr ai', trAi],
    ['en ai', enAi],
  ])('%s', (_name, ns) => {
    const all = JSON.stringify(ns);
    expect(findGamblingTerms(all)).toEqual([]);
    expect(all).not.toMatch(/1X2|Üst [0-9]|KG Var|Value Bet|\bBTTS\b|\bOver [0-9]/);
  });
});

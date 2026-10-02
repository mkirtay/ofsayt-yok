import { describe, expect, it } from 'vitest';
import { ANALYSIS_MODEL_VERSION, ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserMessage } from './analysisPrompt';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const team = (name: string) => ({
  teamId: 1,
  teamName: name,
  metrics: {
    matchesAnalyzed: 5, wins: 3, draws: 1, losses: 1, goalsPerMatch: 1.8, goalsAgainstPerMatch: 0.8,
    cleanSheetRate: 0.4, bttsRate: 0.6, homeWinRate: 0.7, awayWinRate: 0.3, formTrend: 'rising',
  },
  standingRow: null,
  recentMatches: [{ date: '2026-09-20', isHome: true, opponent: 'X', scoreText: '2-1', result: 'G' }],
});

const ctx = {
  archived: false,
  match: { id: 1, home: { id: 1, name: 'Galatasaray' }, away: { id: 2, name: 'Fenerbahçe' }, competition: { name: 'Süper Lig' }, date: '2026-10-05' },
  matchPhase: 'PRE',
  events: [],
  liveStats: null,
  lineups: null,
  standings: null,
  homeTeam: team('Galatasaray'),
  awayTeam: team('Fenerbahçe'),
  h2h: null,
  oddsSignal: { pre: { '1': 1.95, X: 3.4, '2': 3.8 }, live: { '1': 1.8, X: 3.5, '2': 4.4 }, movement: 'home' },
} as unknown as MatchAnalysisContext;

// Kural 8 yasak listesini (kelimeleri sayarak) içerir; geri kalan prompt temiz olmalı.
const withoutBanRule = (s: string) => s.replace(/8\. DİL YASAĞI[\s\S]*?confidence "low"\./, '');

describe('analiz prompt\'u — bahis dili yok, olasılık senaryoları', () => {
  it('sistem prompt\'u: yasak kuralı var, kuralın dışında bahis terimi yok', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('DİL YASAĞI');
    expect(findGamblingTerms(withoutBanRule(ANALYSIS_SYSTEM_PROMPT))).toEqual([]);
    expect(ANALYSIS_MODEL_VERSION).toBe('v3-2026-10');
  });

  it('kullanıcı mesajı: şema `scenarios` (metric / probability / confidence / reasoning), bettingTips yok', () => {
    const msg = buildAnalysisUserMessage(ctx);
    expect(msg).toContain('"scenarios"');
    for (const k of ['"metric"', '"probability"', '"confidence"', '"reasoning"']) expect(msg).toContain(k);
    expect(msg).not.toMatch(/bettingTips|valueBet|"avoid"|"market"|"pick"/);
    expect(findGamblingTerms(msg)).toEqual([]);
    expect(msg).not.toMatch(/KG var|1X2|Üst\/Alt/i);
  });

  it('oranlar modele yüzde olarak gider (oran sayısı yok)', () => {
    const msg = buildAnalysisUserMessage(ctx);
    expect(msg).toContain('Maç öncesi: Ev sahibi %48 | Beraberlik %27 | Deplasman %25');
    expect(msg).toContain('Beklenti maç yaklaştıkça ev sahibi lehine kaydı');
    expect(msg).not.toMatch(/1\.95|3\.4\b|3\.8\b|4\.4\b/);
  });
});

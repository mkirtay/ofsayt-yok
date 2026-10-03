import { describe, expect, it } from 'vitest';
import { buildTriviaUserMessage, TRIVIA_MODEL_VERSION, TRIVIA_RESPONSE_FORMAT, TRIVIA_SYSTEM_PROMPT } from './triviaPrompt';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const team = (name: string) => ({
  teamId: 1,
  teamName: name,
  metrics: { matchesAnalyzed: 5, wins: 3, draws: 1, losses: 1, goalsPerMatch: 1.8, goalsAgainstPerMatch: 0.8, cleanSheetRate: 0.4, bttsRate: 0.6, formTrend: 'rising' },
  standingRow: null,
  recentMatches: [],
  scorers: [{ name: 'Golcü', goals: 6, assists: 2, apps: 4 }],
});
const ctx = {
  match: { home: { name: 'Galatasaray' }, away: { name: 'Fenerbahçe' }, competition: { name: 'Süper Lig' }, date: '2026-10-26' },
  matchPhase: 'PRE',
  homeTeam: team('Galatasaray'),
  awayTeam: team('Fenerbahçe'),
  h2h: null,
  lineups: null,
  oddsSignal: { pre: null, live: null, movement: null },
} as unknown as MatchAnalysisContext;

describe('trivia prompt v2 — yalnız veri', () => {
  it('genel bilgi ve tarihî rekabet yasak; veride olmayan alan boş bırakılır', () => {
    expect(TRIVIA_MODEL_VERSION).toBe('v2-trivia-data-2026-10');
    expect(TRIVIA_SYSTEM_PROMPT).toContain('YALNIZ verilen veriyi kullan');
    expect(TRIVIA_SYSTEM_PROMPT).toMatch(/tarihî olaylar, transfer\/kariyer geçmişi/);
    expect(TRIVIA_SYSTEM_PROMPT).not.toMatch(/genel futbol bilginle de destekle|Ertem Şener/);
    expect(TRIVIA_SYSTEM_PROMPT).toContain('Kaynağa\n   atıf yapma');
  });

  it('kullanıcı mesajı analizle aynı veri özetini kullanır (golcüler dahil), kelime sınırları var', () => {
    const msg = buildTriviaUserMessage(ctx);
    expect(msg).toContain('Ligde gol katkısı: Golcü 6 gol 2 asist (4 maç)');
    expect(msg).toContain('en fazla 20 kelime');
    expect(msg).toContain('YALNIZ verilen H2H satırlarından');
    expect(findGamblingTerms(msg)).toEqual([]);
  });

  it('katı şema: üç alan zorunlu, ek alan yok', () => {
    const s = TRIVIA_RESPONSE_FORMAT.json_schema;
    expect(s.strict).toBe(true);
    expect(s.schema.required).toEqual(['ertemFacts', 'contextual', 'rivalryContext']);
    expect(s.schema.additionalProperties).toBe(false);
  });
});

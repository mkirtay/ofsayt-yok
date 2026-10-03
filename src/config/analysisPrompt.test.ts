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
    expect(ANALYSIS_MODEL_VERSION).toBe('v4-2026-10');
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

  it('sakat/cezalılar: varsa mevki, dönüş ve katkıyla; boşsa "yok"; veri alınamadıysa bölüm hiç yok', () => {
    const withAbs = {
      ...ctx,
      homeTeam: {
        ...ctx.homeTeam,
        absences: [
          { name: 'Yedek Bek', kind: 'injury', reason: 'Hamstring', apps: 1, goals: 0, assists: 0 },
          { name: 'Golcü', position: 'Santrfor', kind: 'suspended', reason: 'Red Card Suspension', until: '2026-10-12', apps: 6, goals: 5, assists: 1 },
        ],
      },
      awayTeam: { ...ctx.awayTeam, absences: [] },
    } as unknown as MatchAnalysisContext;
    const msg = buildAnalysisUserMessage(withAbs);
    expect(msg).toContain('Eksikler (maç günü itibarıyla sakat/cezalı; katkı = ligde bu sezon):');
    // Önce daha çok oynayan (önem sırası).
    expect(msg.indexOf('Golcü (Santrfor) — cezalı: Red Card Suspension, dönüş tahmini 2026-10-12 · 6 maç, 5 gol, 1 asist'))
      .toBeLessThan(msg.indexOf('Yedek Bek — sakat: Hamstring · 1 maç, 0 gol, 0 asist'));
    expect(msg).toContain('Eksikler: bilinen sakat/cezalı oyuncu yok');
    expect(buildAnalysisUserMessage(ctx)).not.toContain('Eksikler');
  });

  it('kadro: muhtemel 11 dizilişle; resmî ise etiket değişir; oyuncu yoksa bölüm yok', () => {
    const rows = [1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 5];
    const xi = (team: string) =>
      rows.map((row, i) => ({ team_id: team, id: `${team}${i}`, name: `${team} O${i}`, substitution: '0', shirt_number: String(i + 1), pos_code: i === 0 ? 'GK' : 'X', formation_row: row }));
    const bench = { team_id: 'g', id: 'b1', name: 'Yedek', substitution: '1', shirt_number: '20' };
    const lineups = { lineup: { home: { team: { id: '1', name: 'Galatasaray' }, players: [...xi('g'), bench] }, away: { team: { id: '2', name: 'Fenerbahçe' }, players: xi('f') } }, confirmed: false };
    const msg = buildAnalysisUserMessage({ ...ctx, lineups } as unknown as MatchAnalysisContext);
    expect(msg).toContain('## Muhtemel 11 (resmî değil, tahmini)');
    expect(msg).toContain('Galatasaray (4-2-3-1): g O0 (GK), g O1 (X)');
    expect(msg).not.toContain('Yedek');
    const official = buildAnalysisUserMessage({ ...ctx, lineups: { ...lineups, confirmed: true } } as unknown as MatchAnalysisContext);
    expect(official).toContain('## İlk 11 (resmî)');
    const empty = { lineup: { home: { team: { id: '1', name: 'G' }, players: [] }, away: { team: { id: '2', name: 'F' }, players: [] } }, confirmed: null };
    expect(buildAnalysisUserMessage({ ...ctx, lineups: empty } as unknown as MatchAnalysisContext)).not.toMatch(/İlk 11|Muhtemel 11/);
  });

  it('kural: eksik veriden söz etmez, varsa sakat/kadroyu değerlendirir', () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('Bağlamda OLMAYAN bir veri hakkında yorum yapma');
    expect(ANALYSIS_SYSTEM_PROMPT).toContain('"Eksikler" ya da "İlk 11 / Muhtemel 11"');
    // Eski kural modelden "kadro verisi yok" demesini istiyordu.
    expect(ANALYSIS_SYSTEM_PROMPT).not.toMatch(/bunu açıkça belirt|bunu net şekilde ifade et/);
  });
});

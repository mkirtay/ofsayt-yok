import { describe, expect, it } from 'vitest';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { renderFinalTweet, renderGoalTweet, tweetLength, TWEET_MAX, type FinalFacts } from './templates';
import type { GoalFacts } from '@/lib/gundem/bot/goalTemplates';

const goal = (over: Partial<GoalFacts> = {}): GoalFacts => ({
  kind: 'goal', playerName: 'Yunus Akgün', teamName: 'Galatasaray', minute: 2, extraMinute: null,
  homeName: 'LOSC Lille', awayName: 'Galatasaray', score: { home: 0, away: 1 }, leagueName: 'Şampiyonlar Ligi', milestone: null, ...over,
});

describe('xbot şablonları', () => {
  it('gol: oyuncu, dakika, skor, lig; bağlantı yok', () => {
    const t = renderGoalTweet(goal(), 1);
    expect(t).toContain("2' Yunus Akgün (Galatasaray)");
    expect(t).toContain('LOSC Lille 0-1 Galatasaray');
    expect(t).toContain('Şampiyonlar Ligi');
    expect(t).not.toMatch(/https?:|\.com/);
    expect(findGamblingTerms(t)).toEqual([]);
  });

  it('gol: penaltı, kendi kalesine ve skor güvenilmezse skor satırı yok', () => {
    expect(renderGoalTweet(goal({ kind: 'penalty', minute: 30 }), 0)).toContain("Penaltıdan gol! 30' Yunus Akgün");
    const own = renderGoalTweet(goal({ kind: 'own-goal', teamName: null, score: null }), 0);
    expect(own).toContain("Kendi kalesine gol! 2' Yunus Akgün");
    expect(own).not.toContain('LOSC Lille 0');
  });

  it('gol: uzatma dakikası', () => {
    expect(renderGoalTweet(goal({ minute: 90, extraMinute: 3 }), 0)).toContain("90+3'");
  });

  it('maç sonu: aynı oyuncu tek satır, KK işareti, sınır içinde', () => {
    const f: FinalFacts = {
      homeName: 'LOSC Lille', awayName: 'Galatasaray', score: [2, 4], leagueName: 'Şampiyonlar Ligi', note: null,
      goals: [
        { minute: 2, player: 'Yunus Akgün', side: 'away' },
        { minute: 7, player: 'Soriba Diaoune', side: 'home' },
        { minute: 39, player: 'Soriba Diaoune', side: 'home' },
        { minute: 44, player: 'Aleksey Batrakov', side: 'away' },
        { minute: 52, player: 'Nabil Bentaleb', side: 'away', own: true },
        { minute: 61, player: 'Victor Osimhen', side: 'away' },
      ],
    };
    const t = renderFinalTweet(f);
    expect(t).toContain('Maç sonu: LOSC Lille 2-4 Galatasaray');
    expect(t).toContain("Soriba Diaoune 7', 39'");
    expect(t).toContain("Nabil Bentaleb 52' (KK)");
    expect(tweetLength(t)).toBeLessThanOrEqual(TWEET_MAX);
    expect(findGamblingTerms(t)).toEqual([]);
  });

  it('maç sonu: çok golde kısalır ama 270 sınırını aşmaz', () => {
    const goals = Array.from({ length: 14 }, (_, i) => ({ minute: i + 1, player: `Uzun İsimli Futbolcu ${i}`, side: (i % 2 ? 'home' : 'away') as 'home' | 'away' }));
    const t = renderFinalTweet({ homeName: 'Bayern München', awayName: 'Borussia Dortmund', score: [7, 7], leagueName: 'Bundesliga', note: 'Uzatmalar sonucu', goals });
    expect(tweetLength(t)).toBeLessThanOrEqual(TWEET_MAX);
    expect(t).toContain('Maç sonu: Bayern München 7-7 Borussia Dortmund');
  });
});

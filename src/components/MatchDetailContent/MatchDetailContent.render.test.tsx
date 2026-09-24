import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Alt bileşenler oturum/i18n/fetch'e bağlı — sekme yapısını izole test etmek için düz stub.
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) =>
      ({
        'tabs.label': 'Maç detay bölümleri',
        'tabs.overview': 'Genel Bakış',
        'tabs.forum': 'Forum',
        'tabs.analysis': 'AI Analiz',
        'tabs.trivia': 'Trivia',
      })[k] ?? k,
  }),
}));
vi.mock('@/components/MatchCard', () => ({ default: () => <div data-testid="match-card" /> }));
vi.mock('@/components/MatchStats', () => ({ default: () => <div data-testid="stats-content" /> }));
vi.mock('@/components/EventTimeline', () => ({ default: () => <div data-testid="events-content" /> }));
vi.mock('@/components/Lineup', () => ({ default: () => <div data-testid="lineup-content" /> }));
vi.mock('@/components/MatchTrivia', () => ({ default: () => <div data-testid="trivia-content" /> }));
vi.mock('@/components/MatchAnalysis', () => ({ default: () => <div data-testid="analysis-content" /> }));
vi.mock('@/hooks/useMatchAnalysis', () => ({ useMatchAnalysis: () => ({}) }));
vi.mock('@/components/MatchForumTab', () => ({ default: () => <div data-testid="forum-content" /> }));

import MatchDetailContent, { DEFAULT_MATCH_TAB, MATCH_TAB_KEYS } from './index';
import type { MatchDetailState } from '@/hooks/useMatchDetail';

const detail = {
  matchId: '1',
  match: null,
  events: [],
  lineups: null,
  stats: null,
  standings: null,
  seasons: [],
  selectedSeasonId: null,
  matchLoading: false,
  eventsLoading: false,
  statsLoading: false,
  lineupsLoading: false,
  standingsLoading: false,
  notFound: false,
  isArchivedMatch: false,
  handleSeasonChange: async () => {},
} satisfies MatchDetailState;

describe('<MatchDetailContent />', () => {
  const html = renderToStaticMarkup(<MatchDetailContent detail={detail} requestedMatchId="1" />);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);

  it('DÜZ dört üst sekme, bu sırayla: Genel Bakış | Forum | AI Analiz | Trivia', () => {
    expect(MATCH_TAB_KEYS).toEqual(['overview', 'forum', 'analysis', 'trivia']);
    expect(tabs).toHaveLength(4);
    expect(html.indexOf('>Genel Bakış')).toBeLessThan(html.indexOf('>Forum'));
    expect(html.indexOf('>Forum')).toBeLessThan(html.indexOf('>AI Analiz'));
    expect(html.indexOf('>AI Analiz')).toBeLessThan(html.indexOf('>Trivia'));
  });

  it('birleşik "AI Analiz & Topluluk" sekmesi ve alt sekme şeridi yok', () => {
    expect(html).not.toContain('Topluluk');
    expect(html).not.toContain('&amp; Topluluk');
    expect((html.match(/role="tablist"/g) ?? []).length).toBe(1);
  });

  it('varsayılan sekme Genel Bakış: yalnızca o paneli mount edilir', () => {
    expect(DEFAULT_MATCH_TAB).toBe('overview');
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(html).toContain('stats-content');
    expect(html).toContain('events-content');
    expect(html).toContain('lineup-content');
    expect(html).not.toContain('forum-content');
    expect(html).not.toContain('analysis-content');
    expect(html).not.toContain('trivia-content');
  });

  it('premium noktası yalnızca AI Analiz ve Trivia başlığında', () => {
    const chunk = (i: number) => html.split('role="tab"').slice(1)[i].split('</button>')[0];
    expect(chunk(0)).not.toContain('premiumDot');
    expect(chunk(1)).not.toContain('premiumDot');
    expect(chunk(2)).toContain('premiumDot');
    expect(chunk(3)).toContain('premiumDot');
  });
});

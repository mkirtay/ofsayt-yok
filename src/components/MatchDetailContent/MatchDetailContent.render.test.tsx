import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Alt bileşenler oturum/i18n/fetch'e bağlı — sekme yapısını izole test etmek için düz stub.
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) =>
      ({
        'tabs.label': 'Maç detay bölümleri',
        'tabs.overview': 'Genel Bakış',
        'tabs.commentary': 'Anlatım',
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
vi.mock('@/components/MatchCommentary', () => ({ default: () => <div data-testid="commentary-content" /> }));
vi.mock('@/components/MatchForumTab', () => ({ default: () => <div data-testid="forum-content" /> }));
vi.mock('@/components/MatchVenueCard', () => ({ default: () => null }));

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
  eventsError: false,
  statsError: false,
  lineupsError: false,
  standingsError: false,
  retryEvents: () => {},
  retryStats: () => {},
  retryLineups: () => {},
  retryStandings: () => {},
  notFound: false,
  isArchivedMatch: false,
  handleSeasonChange: async () => {},
} satisfies MatchDetailState;

describe('<MatchDetailContent />', () => {
  const html = renderToStaticMarkup(<MatchDetailContent detail={detail} requestedMatchId="1" />);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);

  it('DÜZ beş üst sekme, bu sırayla: Genel Bakış | Anlatım | Forum | AI Analiz | Trivia', () => {
    expect(MATCH_TAB_KEYS).toEqual(['overview', 'commentary', 'forum', 'analysis', 'trivia']);
    expect(tabs).toHaveLength(5);
    expect(html.indexOf('>Genel Bakış')).toBeLessThan(html.indexOf('>Anlatım'));
    expect(html.indexOf('>Anlatım')).toBeLessThan(html.indexOf('>Forum'));
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
    expect(html).not.toContain('commentary-content');
    expect(html).not.toContain('forum-content');
    expect(html).not.toContain('analysis-content');
    expect(html).not.toContain('trivia-content');
  });

  it('hiçbir sekme başlığında premium noktası yok (AI Analiz / Trivia dahil)', () => {
    const chunks = html.split('role="tab"').slice(1).map((c) => c.split('</button>')[0]);
    expect(chunks).toHaveLength(5);
    for (const c of chunks) expect(c).not.toContain('premiumDot');
  });
});

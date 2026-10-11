import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchCard from '@/components/MatchCard';
import type { Match } from '@/models/liveScore';

const live = (time: string) =>
  ({
    id: 19746600,
    status: 'IN PLAY',
    time,
    date: '2026-10-11',
    scheduled: '16:00',
    competition: { id: 600, name: 'Super Lig' },
    home: { id: 1, name: 'Gaziantep FK' },
    away: { id: 2, name: 'Çorum FK' },
    scores: { score: '1 - 0' },
  }) as unknown as Match;

const render = (match: Match) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MatchCard match={match} initialH2h={null} />
    </QueryClientProvider>,
  );

/** Dakika rozetinin metni (kesme `&#x27;` olarak kaçar). */
const badge = (html: string) => html.match(/class="[^"]*minuteBadge[^"]*"[^>]*>([^<]*)</)?.[1]?.replace(/&#x27;/g, "'");

describe('maç kartı dakika rozeti', () => {
  it.each(['51', "51'"])('time=%s → tek kesme "51\'"', (time) => {
    expect(badge(render(live(time)))).toBe("51'");
  });
});

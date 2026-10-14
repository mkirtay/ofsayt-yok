import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/', asPath: '/', push: vi.fn() }) }));

import MatchList from './index';

const logo = (id: number) => `https://cdn.sportmonks.com/images/soccer/teams/${id % 32}/${id}.png`;
const match = (id: number): Match =>
  ({
    id,
    status: 'NOT STARTED',
    time: '',
    date: '2026-02-25',
    scheduled: '20:00',
    home: { id: id * 10, name: `Ev ${id}`, logo: logo(id * 10) },
    away: { id: id * 10 + 1, name: `Dep ${id}`, logo: logo(id * 10 + 1) },
    scores: { score: '' },
  }) as Match;

describe('maç listesi — logolar', () => {
  it('ilk satırlar dahil tüm logolar tembel, boyutları sabit (eager / preload yok)', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchList
          groupedMatches={[
            {
              competition_id: 2,
              competition_name: 'UCL',
              competition_logo: 'https://cdn.sportmonks.com/images/soccer/leagues/2.png',
              matches: Array.from({ length: 8 }, (_, i) => match(i + 1)),
            },
          ] as never}
        />
      </QueryClientProvider>,
    );
    const imgs = [...html.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThanOrEqual(16);
    for (const img of imgs) {
      expect(img).toContain('loading="lazy"');
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
  });
});

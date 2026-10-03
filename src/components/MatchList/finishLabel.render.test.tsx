import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/', asPath: '/', push: vi.fn() }) }));

import MatchList from './index';

const match = (id: number, over: Partial<Match>): Match =>
  ({ id, status: 'FINISHED', time: '', date: '2026-02-25', scheduled: '20:00', home: { id: id * 10, name: `Ev ${id}` }, away: { id: id * 10 + 1, name: `Dep ${id}` }, scores: { score: '2-1' }, ...over }) as Match;

describe('maç satırı — bitiş etiketi', () => {
  it('normal bitiş "MS", uzatma "UZS", penaltı "PEN"', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchList
          groupedMatches={[
            { competition_id: 2, competition_name: 'UCL', matches: [match(1, {}), match(2, { finish: 'AET' }), match(3, { finish: 'PEN', scores: { score: '1-1', ps_score: '4-3' } })] },
          ] as never}
        />
      </QueryClientProvider>,
    );
    const statuses = [...html.matchAll(/virtualStatusFt[^"]*">([^<]+)</g)].map((x) => x[1]);
    expect(statuses).toEqual(['MS', 'UZS', 'PEN']);
  });
});

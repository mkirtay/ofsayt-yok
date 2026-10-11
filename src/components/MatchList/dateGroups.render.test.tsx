import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/', asPath: '/', push: vi.fn() }) }));

import MatchList from './index';

const match = (id: number): Match =>
  ({ id, status: 'NOT STARTED', time: '', date: '2026-10-11', scheduled: '17:00', home: { id: id * 10, name: `Ev ${id}` }, away: { id: id * 10 + 1, name: `Dep ${id}` } }) as Match;

describe('MatchList — gün gruplu (UEFA fikstürü) mod', () => {
  it('groupedMatches verilmeden çizilir (varsayılan boş dizi her render yeni olunca "Too many re-renders" atıyordu)', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchList dateGroups={[{ date: '2026-10-11', label: 'Bugün', matches: [match(1)] }, { date: '2026-10-12', label: 'Yarın', matches: [match(2)] }]} />
      </QueryClientProvider>,
    );
    expect(html).toContain('Bugün');
    expect(html).toContain('Ev 2');
  });
});

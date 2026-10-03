import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchCard from '@/components/MatchCard';
import type { Head2HeadData } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';

const match = {
  id: 19745055,
  status: 'NOT STARTED',
  time: '',
  date: '2026-10-03',
  scheduled: '13:00',
  home: { id: 1, name: 'Albacete' },
  away: { id: 2, name: 'SD Eibar' },
} as Match;

const h2h = {
  team1: { id: '1', name: 'Albacete', overall_form: ['W', 'D', 'L'], h2h_form: ['L'] },
  team2: { id: '2', name: 'SD Eibar', overall_form: ['W'], h2h_form: ['W'] },
  h2h: [{ id: '10', date: '2026-04-24', scheduled: '18:30', home_name: 'Albacete', away_name: 'SD Eibar', score: '0-3', ht_score: '0-2', status: 'FINISHED' }],
} as unknown as Head2HeadData;

const render = (initialH2h?: Head2HeadData | null) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MatchCard match={match} initialH2h={initialH2h} />
    </QueryClientProvider>,
  );

describe('maç kartı — karşılaşma geçmişi yeri ve başlama günü (CLS)', () => {
  it('SSR verdiyse: tablo doğrudan çizilir, iskelet ya da ayrılmış kutu yok', () => {
    const html = render(h2h);
    expect(html).toContain('0-3');
    expect(html).not.toMatch(/h2hSkeletonRow|h2hReserved/);
  });

  it('SSR vermediyse: iskelet (yer baştan ayrılır)', () => {
    expect(render(undefined)).toMatch(/h2hSkeletonRow/);
  });

  it('başlama günü SSR\'da tarih (Bugün/Yarın mount sonrası tarihin üstüne biner, genişlik değişmez)', () => {
    const html = render(h2h);
    const day = html.match(/<span class="[^"]*kickoffDay[^"]*">(.*?)<\/span><\/div>/)?.[1] ?? '';
    expect(day.replace(/<[^>]+>/g, '')).toBe('3 Ekim Cumartesi');
  });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchCard from '@/components/MatchCard';
import type { Match } from '@/models/liveScore';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const match = (odds?: Match['odds']): Match =>
  ({
    id: 19745050,
    status: 'NOT STARTED',
    time: '',
    date: '2026-10-02',
    scheduled: '18:30',
    home: { id: 1, name: 'Eldense' },
    away: { id: 2, name: 'Real Oviedo' },
    ...(odds ? { odds } : {}),
  }) as Match;

const render = (m: Match) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MatchCard match={m} />
    </QueryClientProvider>,
  );

describe('maç kartı — piyasa beklentisi şeridi', () => {
  it('oranlar yüzdeye çevrilir; oran sayıları gösterilmez', () => {
    const html = render(match({ pre: { '1': 1.95, X: 3.4, '2': 3.8 } }));
    const strip = html.match(/<p class="[^"]*oddsStrip[^"]*">(.*?)<\/p>/)?.[1] ?? '';
    const text = strip.replace(/<[^>]+>/g, '');
    expect(text).toBe('Piyasa beklentisi: Ev %48 · Beraberlik %27 · Dep. %25');
    expect(html).not.toMatch(/1\.95|3\.4|3\.8/);
    expect(findGamblingTerms(text)).toEqual(['piyasa']); // kullanıcı kararı: "Piyasa beklentisi" etiketi
  });

  it('oran yoksa ya da eksikse şerit yok', () => {
    expect(render(match())).not.toContain('Piyasa beklentisi');
    expect(render(match({ pre: { '1': 1.95, X: 3.4 } as never }))).not.toContain('Piyasa beklentisi');
  });
});

/**
 * Karşılaşma geçmişi bağlantıları: en yeni 10 maç normal, eskiler `rel="nofollow"` (WEB-SPORTMONKS-2).
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchCard from '@/components/MatchCard';
import type { Head2HeadData } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';

const DATA = {
  team1: { id: '34', name: 'Galatasaray', overall_form: ['W'], h2h_form: ['L'] },
  team2: { id: '83', name: 'FC Barcelona', overall_form: ['W'], h2h_form: ['W'] },
};

describe('karşılaşma geçmişi bağlantıları', () => {
  it('uzun geçmiş: en yeni 10 maç normal bağlantı, eskiler rel="nofollow" (kullanıcı yine tıklar, botlar inmez)', () => {
    const match = { id: 19872596, status: 'NOT STARTED', time: '', date: '2026-10-13', scheduled: '19:00', home: { id: 34, name: 'Galatasaray' }, away: { id: 83, name: 'FC Barcelona' } } as Match;
    const h2h = Array.from({ length: 14 }, (_, i) => ({
      id: String(1000 + i),
      date: `${2010 + i}-02-16`,
      scheduled: '20:00',
      home_name: 'Galatasaray',
      away_name: 'FC Barcelona',
      score: '1-2',
      status: 'FINISHED',
    }));
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchCard match={match} initialH2h={{ ...DATA, h2h } as unknown as Head2HeadData} />
      </QueryClientProvider>,
    );
    const links = [...html.matchAll(/<a [^>]*href="\/matches\/(\d+)[^"]*"[^>]*>/g)].map((m) => ({ id: m[1], nofollow: /rel="nofollow"/.test(m[0]) }));
    expect(links).toHaveLength(14);
    expect(links.filter((l) => l.nofollow).map((l) => l.id).sort()).toEqual(['1000', '1001', '1002', '1003']);
  });
});

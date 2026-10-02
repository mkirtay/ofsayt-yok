import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import type { MatchEvent, MatchLineupData, MatchStatsData } from '@/models/domain';

vi.mock('@/hooks/useLiveMatchUpdates', () => ({ useLiveMatchUpdates: () => {} }));

import { useMatchDetail, type MatchDetailSeed } from './useMatchDetail';

const match = { id: 19746609, status: 'FINISHED', date: '2026-09-19', scheduled: '20:00' } as unknown as Match;
const events = [{ id: 1, minute: 4 }] as unknown as MatchEvent[];
const stats = { home: { corners: 1 }, away: { corners: 5 } } as unknown as MatchStatsData;
const lineups = { lineup: { home: { players: [] }, away: { players: [] } } } as unknown as MatchLineupData;

function Probe({ id, initialMatch, seed }: { id: string; initialMatch: Match | null; seed?: MatchDetailSeed }) {
  const d = useMatchDetail(id, { initialMatch, initialDetail: seed });
  return (
    <pre>
      {JSON.stringify({
        events: d.events.length,
        stats: d.stats != null,
        lineups: d.lineups != null,
        eventsLoading: d.eventsLoading,
        statsLoading: d.statsLoading,
        lineupsLoading: d.lineupsLoading,
      })}
    </pre>
  );
}

const state = (html: string) => JSON.parse(html.replace(/^<pre>|<\/pre>$/g, '').replace(/&quot;/g, '"'));

describe('useMatchDetail — SSR Genel Bakış verisi (ilk boyama = sunucu HTML\'i)', () => {
  it('olay / istatistik / kadro geldiyse ilk boyamada gerçek içerik, yükleniyor yok', () => {
    const html = renderToStaticMarkup(<Probe id="19746609" initialMatch={match} seed={{ events, stats, lineups }} />);
    expect(state(html)).toEqual({ events: 1, stats: true, lineups: true, eventsLoading: false, statsLoading: false, lineupsLoading: false });
  });

  it('"veri yok" (null / boş liste) da gerçek durum: boş durum çizilir, yükleniyor yok', () => {
    const html = renderToStaticMarkup(<Probe id="19746609" initialMatch={match} seed={{ events: [], stats: null, lineups: null }} />);
    expect(state(html)).toMatchObject({ events: 0, stats: false, lineups: false, eventsLoading: false, statsLoading: false, lineupsLoading: false });
  });

  it('bütçeyi aşan alan (undefined) yükleniyor kalır → istemci çeker', () => {
    const html = renderToStaticMarkup(<Probe id="19746609" initialMatch={match} seed={{ events, stats: undefined, lineups: undefined }} />);
    expect(state(html)).toMatchObject({ eventsLoading: false, statsLoading: true, lineupsLoading: true });
  });

  it('başka maç istendiyse (ya da SSR maçı yoksa) tohum kullanılmaz', () => {
    for (const html of [
      renderToStaticMarkup(<Probe id="1" initialMatch={match} seed={{ events, stats, lineups }} />),
      renderToStaticMarkup(<Probe id="19746609" initialMatch={null} seed={{ events, stats, lineups }} />),
    ]) {
      expect(state(html)).toEqual({ events: 0, stats: false, lineups: false, eventsLoading: true, statsLoading: true, lineupsLoading: true });
    }
  });
});

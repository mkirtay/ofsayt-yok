import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mapSportmonksFixtureToMatch } from '@/services/sportmonksFixtureMapper';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import inplayFixture from '@/services/sportmonks/__fixtures__/inplayFixture.json';
import { filterLiveMatches } from '@/utils/liveTicker';

vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, pathname: '/', asPath: '/', push: vi.fn() }) }));

import MatchList from './index';
import MatchCard from '@/components/MatchCard';

/** Sportmonks'un başlamadan ~1 sa önce gönderdiği biçim: durum NS, CURRENT satırları 0-0. */
const sportmonksFixture = (stateId: number): SportmonksFixture => ({
  ...(inplayFixture as SportmonksFixture),
  state_id: stateId,
  state: undefined,
  scores: [
    { type_id: 1525, participant_id: 255667, description: 'CURRENT', score: { goals: 0, participant: 'home' } },
    { type_id: 1525, participant_id: 249912, description: 'CURRENT', score: { goals: 0, participant: 'away' } },
  ] as SportmonksFixture['scores'],
});

const wrap = (node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
const listScore = (html: string) => /data-goal-anchor[^>]*>(?:<[^>]+>)*([^<]+)</.exec(html)?.[1];

describe('başlamamış maçta Sportmonks 0-0\'ı ekrana çıkmaz', () => {
  it('liste: başlamadı → "—"; canlı ve bitmiş 0-0 aynen', () => {
    const row = (stateId: number) =>
      listScore(
        wrap(
          <MatchList groupedMatches={[{ competition_id: 606, competition_name: 'Kupa', matches: [mapSportmonksFixtureToMatch(sportmonksFixture(stateId))] }]} />,
        ),
      );
    expect(row(1)).toBe('—');
    expect(row(2)).toBe('0-0');
    expect(row(5)).toBe('0-0');
  });

  it('maç sayfası kartı: başlamadı → skor yerine başlama saati; canlı maçta 0 - 0', () => {
    const ns = wrap(<MatchCard match={mapSportmonksFixtureToMatch(sportmonksFixture(1))} />);
    expect(ns).toContain('kickoffTime');
    expect(ns).not.toMatch(/scoreHome[^>]*>0</);
    const live = wrap(<MatchCard match={mapSportmonksFixtureToMatch(sportmonksFixture(2))} />);
    expect(live).not.toContain('kickoffTime');
    expect(live).toMatch(/scoreHome[^>]*>0</);
  });

  it('ticker: başlamamış maç zaten hiç girmez (yalnız oynanan / devre arası)', () => {
    const ns = mapSportmonksFixtureToMatch(sportmonksFixture(1));
    expect(filterLiveMatches({ live: [ns], leagueFilter: { mode: 'all', custom: [] } as never })).toEqual([]);
  });
});

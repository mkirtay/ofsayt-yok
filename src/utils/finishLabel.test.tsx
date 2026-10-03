import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import { finishedLabelKey } from './finishLabel';
import { mapSportmonksFinish } from '@/services/sportmonks/stateMapping';
import { mapSportmonksFixtureToMatch } from '@/services/sportmonksFixtureMapper';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import MatchCard from '@/components/MatchCard';
import trMatch from '../../public/locales/tr/match.json';
import enMatch from '../../public/locales/en/match.json';

const m = (over: Partial<Match>): Match =>
  ({ id: 1, status: 'FINISHED', time: '', date: '2026-02-25', scheduled: '20:00', home: { id: 1, name: 'Juventus' }, away: { id: 2, name: 'Galatasaray' }, scores: { score: '3-2' }, ...over }) as Match;
const badge = (match: Match) =>
  renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><MatchCard match={match} /></QueryClientProvider>).match(/minuteBadge[^"]*">([^<]+)</)?.[1];

describe('uzatma / penaltıyla bitiş etiketi', () => {
  it('Sportmonks durumu: 7 AET → UZS, 8 FTP → PEN, normal bitişte penaltı skoru varsa PEN, normal FT etiketsiz', () => {
    expect(mapSportmonksFinish(7, false)).toBe('AET');
    expect(mapSportmonksFinish(8, false)).toBe('PEN');
    expect(mapSportmonksFinish(7, true)).toBe('PEN');
    expect(mapSportmonksFinish(5, true)).toBe('PEN');
    expect(mapSportmonksFinish(5, false)).toBeUndefined();
    expect(mapSportmonksFinish(2, true)).toBeUndefined(); // canlı
  });

  it('mapper: state 7 → finish AET; state 5 → alan yok', () => {
    const base = { id: 1, participants: [] } as unknown as SportmonksFixture;
    expect(mapSportmonksFixtureToMatch({ ...base, state_id: 7 }).finish).toBe('AET');
    expect(mapSportmonksFixtureToMatch({ ...base, state_id: 8 }).finish).toBe('PEN');
    expect(mapSportmonksFixtureToMatch({ ...base, state_id: 5 }).finish).toBeUndefined();
  });

  it('etiket anahtarı ve metinler (TR / EN)', () => {
    expect(finishedLabelKey({})).toBe('fullTime');
    expect(finishedLabelKey({ finish: 'AET' })).toBe('afterExtraTime');
    expect(finishedLabelKey({ finish: 'PEN' })).toBe('afterPenalties');
    expect([trMatch.fullTime, trMatch.afterExtraTime, trMatch.afterPenalties]).toEqual(['MS', 'UZS', 'PEN']);
    expect([enMatch.fullTime, enMatch.afterExtraTime, enMatch.afterPenalties]).toEqual(['FT', 'AET', 'PEN']);
  });

  it('maç kartı rozeti: MS / UZS / PEN', () => {
    expect(badge(m({}))).toBe('MS');
    expect(badge(m({ finish: 'AET' }))).toBe('UZS');
    expect(badge(m({ finish: 'PEN', scores: { score: '1-1', ps_score: '4-3' } }))).toBe('PEN');
  });
});

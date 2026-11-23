import { describe, expect, it, vi } from 'vitest';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }));

import { analysisGetUrl } from './useMatchAnalysis';
import { analysisScopeOf } from '@/components/MatchDetailContent';

const base = {
  status: 'NOT STARTED',
  date: '2026-11-24',
  scheduled: '17:45',
  home: { id: 34, name: 'Galatasaray' },
  away: { id: 15, name: 'Aston Villa' },
  competition: { id: 2, name: 'Champions League' },
} as const;

describe('analiz "planlı mı" bilgisi', () => {
  it('başlamamış, saati belli maçtan lig/takım/başlama (UTC)', () => {
    expect(analysisScopeOf(base as never)).toEqual({ leagueId: 2, homeId: 34, awayId: 15, kickoffMs: Date.parse('2026-11-24T17:45:00Z') });
  });
  it('başlamış, saati belirsiz ya da lig yoksa gönderilmez', () => {
    expect(analysisScopeOf({ ...base, status: 'IN PLAY' } as never)).toBeNull();
    expect(analysisScopeOf({ ...base, time_tbd: true } as never)).toBeNull();
    expect(analysisScopeOf({ ...base, competition: undefined } as never)).toBeNull();
    expect(analysisScopeOf(null)).toBeNull();
  });
  it('GET adresi: bilgi varsa sorguya eklenir, yoksa yalnız v=2', () => {
    expect(analysisGetUrl('1', null)).toBe('/api/matches/1/analysis?v=2');
    expect(analysisGetUrl('1', { leagueId: 2, homeId: 34, awayId: 15, kickoffMs: 9 })).toBe('/api/matches/1/analysis?v=2&league=2&home=34&away=15&ko=9');
  });
});

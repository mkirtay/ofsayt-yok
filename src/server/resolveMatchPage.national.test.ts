import { describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/server/storedMatch', () => ({ findStoredMatchInfo: vi.fn() }));
vi.mock('@/lib/resolveLiveMatch', () => ({ resolveSportmonksMatch: vi.fn() }));
vi.mock('@/server/apiFootball/nationalMatch', () => ({ lookupNationalMatch: vi.fn() }));

import { resolveMatchPage, type ResolveMatchPageDeps } from './resolveMatchPage';

const match = { id: 2_001_528_905, status: 'FINISHED', time: '', home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } } as Match;

function deps(over: Partial<ResolveMatchPageDeps> = {}): ResolveMatchPageDeps & { sm: ReturnType<typeof vi.fn>; stored: ReturnType<typeof vi.fn> } {
  const sm = vi.fn();
  const stored = vi.fn();
  return { findStored: stored, resolve: sm, resolveNational: vi.fn(), nationalEnabled: () => true, ...over, sm, stored } as never;
}

describe('resolveMatchPage — milli maç dalı (id >= 2e9)', () => {
  it('bayrak kapalı → missing, ne AF ne Sportmonks çağrılır', async () => {
    const d = deps({ nationalEnabled: () => false });
    expect(await resolveMatchPage('2001528905', '', d)).toEqual({ kind: 'missing' });
    expect(d.resolveNational).not.toHaveBeenCalled();
    expect(d.sm).not.toHaveBeenCalled();
  });
  it('bayrak açık + bulundu → match (stats/lineups dahil), Sportmonks çağrılmaz', async () => {
    const d = deps({ resolveNational: vi.fn(async () => ({ kind: 'found' as const, bundle: { match, events: [], stats: null, lineups: null } })) });
    const r = await resolveMatchPage('2001528905', '', d);
    expect(r).toMatchObject({ kind: 'match', stats: null, lineups: null });
    expect(d.sm).not.toHaveBeenCalled();
    expect(d.stored).not.toHaveBeenCalled();
  });
  it('yok → missing; geçici hata → error', async () => {
    expect(await resolveMatchPage('2001528905', '', deps({ resolveNational: vi.fn(async () => ({ kind: 'missing' as const })) }))).toEqual({ kind: 'missing' });
    expect(await resolveMatchPage('2001528905', '', deps({ resolveNational: vi.fn(async () => ({ kind: 'error' as const })) }))).toEqual({ kind: 'error' });
  });
  it('lig maçı (Sportmonks) yolu değişmez: AF çağrılmaz', async () => {
    const d = deps({ resolve: vi.fn(async () => ({ kind: 'found' as const, match, events: [] })) as never });
    const r = await resolveMatchPage('19746621', '', d);
    expect(r.kind).toBe('match');
    expect(d.resolveNational).not.toHaveBeenCalled();
  });
});

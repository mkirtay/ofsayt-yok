import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import { homeHubMatchesQueryKey, syncLivePatchToHomeQueries, type HomeHubMatchesData } from './useHomeHubMatches';

const gs = (score: string, over: Partial<Match> = {}) =>
  ({ id: 19746594, status: 'IN PLAY', time: "74'", scores: { score }, ...over }) as Match;
const day = (m: Match): HomeHubMatchesData => ({ allMatches: [m], liveMatches: [m], fixtureMatches: [m], nightMatches: [] });

describe('syncLivePatchToHomeQueries', () => {
  it('önbellekteki her gün listesine yazar; "son güncelleme" zamanı değişmez', () => {
    const qc = new QueryClient();
    qc.setQueryData(homeHubMatchesQueryKey('2026-10-09'), day(gs('1-0')), { updatedAt: 1_000 });
    qc.setQueryData(homeHubMatchesQueryKey('2026-10-10'), day(gs('1-0', { id: 1 })), { updatedAt: 2_000 });

    syncLivePatchToHomeQueries(qc, { id: 19746594, status: 'IN PLAY', time: "75'", scores: { score: '1-1' } });

    const today = qc.getQueryData<HomeHubMatchesData>(homeHubMatchesQueryKey('2026-10-09'))!;
    expect(today.liveMatches[0]!.scores?.score).toBe('1-1');
    expect(today.allMatches[0]!.scores?.score).toBe('1-1');
    expect(qc.getQueryState(homeHubMatchesQueryKey('2026-10-09'))!.dataUpdatedAt).toBe(1_000);
    expect(qc.getQueryData<HomeHubMatchesData>(homeHubMatchesQueryKey('2026-10-10'))!.liveMatches[0]!.scores?.score).toBe('1-0');
  });

  it('geride kalan ya da değişiklik getirmeyen yama önbelleğe hiç yazılmaz', () => {
    const qc = new QueryClient();
    qc.setQueryData(homeHubMatchesQueryKey('2026-10-09'), day(gs('1-1', { time: "76'" })), { updatedAt: 1_000 });
    const spy = vi.spyOn(qc, 'setQueryData');

    syncLivePatchToHomeQueries(qc, { id: 19746594, status: 'IN PLAY', time: "75'", scores: { score: '1-0' } });
    syncLivePatchToHomeQueries(qc, { id: 19746594, status: 'IN PLAY', time: "80'", scores: { score: '1-1' } });

    expect(spy).not.toHaveBeenCalled();
    expect(qc.getQueryData<HomeHubMatchesData>(homeHubMatchesQueryKey('2026-10-09'))!.liveMatches[0]!.scores?.score).toBe('1-1');
  });

  it('bitmiş maç sonradan gelen canlı yamayla canlıya dönmez', () => {
    const qc = new QueryClient();
    qc.setQueryData(homeHubMatchesQueryKey('2026-10-09'), day(gs('2-1', { status: 'FINISHED', time: '' })));
    syncLivePatchToHomeQueries(qc, { id: 19746594, status: 'IN PLAY', time: "90+5'", scores: { score: '2-1' } });
    expect(qc.getQueryData<HomeHubMatchesData>(homeHubMatchesQueryKey('2026-10-09'))!.allMatches[0]!.status).toBe('FINISHED');
  });
});

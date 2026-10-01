import { describe, expect, it, vi } from 'vitest';
import celta from '@/services/sportmonks/__fixtures__/celtaVigoFixture.json';
import periodsLive from '@/services/sportmonks/__fixtures__/periodsLive.json';
import type { Match } from '@/models/liveScore';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { loadLiveMatch, type LiveMatchDeps } from './liveMatch';

const ID = (celta as { id: number }).id;

/** Gerçek Celta–Osasuna fixture'ı (olay + istatistik dolu) üzerine canlı durum, skor ve dakika. */
function inplayRow(stateId: number, homeGoals = 1, awayGoals = 1): SportmonksFixture {
  return {
    ...(celta as unknown as SportmonksFixture),
    state_id: stateId,
    periods: periodsLive as unknown as SportmonksFixture['periods'],
    scores: [
      { type_id: 1525, participant_id: 36, description: 'CURRENT', score: { goals: homeGoals, participant: 'home' } },
      { type_id: 1525, participant_id: 459, description: 'CURRENT', score: { goals: awayGoals, participant: 'away' } },
    ] as unknown as SportmonksFixture['scores'],
  };
}

function deps(over: Partial<LiveMatchDeps>): LiveMatchDeps {
  return {
    loadInplay: async () => [],
    loadFixture: async () => ({ match: null, events: [] }),
    loadStats: async () => null,
    onLiveMissingFromInplay: vi.fn(),
    ...over,
  };
}

describe('loadLiveMatch', () => {
  it('inplay\'de: skor, durum, dakika, olaylar ve istatistik tek kaynaktan; tekil fixture çağrılmaz', async () => {
    const loadFixture = vi.fn();
    const r = await loadLiveMatch(String(ID), deps({ loadInplay: async () => [inplayRow(2, 2, 1)], loadFixture }));
    expect(r).toMatchObject({ live: true, source: 'inplay', match: { id: ID, status: 'IN PLAY' } });
    expect(r!.match.time).toMatch(/^\d+'$/);
    expect(r!.match.scores?.score).toBe('2-1');
    expect(r!.events.length).toBeGreaterThan(0);
    expect(r!.stats).not.toBeNull();
    // Yalnız güncellenecek alanlar (lig/stadyum/hakem sayfadan geliyor, inplay'de istenmiyor)
    expect(Object.keys(r!.match).sort()).toEqual(['id', 'scores', 'status', 'time']);
    expect(loadFixture).not.toHaveBeenCalled();
  });

  it.each([
    [3, 'HT'],
    [21, 'uzatma arası'],
    [6, 'uzatma'],
    [23, 'uzatma 2. yarı'],
    [25, 'penaltılar arası'],
    [9, 'penaltı atışları'],
  ])('state %i (%s) canlı sayılır → güncelleme sürer', async (stateId) => {
    const r = await loadLiveMatch(String(ID), deps({ loadInplay: async () => [inplayRow(stateId)] }));
    expect(r?.live).toBe(true);
  });

  it('canlı ama inplay\'de yok (ör. devre arası listeden düştü) → tekil fixture, canlı, gözlem logu', async () => {
    const onMissing = vi.fn();
    const ht = { id: ID, status: 'HALF TIME BREAK', time: '', scores: { score: '1-0' } } as unknown as Match;
    const r = await loadLiveMatch(
      String(ID),
      deps({
        loadFixture: async () => ({ match: ht, events: [{ id: 1 } as never] }),
        loadStats: async () => ({ possession: { home: 50, away: 50 } } as never),
        onLiveMissingFromInplay: onMissing,
      }),
    );
    expect(r).toMatchObject({ live: true, source: 'fixture', match: { status: 'HALF TIME BREAK' } });
    expect(r!.events).toHaveLength(1);
    expect(onMissing).toHaveBeenCalledWith(String(ID), 'HALF TIME BREAK');
  });

  it('bitti → canlı değil, son durum döner (istemci yazıp durur)', async () => {
    const ft = { id: ID, status: 'FINISHED', time: '', scores: { score: '2-1' } } as unknown as Match;
    const r = await loadLiveMatch(String(ID), deps({ loadFixture: async () => ({ match: ft, events: [] }) }));
    expect(r).toMatchObject({ live: false, source: 'fixture', match: { status: 'FINISHED', scores: { score: '2-1' } } });
  });

  it('ne inplay\'de ne fixture\'da → null', async () => {
    expect(await loadLiveMatch('123', deps({}))).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ tokens: [] as unknown[], sent: [] as unknown[] }));
vi.mock('@/lib/prisma', () => ({ prisma: { pushToken: { findMany: async () => h.tokens, updateMany: async () => ({ count: 0 }) } } }));
vi.mock('@/lib/livescoreCache', () => {
  const m = new Map<string, unknown>();
  return { readCache: async (k: string) => m.get(k) ?? null, writeCache: async (k: string, v: unknown) => void m.set(k, v) };
});
vi.mock('@/lib/webPush', () => ({
  webPushEnabled: () => !!process.env.VAPID_PRIVATE_KEY,
  sendWebPush: async (_t: string, p: unknown) => (h.sent.push(p), 'ok'),
}));
const live = vi.hoisted(() => ({ score: '0-0' }));
vi.mock('@/services/liveScoreService', () => ({
  getLiveMatches: async () => ({ matches: [{ id: 7, status: 'IN PLAY', time: "23'", home: { id: 34, name: 'Galatasaray' }, away: { id: 88, name: 'Fenerbahçe' }, scores: { score: live.score } }] }),
  getFixturesByDate: async () => [],
  getMatchLineups: async () => null,
}));

import { goalEvents, runPushTick } from './tick';

afterEach(() => {
  delete process.env.VAPID_PRIVATE_KEY;
});

describe('favori takım bildirimleri (büyüme raporu 3.1)', () => {
  const m = { id: 7, status: 'IN PLAY', time: "23'", home: { id: 34, name: 'Galatasaray' }, away: { id: 88, name: 'Fenerbahçe' }, scores: { score: '1-0' } } as never;

  it('skor artınca gol olayı; ilk görüşte olay yok', () => {
    expect(goalEvents(m, null)).toEqual([]);
    const [ev] = goalEvents(m, { home: 0, away: 0 });
    expect(ev!.payload).toMatchObject({ title: '⚽ GOL! Galatasaray', body: "Galatasaray 1-0 Fenerbahçe · 23'" });
    expect(ev!.teamIds).toEqual([34, 88]);
    expect(goalEvents(m, { home: 1, away: 0 })).toEqual([]);
  });

  it('gizli anahtar yok / abone yok → Sportmonks\'a gitmeden döner', async () => {
    expect(await runPushTick()).toEqual({ skipped: 'disabled' });
    process.env.VAPID_PRIVATE_KEY = 'x';
    h.tokens = [];
    expect(await runPushTick()).toEqual({ skipped: 'no-subscribers', subscribers: 0 });
  });

  it('favori takımın golü yalnız o takımın abonesine gider', async () => {
    process.env.VAPID_PRIVATE_KEY = 'x';
    h.tokens = [
      { id: 't1', token: 'a', user: { favoriteTeamIds: [34] } },
      { id: 't2', token: 'b', user: { favoriteTeamIds: [999] } },
    ];
    live.score = '0-0';
    expect(await runPushTick()).toMatchObject({ events: 0, sent: 0 }); // ilk görüş: kayıt
    live.score = '1-0';
    expect(await runPushTick()).toMatchObject({ events: 1, sent: 1 });
    expect(h.sent).toHaveLength(1);
  });
});

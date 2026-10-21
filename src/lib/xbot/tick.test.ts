import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/livescoreCache', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn(), sportmonksClientRequest: vi.fn() }));
vi.mock('@/services/liveScoreService', () => ({ getFixturesByDate: vi.fn() }));
vi.mock('@/server/sportmonks/cachedFetch', () => ({ trackSportmonksFetches: vi.fn() }));
vi.mock('@/lib/resolveLiveMatch', () => ({ resolveLiveMatch: vi.fn() }));
vi.mock('@/server/og/matchOgImage', () => ({ renderMatchOgImage: vi.fn() }));
vi.mock('./xClient', () => ({ createXPoster: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>, _fallback: T) => {
    const r = {
      set: async (k: string, v: unknown, o?: { nx?: boolean }) => {
        if (o?.nx && h.store.has(k)) return null;
        h.store.set(k, v);
        return 'OK';
      },
      get: async (k: string) => h.store.get(k) ?? null,
      del: async (k: string) => (h.store.delete(k) ? 1 : 0),
      incr: async (k: string) => {
        const n = Number(h.store.get(k) ?? 0) + 1;
        h.store.set(k, n);
        return n;
      },
      expire: async () => 1,
    };
    return fn(r) as Promise<T>;
  },
}));

import { runXTick, type XTickDeps } from './tick';

const NOW = new Date('2026-10-21T19:30:00Z');
const part = (id: number, name: string, loc: 'home' | 'away') => ({ id, name, meta: { location: loc } });
const ev = (id: number, minute: number, participant: number, name: string, type = 14) => ({
  id, type_id: type, minute, extra_minute: null, sort_order: 1, participant_id: participant, player_id: id * 10, player_name: name,
});
const fixture = (events: ReturnType<typeof ev>[], id = 1) => ({
  id, league_id: 2, starting_at: '2026-10-21 19:00:00', participants: [part(10, 'Lille', 'home'), part(20, 'Galatasaray', 'away')], league: { id: 2, name: 'Şampiyonlar Ligi' }, events,
}) as never;

function deps(over: Partial<XTickDeps> & { fixtures?: unknown[][] }): { d: XTickDeps; post: ReturnType<typeof vi.fn> } {
  const post = vi.fn(async () => ({ id: 't1' }));
  const frames = [...(over.fixtures ?? [])];
  const d: XTickDeps = {
    fetchInplay: async () => (frames.length > 1 ? frames.shift() : frames[0]) as never,
    shouldPoll: async () => true,
    isRateLimited: async () => false,
    resolveMatch: async () => null,
    renderImage: async () => null,
    poster: () => ({ post }),
    mode: () => 'live',
    now: () => NOW,
    ...over,
  };
  return { d, post };
}

describe('runXTick', () => {
  beforeEach(() => h.store.clear());

  it('kapalıyken hiçbir şey yapmaz', async () => {
    const { d, post } = deps({ mode: () => 'off', fixtures: [[fixture([])]] });
    expect((await runXTick(d)).tracked).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('gol: ilk görüşte atılmaz, ikinci tick\'te atılır, üçüncüde tekrar atılmaz', async () => {
    const goal = ev(5, 12, 20, 'Yunus Akgün');
    const { d, post } = deps({ fixtures: [[fixture([])], [fixture([goal])], [fixture([goal])], [fixture([goal])]] });
    await runXTick(d); // fixture ilk görüldü (baseline), gol yok
    const s2 = await runXTick(d); // gol ilk kez
    expect(s2.pending).toBe(1);
    expect(post).not.toHaveBeenCalled();
    const s3 = await runXTick(d); // ikinci görüş → atılır
    expect(s3.sent).toBe(1);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toContain("12' Yunus Akgün (Galatasaray)");
    await runXTick(d);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('VAR iptali: ikinci tick\'te gol listeden gittiyse atılmaz', async () => {
    const goal = ev(5, 12, 20, 'Yunus Akgün');
    const { d, post } = deps({ fixtures: [[fixture([])], [fixture([goal])], [fixture([])]] });
    await runXTick(d);
    await runXTick(d);
    await runXTick(d);
    expect(post).not.toHaveBeenCalled();
  });

  it('bota girişte maçta zaten olan goller baseline: atılmaz', async () => {
    const goals = [ev(5, 12, 20, 'Yunus Akgün'), ev(6, 30, 10, 'Diaoune')];
    const { d, post } = deps({ fixtures: [[fixture(goals)]] });
    const s1 = await runXTick(d);
    const s2 = await runXTick(d);
    const s3 = await runXTick(d);
    expect(s1.baselined).toBe(2);
    expect(s2.sent + s3.sent).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('dry: tweet üretir, atmaz; sonra live\'a geçince etkilenmez', async () => {
    const goal = ev(5, 12, 20, 'Yunus Akgün');
    const frames = [[fixture([])], [fixture([goal])], [fixture([goal])]];
    const { d, post } = deps({ mode: () => 'dry', fixtures: frames });
    await runXTick(d);
    await runXTick(d);
    const s = await runXTick(d);
    expect(s.dry).toHaveLength(1);
    expect(s.dry[0].text).toContain('Yunus Akgün');
    expect(post).not.toHaveBeenCalled();
  });

  it('tick başına en fazla 3 tweet', async () => {
    const goals = [1, 2, 3, 4, 5].map((i) => ev(i, i, 20, `Oyuncu ${i}`));
    const { d, post } = deps({ fixtures: [[fixture([])], [fixture(goals)], [fixture(goals)], [fixture(goals)]] });
    await runXTick(d);
    await runXTick(d);
    await runXTick(d);
    expect(post).toHaveBeenCalledTimes(3);
    await runXTick(d);
    expect(post).toHaveBeenCalledTimes(5);
  });

  it('maç sonu: inplay\'den düşen maç FINISHED ise skor + görselle bir kez atılır', async () => {
    const resolved = {
      match: { id: 1, status: 'FINISHED', home: { name: 'LOSC Lille' }, away: { name: 'Galatasaray' }, scores: { score: '2-4' }, competition: { id: 2, name: 'Champions League' } },
      events: [{ id: 1, player: { id: 1, name: 'Yunus Akgün' }, time: 2, event: 'GOAL', sort: 1, info: null, is_home: false, is_away: true }],
    } as never;
    const img = Buffer.from('png');
    const { d, post } = deps({ fixtures: [[fixture([])], [], []], resolveMatch: async () => resolved, renderImage: async () => img });
    await runXTick(d); // maç canlı listeye girdi
    const s = await runXTick(d); // düştü → final
    expect(s.sent).toBe(1);
    expect(post).toHaveBeenCalledWith(expect.stringContaining('Maç sonu: LOSC Lille 2-4 Galatasaray'), img);
    expect(post.mock.calls[0][0]).toContain('Şampiyonlar Ligi');
    expect(post.mock.calls[0][0]).not.toContain('Champions League');
    await runXTick(d);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('maç sonu: henüz FINISHED değilse sonra yeniden dener', async () => {
    let status = 'INPLAY';
    const resolved = () => ({ match: { id: 1, status, home: { name: 'A' }, away: { name: 'B' }, scores: { score: '1-0' } }, events: [] }) as never;
    const { d, post } = deps({ fixtures: [[fixture([])], [], [], []], resolveMatch: async () => resolved() });
    await runXTick(d);
    await runXTick(d);
    expect(post).not.toHaveBeenCalled();
    status = 'FINISHED';
    await runXTick(d);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('anahtar yoksa (live) hiçbir şey atılmaz', async () => {
    const { d } = deps({ poster: () => null, fixtures: [[fixture([])]] });
    expect((await runXTick(d)).degraded).toBe('no-keys');
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any -- handler yanıtları gevşek şemalı */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ viewer: null as string | null, cache: new Map<string, unknown>() }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    post: { findMany: vi.fn(), create: vi.fn() },
    matchSnapshot: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
    follow: { findMany: vi.fn(async () => []) },
    user: { findUnique: vi.fn(async () => ({ id: 'u1' })) },
  },
}));
vi.mock('@/lib/mobileAuth', () => ({ getRequestUserId: vi.fn(async () => h.viewer) }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: vi.fn(async () => ({ success: true, resetAt: 0 })),
  requestIp: () => '203.0.113.9',
}));
// Paylaşılan akış cache'i süreç içi Map: gerçek Redis'e gidilmez.
vi.mock('@/lib/livescoreCache', () => ({
  readCache: vi.fn(async (k: string) => h.cache.get(k) ?? null),
  writeCache: vi.fn(async (k: string, v: unknown) => void h.cache.set(k, v)),
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/gundem/official', () => ({ getOfficialAccountEmails: () => ['o@x'], isOfficialUser: () => false }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import handler from '@/pages/api/gundem/posts/index';

const findMany = vi.mocked(prisma.post.findMany);
const snapFindMany = vi.mocked(prisma.matchSnapshot.findMany);

const row = (id: string, matchId: string | null) => ({
  id,
  body: 'b',
  createdAt: new Date('2026-09-25T00:00:00Z'),
  authorType: 'USER',
  matchId,
  teamId: null,
  author: { id: 'a', name: 'A', username: null, image: null, email: null, _count: { followers: 0, following: 0 }, followers: false },
  _count: { likes: 0, comments: 0 },
  likes: false,
});

const snapshot = (fixtureId: string) => ({
  fixtureId,
  homeTeamId: 34,
  homeName: 'Galatasaray',
  homeShortName: 'GAL',
  homeLogo: 'gs.png',
  awayTeamId: 83,
  awayName: 'FC Barcelona',
  awayShortName: null,
  awayLogo: 'fcb.png',
  startingAt: new Date('2026-09-27T17:00:00Z'),
  leagueId: 2,
  createdAt: new Date(),
  updatedAt: new Date(),
});

async function call(req: Partial<NextApiRequest>) {
  const out = { status: 200, body: undefined as any };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(b: unknown) {
      out.body = b;
      return this;
    },
    setHeader() {
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler({ query: {}, headers: {}, ...req } as NextApiRequest, res);
  return out;
}
const get = (query: Record<string, string>) => call({ method: 'GET', query });
const whereOf = () => findMany.mock.calls.at(-1)![0]!.where;

beforeEach(() => {
  h.viewer = null;
  h.cache.clear();
  findMany.mockReset().mockResolvedValue([] as never);
  snapFindMany.mockReset().mockResolvedValue([] as never);
  vi.mocked(prisma.matchSnapshot.findUnique).mockReset().mockResolvedValue(null);
  vi.mocked(sportmonksClientRequest).mockReset();
});
afterEach(() => {
  delete process.env.GUNDEM_MATCH_POSTS_IN_ALL;
});

describe('GET /api/gundem/posts — scope ve kill-switch', () => {
  it('Tümü: varsayılan olarak maç postları dahil (matchId filtresi yok)', async () => {
    const r = await get({});
    expect(r.status).toBe(200);
    expect(whereOf()).toEqual({ deletedAt: null });
  });

  it('Tümü: GUNDEM_MATCH_POSTS_IN_ALL=false → maç postları dışlanır', async () => {
    process.env.GUNDEM_MATCH_POSTS_IN_ALL = 'false';
    await get({ scope: 'all' });
    expect(whereOf()).toEqual({ deletedAt: null, matchId: null });
  });

  it('kill-switch yalnızca "false" ile kapanır (bozuk değer → görünür)', async () => {
    process.env.GUNDEM_MATCH_POSTS_IN_ALL = 'hayir';
    await get({ scope: 'all' });
    expect(whereOf()).toEqual({ deletedAt: null });
  });

  it('Maçlar: yalnızca maç postları; kill-switch kapalıyken de', async () => {
    process.env.GUNDEM_MATCH_POSTS_IN_ALL = 'false';
    await get({ scope: 'match' });
    expect(whereOf()).toEqual({ deletedAt: null, matchId: { not: null } });
  });

  it('Maç forumu: scope=match&matchId → tek maç', async () => {
    await get({ scope: 'match', matchId: '19134567' });
    expect(whereOf()).toEqual({ deletedAt: null, matchId: '19134567' });
  });

  it('bozuk matchId → 400; matchId başka scope ile → 400', async () => {
    expect((await get({ scope: 'match', matchId: 'abc' })).status).toBe(400);
    expect((await get({ scope: 'all', matchId: '1' })).status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('bilinmeyen scope → 400; takip oturumsuz → 401', async () => {
    expect((await get({ scope: 'x' })).status).toBe(400);
    expect((await get({ scope: 'following' })).status).toBe(401);
  });

  it('rozetler sayfa başına TEK sorguyla eklenir; snapshot\'sız maç postunda match: null', async () => {
    findMany.mockResolvedValue([row('p1', '100'), row('p2', null), row('p3', '100'), row('p4', '200')] as never);
    snapFindMany.mockResolvedValue([snapshot('100')] as never);
    const r = await get({});
    expect(snapFindMany).toHaveBeenCalledTimes(1);
    expect(snapFindMany.mock.calls[0][0]).toEqual({ where: { fixtureId: { in: ['100', '200'] } } });
    const byId = Object.fromEntries(r.body.items.map((p: any) => [p.id, p.match]));
    expect(byId.p1).toMatchObject({ fixtureId: '100', home: { name: 'Galatasaray', shortName: 'GAL' }, away: { shortName: null } });
    expect(byId.p2).toBeNull();
    expect(byId.p4).toBeNull();
  });

  it('maç postu yoksa snapshot sorgusu atılmaz', async () => {
    findMany.mockResolvedValue([row('p1', null)] as never);
    await get({});
    expect(snapFindMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/gundem/posts — oturumsuz paylaşılan cache', () => {
  const keys = () => [...h.cache.keys()];

  it('oturumsuz scope=all ile scope=match farklı anahtarda; ikincisi DB\'ye gider', async () => {
    findMany.mockResolvedValue([row('p1', '100')] as never);
    await get({ scope: 'all' });
    await get({ scope: 'match' });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(new Set(keys()).size).toBe(2);
    await get({ scope: 'all' });
    expect(findMany).toHaveBeenCalledTimes(2); // HIT
  });

  it('kill-switch değişince anahtar değişir: eski "Tümü" sayfası okunmaz', async () => {
    findMany.mockResolvedValue([row('p1', '100')] as never);
    await get({ scope: 'all' });
    process.env.GUNDEM_MATCH_POSTS_IN_ALL = 'false';
    await get({ scope: 'all' });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(whereOf()).toEqual({ deletedAt: null, matchId: null });
    expect(new Set(keys()).size).toBe(2);
  });

  it('oturumlu istek ve scope=following paylaşılan cache\'e ne yazar ne okur', async () => {
    findMany.mockResolvedValue([row('p1', null)] as never);
    h.viewer = 'u1';
    await get({ scope: 'all' });
    await get({ scope: 'match' });
    await get({ scope: 'following' });
    expect(keys()).toEqual([]);
    h.viewer = null;
    await get({ scope: 'all' });
    h.viewer = 'u1';
    await get({ scope: 'all' });
    expect(findMany).toHaveBeenCalledTimes(5); // oturumlu ikinci istek HIT değil
  });

  it('cache\'lenen sayfa maç rozetini (snapshot) taşır', async () => {
    findMany.mockResolvedValue([row('p1', '100')] as never);
    snapFindMany.mockResolvedValue([snapshot('100')] as never);
    await get({ scope: 'match', matchId: '100' });
    const hit = await get({ scope: 'match', matchId: '100' });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(hit.body.items[0].match).toMatchObject({ fixtureId: '100', home: { shortName: 'GAL' } });
  });

  it('boş maç forumu cache\'e yazılmaz (rastgele matchId ile anahtar şişirilemez)', async () => {
    await get({ scope: 'match', matchId: '555' });
    expect(keys()).toEqual([]);
  });
});

describe('POST /api/gundem/posts — matchId doğrulama', () => {
  const post = (body: unknown) => call({ method: 'POST', body });
  beforeEach(() => {
    h.viewer = 'u1';
    vi.mocked(prisma.post.create).mockReset().mockImplementation((async ({ data }: any) => row('new', data.matchId)) as never);
  });

  it('bozuk matchId → 400 Türkçe hata, sağlayıcıya gidilmez, post yazılmaz', async () => {
    const r = await post({ body: 'maç', matchId: 'abc' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Geçersiz maç.');
    expect(sportmonksClientRequest).not.toHaveBeenCalled();
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('bilinmeyen maç (sağlayıcıda yok) → 400', async () => {
    vi.mocked(sportmonksClientRequest).mockResolvedValue({ data: null } as never);
    const r = await post({ body: 'maç', matchId: '999' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Maç bulunamadı.');
    expect(prisma.post.create).not.toHaveBeenCalled();
  });

  it('sağlayıcı erişilemez → 503', async () => {
    vi.mocked(sportmonksClientRequest).mockRejectedValue(new Error('ağ'));
    const r = await post({ body: 'maç', matchId: '999' });
    expect(r.status).toBe(503);
  });

  it('geçerli matchId (sayı da olur) → snapshot + post matchId ile yazılır', async () => {
    vi.mocked(prisma.matchSnapshot.findUnique).mockResolvedValue(snapshot('19134567') as never);
    snapFindMany.mockResolvedValue([snapshot('19134567')] as never);
    const r = await post({ body: 'maç', matchId: 19134567 });
    expect(r.status).toBe(201);
    expect(vi.mocked(prisma.post.create).mock.calls[0][0].data).toMatchObject({ matchId: '19134567' });
    expect(r.body.match).toMatchObject({ fixtureId: '19134567' });
  });

  it('matchId yoksa snapshot aranmaz', async () => {
    const r = await post({ body: 'serbest' });
    expect(r.status).toBe(201);
    expect(prisma.matchSnapshot.findUnique).not.toHaveBeenCalled();
    expect(r.body.match).toBeNull();
  });
});

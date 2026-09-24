/* eslint-disable @typescript-eslint/no-explicit-any -- entegrasyon testinde yanıt gövdeleri gevşek şemalı */
/**
 * GERÇEK veritabanı entegrasyon testi: Gündem maç postları — matchId doğrulama + MatchSnapshot, `scope=match` (+ tek maç
 * forumu), `GUNDEM_MATCH_POSTS_IN_ALL` kill-switch'i, bot postunda snapshot. Sportmonks MOCK'lanır (ağ yok, kota harcanmaz).
 *
 * Çalıştırma: `npm run test:db`. Kullanıcılar `itest-<runId>` önekli; fixture id'leri 9xxxxxxxxxxx aralığında sahte.
 * Sonda kullanıcılar (post/beğeni cascade) ve bu testin yazdığı MatchSnapshot satırları silinir ve doğrulanır.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const ENABLED = process.env.DB_INTEGRATION === '1';

const h = vi.hoisted(() => ({
  runId: `itest-${Math.random().toString(16).slice(2, 10)}`,
  // 12 haneli, gerçek Sportmonks id'leriyle çakışmayacak sahte fixture id'leri.
  base: 900_000_000_000 + Math.floor(Math.random() * 90_000_000) * 1000,
}));

process.env.OFFICIAL_ACCOUNT_EMAILS = `${h.runId}-official@example.invalid`;
process.env.GUNDEM_BOT_EMAIL = `${h.runId}-official@example.invalid`;

// Redis `null` → rate limit ve akış cache'i süreç içi fallback: oturumsuz maç akışı (test postlarıyla!) paylaşılan (prod)
// Redis'e yazılmaz, prod cache'i de teste sızmaz (bkz. lib/gundem/feedCache.ts).
vi.mock('@/lib/redis', () => ({ getRedisClient: () => null }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn(), sportmonksCollectAllPages: vi.fn() }));

const d = ENABLED ? describe : describe.skip;

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;
type Captured = { status: number; body: any };

function makeReq(opts: { method: string; query?: Record<string, string>; body?: unknown; token?: string; headers?: Record<string, string> }) {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      host: 'localhost:3000',
      'x-forwarded-for': '203.0.113.8',
      ...(opts.headers ?? {}),
    },
    cookies: {},
    socket: { remoteAddress: '203.0.113.8' },
  } as unknown as NextApiRequest;
}

async function call(handler: Handler, req: NextApiRequest): Promise<Captured> {
  const out: Captured = { status: 200, body: undefined };
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
    getHeader() {
      return undefined;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return out;
}

d('DB entegrasyonu — Gündem maç postları (snapshot, scope=match, kill-switch)', () => {
  const runId = h.runId;
  const fx = (n: number) => String(h.base + n);
  const MATCH_A = fx(1);
  const MATCH_B = fx(2);
  const MATCH_BOT = fx(3);
  const UNKNOWN = fx(9);

  let prisma: typeof import('@/lib/prisma').prisma;
  let smRequest: ReturnType<typeof vi.fn>;
  let postsHandler: Handler;
  let postHandler: Handler;
  let botHandler: Handler;
  let alice: { id: string; token: string };
  let bob: { id: string; token: string };

  const fixture = (id: string) => ({
    data: {
      id: Number(id),
      league_id: 600,
      starting_at: '2030-01-01 17:00:00',
      participants: [
        { id: 34, name: 'Galatasaray', short_code: 'GAL', image_path: 'https://cdn/gs.png', meta: { location: 'home', winner: null } },
        { id: 83, name: 'FC Barcelona', short_code: null, image_path: 'https://cdn/fcb.png', meta: { location: 'away', winner: null } },
      ],
    },
  });

  beforeAll(async () => {
    process.env.CRON_SECRET = `${runId}-cron-secret`;
    ({ prisma } = await import('@/lib/prisma'));
    smRequest = vi.mocked((await import('@/services/sportmonksRuntimeClient')).sportmonksClientRequest) as any;
    smRequest.mockImplementation(async (_base: string, path: string) => {
      const id = path.split('/').pop()!;
      return id === UNKNOWN ? { data: null } : fixture(id);
    });
    postsHandler = (await import('@/pages/api/gundem/posts/index')).default;
    postHandler = (await import('@/pages/api/gundem/posts/[postId]/index')).default;
    botHandler = (await import('@/pages/api/admin/gundem/bot-post')).default;

    const { issueMobileToken } = await import('@/lib/mobileAuth');
    const mk = async (label: string) => {
      const u = await prisma.user.create({
        data: { email: `${runId}-${label}@example.invalid`, name: `ITest ${label}`, credits: 0 },
        select: { id: true },
      });
      return { id: u.id, token: await issueMobileToken({ sub: u.id, role: 'USER', credits: 0 }) };
    };
    alice = await mk('alice');
    bob = await mk('bob');
    await mk('official');
  });

  afterEach(() => {
    delete process.env.GUNDEM_MATCH_POSTS_IN_ALL;
  });

  afterAll(async () => {
    if (!prisma) return;
    const ids = [MATCH_A, MATCH_B, MATCH_BOT, UNKNOWN];
    await prisma.user.deleteMany({ where: { email: { startsWith: runId } } });
    await prisma.matchSnapshot.deleteMany({ where: { fixtureId: { in: ids } } });
    const left = await prisma.user.count({ where: { email: { startsWith: runId } } });
    const leftSnaps = await prisma.matchSnapshot.count({ where: { fixtureId: { in: ids } } });
    await prisma.$disconnect();
    expect({ left, leftSnaps }).toEqual({ left: 0, leftSnaps: 0 });
  });

  // POST limiti kullanıcı başına 5/dk: alice 4 istek (2 geçersiz + A maçına 2), kalan postları bob atar → 429'a takılmaz.
  const create = (body: Record<string, unknown>, as: { token: string } = alice) =>
    call(postsHandler, makeReq({ method: 'POST', token: as.token, body }));
  const feed = (query: Record<string, string>) => call(postsHandler, makeReq({ method: 'GET', query }));
  const ids = (r: Captured) => r.body.items.map((p: any) => p.id);

  let postA1: string;
  let postA2: string;
  let postB: string;
  let postFree: string;

  it('geçersiz ve bilinmeyen matchId → 400, post ve snapshot yazılmaz', async () => {
    const bad = await create({ body: 'x', matchId: 'abc' });
    expect(bad).toMatchObject({ status: 400, body: { error: 'Geçersiz maç.' } });
    const unknown = await create({ body: 'x', matchId: UNKNOWN });
    expect(unknown).toMatchObject({ status: 400, body: { error: 'Maç bulunamadı.' } });
    expect(await prisma.post.count({ where: { authorId: alice.id } })).toBe(0);
    expect(await prisma.matchSnapshot.count({ where: { fixtureId: UNKNOWN } })).toBe(0);
  });

  it('geçerli matchId: snapshot 1 istekle oluşur, ikinci postta istek atılmaz; yanıt rozetli', async () => {
    smRequest.mockClear();
    const a1 = await create({ body: 'GS maçı\nharika', matchId: MATCH_A });
    expect(a1.status).toBe(201);
    expect(a1.body.body).toBe('GS maçı\nharika'); // satır sonu korunur
    expect(a1.body.match).toMatchObject({ fixtureId: MATCH_A, home: { name: 'Galatasaray', shortName: 'GAL' }, away: { shortName: null } });
    expect(smRequest).toHaveBeenCalledTimes(1);
    const snap = await prisma.matchSnapshot.findUnique({ where: { fixtureId: MATCH_A } });
    expect(snap).toMatchObject({ homeTeamId: 34, awayTeamId: 83, leagueId: 600 });

    const a2 = await create({ body: 'ikinci', matchId: Number(MATCH_A) });
    expect(a2.status).toBe(201);
    expect(smRequest).toHaveBeenCalledTimes(1);

    const b = await create({ body: 'başka maç', matchId: MATCH_B }, bob);
    const free = await create({ body: 'serbest post' }, bob);
    expect(free.body.match).toBeNull();
    [postA1, postA2, postB, postFree] = [a1.body.id, a2.body.id, b.body.id, free.body.id];
  });

  it('tek post GET rozeti içerir', async () => {
    const r = await call(postHandler, makeReq({ method: 'GET', query: { postId: postA1 } }));
    expect(r.body.match?.fixtureId).toBe(MATCH_A);
  });

  it('scope=match&matchId → yalnızca o maçın postları (yeniden eskiye)', async () => {
    const r = await feed({ scope: 'match', matchId: MATCH_A });
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual([postA2, postA1]);
  });

  it('scope=match → maç postları var, serbest post yok', async () => {
    const r = await feed({ scope: 'match' });
    expect(ids(r)).toEqual(expect.arrayContaining([postA1, postA2, postB]));
    expect(ids(r)).not.toContain(postFree);
  });

  it('Tümü: varsayılan maç postları dahil; kill-switch false → hariç, Maçlar etkilenmez', async () => {
    const on = await feed({ scope: 'all' });
    expect(ids(on)).toEqual(expect.arrayContaining([postFree, postB, postA2, postA1]));

    process.env.GUNDEM_MATCH_POSTS_IN_ALL = 'false';
    const off = await feed({ scope: 'all' });
    expect(ids(off)).toContain(postFree);
    expect(ids(off)).not.toEqual(expect.arrayContaining([postB]));
    expect(off.body.items.every((p: any) => p.matchId === null)).toBe(true);
    const match = await feed({ scope: 'match', matchId: MATCH_B });
    expect(ids(match)).toEqual([postB]);
  });

  it('bot postu: matchId varsa snapshot oluşur ve post rozetli döner', async () => {
    const r = await call(
      botHandler,
      makeReq({
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        body: { body: 'GOL!', externalKey: `${runId}:goal:1`, matchId: MATCH_BOT },
      }),
    );
    expect(r.status).toBe(201);
    expect(r.body.post.match).toMatchObject({ fixtureId: MATCH_BOT });
    expect(await prisma.matchSnapshot.count({ where: { fixtureId: MATCH_BOT } })).toBe(1);
  });
});

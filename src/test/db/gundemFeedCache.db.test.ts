/* eslint-disable @typescript-eslint/no-explicit-any -- entegrasyon testinde yanıt gövdeleri gevşek şemalı */
/**
 * GERÇEK veritabanı entegrasyon testi: `GET /api/gundem/posts` — IP rate limit + oturumsuz paylaşımlı cache.
 * Prisma, kimlik doğrulama (Bearer JWT) ve route handler'ları GERÇEK. Redis istemcisi `null`'a mock'lanır → rate limit ve
 * cache süreç içi fallback'i kullanır: test akışı paylaşılan (prod) Redis'e ASLA yazılmaz, prod cache'i de teste sızmaz.
 *
 * Çalıştırma: `npm run test:db`. Tüm kullanıcılar `itest-<runId>` e-posta önekli; test sonunda silinir (Post/PostLike cascade).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/redis', () => ({ getRedisClient: () => null }));

const ENABLED = process.env.DB_INTEGRATION === '1';
const runId = `itest-${Math.random().toString(16).slice(2, 10)}`;
const d = ENABLED ? describe : describe.skip;

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;
type Captured = { status: number; body: any; headers: Record<string, string> };

// TEST-NET-3 (RFC 5737) adresleri; her senaryo kendi IP'siyle → rate limit kovaları birbirini etkilemez.
function makeReq(opts: { method: string; query?: Record<string, string>; body?: unknown; token?: string; ip?: string }): NextApiRequest {
  const ip = opts.ip ?? '203.0.113.20';
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      host: 'localhost:3000',
      'x-forwarded-for': ip,
    },
    cookies: {},
    socket: { remoteAddress: ip },
  } as unknown as NextApiRequest;
}

async function call(handler: Handler, req: NextApiRequest): Promise<Captured> {
  const out: Captured = { status: 200, body: undefined, headers: {} };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(b: unknown) {
      out.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = String(v);
      return this;
    },
    getHeader(k: string) {
      return out.headers[k.toLowerCase()];
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return out;
}

d('DB entegrasyonu — Gündem akışı GET: rate limit + oturumsuz cache', () => {
  let prisma: typeof import('@/lib/prisma').prisma;
  let postsHandler: Handler;
  let postHandler: Handler;
  let likeHandler: Handler;
  let LIMIT: number;
  type U = { id: string; token: string };
  let alice: U;
  let reader: U;

  const mkUser = async (label: string): Promise<U> => {
    const { issueMobileToken } = await import('@/lib/mobileAuth');
    const u = await prisma.user.create({
      data: { email: `${runId}-${label}@example.invalid`, name: `ITest ${label}`, role: 'USER', credits: 0 },
      select: { id: true },
    });
    return { id: u.id, token: await issueMobileToken({ sub: u.id, role: 'USER', credits: 0 }) };
  };
  const ids = (r: Captured) => r.body.items.map((i: any) => i.id) as string[];
  const getAll = (opts: { token?: string; ip?: string; cursor?: string } = {}) =>
    call(
      postsHandler,
      makeReq({ method: 'GET', query: { scope: 'all', ...(opts.cursor ? { cursor: opts.cursor } : {}) }, token: opts.token, ip: opts.ip }),
    );

  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    postsHandler = (await import('@/pages/api/gundem/posts/index')).default;
    postHandler = (await import('@/pages/api/gundem/posts/[postId]/index')).default;
    likeHandler = (await import('@/pages/api/gundem/posts/[postId]/like')).default;
    ({ FEED_GET_RATE_LIMIT: LIMIT } = await import('@/lib/gundem/feedCache'));
    alice = await mkUser('alice');
    reader = await mkUser('reader');
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: runId } } }); // Post/PostLike cascade
    const left = await prisma.user.count({ where: { email: { startsWith: runId } } });
    const leftPosts = await prisma.post.count({ where: { author: { email: { startsWith: runId } } } });
    await prisma.$disconnect();
    expect({ left, leftPosts }).toEqual({ left: 0, leftPosts: 0 }); // temizlik doğrulaması
  });

  it('rate limit: IP başına LIMIT istek geçer, fazlası 429 + Türkçe hata + Retry-After (eşzamanlı burst)', async () => {
    // Geçersiz scope → rate limit'ten sonra 400 döner, DB'ye gitmez; LIMIT+1 istek aynı anda.
    const burst = await Promise.all(
      Array.from({ length: LIMIT + 1 }, () =>
        call(postsHandler, makeReq({ method: 'GET', query: { scope: 'nope' }, ip: '203.0.113.21' })),
      ),
    );
    const limited = burst.filter((r) => r.status === 429);
    expect(burst.filter((r) => r.status === 400)).toHaveLength(LIMIT);
    expect(limited).toHaveLength(1);
    expect(limited[0].body.error).toMatch(/Çok fazla istek/);
    expect(Number(limited[0].headers['retry-after'])).toBeGreaterThan(0);

    // Başka IP etkilenmez (oturumsuz following → 401; cache'i ısıtmaz).
    expect((await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'following' }, ip: '203.0.113.22' }))).status).toBe(401);
  });

  it('oturumsuz istek: ilk MISS, ikincisi paylaşılan cache\'ten (HIT) — TTL içinde yeni post görünmez', async () => {
    const ip = '203.0.113.23';
    const first = await getAll({ ip });
    expect(first.status).toBe(200);
    expect(first.headers['x-cache']).toBe('MISS');

    await prisma.post.create({ data: { authorId: alice.id, body: 'cache sonrası post' } });
    const second = await getAll({ ip });
    expect(second.headers['x-cache']).toBe('HIT');
    expect(second.body).toEqual(first.body); // TTL kadar gecikme kabul
    expect(second.body.items.every((i: any) => i.likedByMe === false && i.author.followedByMe === false)).toBe(true);

    // Cursor'lı sayfa da cache'lenir.
    if (first.body.nextCursor) {
      expect((await getAll({ ip, cursor: first.body.nextCursor })).headers['x-cache']).toBe('MISS');
      expect((await getAll({ ip, cursor: first.body.nextCursor })).headers['x-cache']).toBe('HIT');
    }

    // following oturumsuz → 401, cache'e hiç girmez.
    const following = await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'following' }, ip }));
    expect(following.status).toBe(401);
  });

  it('oturumlu istek paylaşılan cache\'ten ASLA dönmez: yeni post, beğeni ve silme anında görünür', async () => {
    const ip = '203.0.113.24';
    // Oturumsuz cache'i ısıt.
    const anonBefore = await getAll({ ip });
    expect(['HIT', 'MISS']).toContain(anonBefore.headers['x-cache']);

    // Yeni post (uygulama üzerinden) → oturumlu okuyucu hemen görür.
    const created = await call(postsHandler, makeReq({ method: 'POST', token: alice.token, body: { body: 'taze post' }, ip }));
    expect(created.status).toBe(201);
    const postId = created.body.id as string;
    const afterCreate = await getAll({ token: reader.token, ip });
    expect(afterCreate.headers['x-cache']).toBe('BYPASS');
    expect(ids(afterCreate)).toContain(postId);
    // Oturumsuz cache hâlâ eski anlık görüntü.
    const anonStale = await getAll({ ip });
    expect(anonStale.headers['x-cache']).toBe('HIT');
    expect(ids(anonStale)).not.toContain(postId);

    // Beğeni → oturumlu okuyucuda likedByMe + sayaç hemen.
    expect((await call(likeHandler, makeReq({ method: 'POST', query: { postId }, token: reader.token, ip }))).body.liked).toBe(true);
    const afterLike = await getAll({ token: reader.token, ip });
    expect(afterLike.headers['x-cache']).toBe('BYPASS');
    const liked = afterLike.body.items.find((i: any) => i.id === postId);
    expect(liked).toMatchObject({ likedByMe: true, likes: 1 });

    // Silme → oturumlu yazar hemen görmez.
    expect((await call(postHandler, makeReq({ method: 'DELETE', query: { postId }, token: alice.token, ip }))).status).toBe(204);
    const afterDelete = await getAll({ token: alice.token, ip });
    expect(afterDelete.headers['x-cache']).toBe('BYPASS');
    expect(ids(afterDelete)).not.toContain(postId);

    // official akışı da oturumluyken bypass.
    const official = await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'official' }, token: reader.token, ip }));
    expect(official.headers['x-cache']).toBe('BYPASS');
  });
});

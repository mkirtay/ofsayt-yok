/* eslint-disable @typescript-eslint/no-explicit-any -- entegrasyon testinde yanıt gövdeleri gevşek şemalı */
/**
 * GERÇEK veritabanı entegrasyon testi (DB mock'suz): Gündem — post CRUD (sahip/admin/yabancı), authorType override,
 * beğeni toggle + bildirim, yorum CRUD + cursor, takip toggle, bildirimler, push kaydı, bot-post idempotency ve rate limit.
 * Prisma, kimlik doğrulama (Bearer JWT), route handler'ları ve rate limit GERÇEK. Resmi/bot hesabı (`official.ts`, env ile) YALNIZCA
 * bu testte bir test kullanıcısına yönlendirilir; gerçek "Ofsayt Yok" hesabına yazılmaz (sonda doğrulanır).
 *
 * Çalıştırma: `npm run test:db`. Tüm kullanıcılar `itest-<runId>` e-posta önekli; test sonunda silinir
 * (Post/PostLike/PostComment/Follow/PushToken/Notification User'a cascade bağlı).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

// Redis `null` → rate limit ve akış cache'i süreç içi fallback: anonim akış yanıtları (test resmi hesabıyla!) paylaşılan
// (prod) Redis'e yazılmaz, prod cache'i de teste sızmaz (bkz. lib/gundem/feedCache.ts).
vi.mock('@/lib/redis', () => ({ getRedisClient: () => null }));

const ENABLED = process.env.DB_INTEGRATION === '1';

// runId modül yüklenmeden önce üretilmeli: resmi/bot hesabı env'i test kullanıcısına yönlenir (official.ts env'i çağrı anında okur).
const h = vi.hoisted(() => ({ runId: `itest-${Math.random().toString(16).slice(2, 10)}` }));

process.env.OFFICIAL_ACCOUNT_EMAILS = `${h.runId}-official@example.invalid`;
process.env.GUNDEM_BOT_EMAIL = `${h.runId}-official@example.invalid`;

const d = ENABLED ? describe : describe.skip;

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;
type Captured = { status: number; body: any; headers: Record<string, string> };

function makeReq(opts: {
  method: string;
  query?: Record<string, string>;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}): NextApiRequest {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      host: 'localhost:3000',
      'x-forwarded-for': '203.0.113.7',
      ...(opts.headers ?? {}),
    },
    cookies: {}, // token'sız isteklerde next-auth cookie oturumuna düşer
    socket: { remoteAddress: '203.0.113.7' },
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

/**
 * 31 isteği EŞZAMANLI yollar (uzak DB'de sıralı 31 istek sabit 60 sn'lik pencere sınırını aşabilir → flaky).
 * Pencere tam bu aralıkta dönmüşse (429 yok) bir kez daha dener.
 */
async function burst31(fn: () => Promise<Captured>): Promise<number[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const statuses = (await Promise.all(Array.from({ length: 31 }, fn))).map((r) => r.status);
    if (statuses.includes(429)) return statuses;
  }
  return [];
}

d('DB entegrasyonu — Gündem (post, beğeni, yorum, takip, bildirim, push, bot)', () => {
  const runId = h.runId;

  let prisma: typeof import('@/lib/prisma').prisma;
  type U = { id: string; token: string };
  let alice: U; // post sahibi
  let bob: U; // yabancı
  let admin: U; // DB'de ADMIN
  let fakeAdmin: U; // JWT'de ADMIN iddiası, DB'de USER
  let staleAdmin: U; // JWT'de USER, DB'de ADMIN (rol DB'den taze okunmalı)
  let official: U; // test bot hesabı (env ile resmi hesap)
  let realOfficialPostsBefore = 0;
  let realOfficialId: string | null = null;

  let postsHandler: Handler;
  let postHandler: Handler;
  let likeHandler: Handler;
  let commentsHandler: Handler;
  let commentHandler: Handler;
  let followHandler: Handler;
  let userPostsHandler: Handler;
  let userProfileHandler: Handler;
  let notificationsHandler: Handler;
  let unreadHandler: Handler;
  let pushHandler: Handler;
  let botHandler: Handler;

  const mkUser = async (label: string, role: 'USER' | 'ADMIN' = 'USER', tokenRole: 'USER' | 'ADMIN' = role): Promise<U> => {
    const { issueMobileToken } = await import('@/lib/mobileAuth');
    const u = await prisma.user.create({
      data: { email: `${runId}-${label}@example.invalid`, name: `ITest ${label}`, role, credits: 0 },
      select: { id: true },
    });
    return { id: u.id, token: await issueMobileToken({ sub: u.id, role: tokenRole, credits: 0 }) };
  };
  const mkPost = (authorId: string, body = 'itest gönderi', extra: Record<string, unknown> = {}) =>
    prisma.post.create({ data: { authorId, body, ...extra }, select: { id: true } });

  beforeAll(async () => {
    process.env.CRON_SECRET = `${runId}-cron-secret`;
    ({ prisma } = await import('@/lib/prisma'));
    postsHandler = (await import('@/pages/api/gundem/posts/index')).default;
    postHandler = (await import('@/pages/api/gundem/posts/[postId]/index')).default;
    likeHandler = (await import('@/pages/api/gundem/posts/[postId]/like')).default;
    commentsHandler = (await import('@/pages/api/gundem/posts/[postId]/comments')).default;
    commentHandler = (await import('@/pages/api/gundem/posts/[postId]/comments/[commentId]')).default;
    followHandler = (await import('@/pages/api/gundem/users/[userId]/follow')).default;
    userPostsHandler = (await import('@/pages/api/gundem/users/[userId]/posts')).default;
    userProfileHandler = (await import('@/pages/api/gundem/users/[userId]/index')).default;
    notificationsHandler = (await import('@/pages/api/gundem/notifications/index')).default;
    unreadHandler = (await import('@/pages/api/gundem/notifications/unread-count')).default;
    pushHandler = (await import('@/pages/api/push/register')).default;
    botHandler = (await import('@/pages/api/admin/gundem/bot-post')).default;

    alice = await mkUser('alice');
    bob = await mkUser('bob');
    admin = await mkUser('admin', 'ADMIN');
    fakeAdmin = await mkUser('fakeadmin', 'USER', 'ADMIN');
    staleAdmin = await mkUser('staleadmin', 'ADMIN', 'USER');
    official = await mkUser('official');

    // Gerçek resmi hesap (varsa) — testin ona yazmadığını sonda doğrulamak için sayaç.
    const real = await prisma.user.findUnique({ where: { email: 'bilgi.ofsaytyok@gmail.com' }, select: { id: true } });
    realOfficialId = real?.id ?? null;
    if (realOfficialId) realOfficialPostsBefore = await prisma.post.count({ where: { authorId: realOfficialId } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email: { startsWith: runId } } }); // Gündem tabloları cascade
    const left = await prisma.user.count({ where: { email: { startsWith: runId } } });
    const leftPosts = await prisma.post.count({ where: { author: { email: { startsWith: runId } } } });
    const realAfter = realOfficialId ? await prisma.post.count({ where: { authorId: realOfficialId } }) : 0;
    await prisma.$disconnect();
    expect({ left, leftPosts }).toEqual({ left: 0, leftPosts: 0 }); // temizlik doğrulaması
    expect(realAfter).toBe(realOfficialPostsBefore); // gerçek resmi hesaba dokunulmadı
  });

  // ── Post oluşturma / doğrulama / authorType ────────────────────────────────────────────────
  describe('post oluşturma', () => {
    it('kimliksiz istek 401', async () => {
      const r = await call(postsHandler, makeReq({ method: 'POST', body: { body: 'merhaba' } }));
      expect(r.status).toBe(401);
      expect(r.body.error).toBeTruthy();
    });

    it('authorType/authorId istemciden kabul edilmez: her zaman USER ve oturum sahibi', async () => {
      const r = await call(
        postsHandler,
        makeReq({
          method: 'POST',
          token: alice.token,
          body: { body: '  <b>Merhaba</b> gündem  ', authorType: 'OFFICIAL_BOT', authorId: bob.id, externalKey: 'x' },
        }),
      );
      expect(r.status).toBe(201);
      expect(r.body.authorType).toBe('USER');
      expect(r.body.body).toBe('Merhaba gündem'); // sanitizePlainText: etiket temizlendi + trim
      expect(r.body.author.id).toBe(alice.id);
      const row = await prisma.post.findUnique({ where: { id: r.body.id } });
      expect(row).toMatchObject({ authorType: 'USER', authorId: alice.id, externalKey: null });
    });

    it('boş ve 280+ karakter gövde 400', async () => {
      // NOT: alice bu describe'da 5/dk sınırının içinde kalır (1 + 2 = 3 istek).
      const empty = await call(postsHandler, makeReq({ method: 'POST', token: alice.token, body: { body: '   ' } }));
      const long = await call(postsHandler, makeReq({ method: 'POST', token: alice.token, body: { body: 'a'.repeat(281) } }));
      expect(empty.status).toBe(400);
      expect(long.status).toBe(400);
      const ok = await call(postsHandler, makeReq({ method: 'POST', token: alice.token, body: { body: 'a'.repeat(280) } }));
      expect(ok.status).toBe(201);
    });

    it('rate limit: dakikada 5 gönderi, 6.sı 429 + Retry-After', async () => {
      const u = await mkUser('rl-post');
      const statuses: number[] = [];
      let last: Captured | undefined;
      for (let i = 0; i < 6; i++) {
        last = await call(postsHandler, makeReq({ method: 'POST', token: u.token, body: { body: `rl ${i}` } }));
        statuses.push(last.status);
      }
      expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
      expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // ── Silme: sahip / admin / yabancı ─────────────────────────────────────────────────────────
  describe('post silme (soft delete)', () => {
    it('yabancı 403, kimliksiz 401; sahip 204 → deletedAt + deletedByUserId; sonra GET 404', async () => {
      const p = await mkPost(alice.id);
      expect((await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p.id } }))).status).toBe(401);
      const stranger = await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p.id }, token: bob.token }));
      expect(stranger.status).toBe(403);
      expect((await prisma.post.findUnique({ where: { id: p.id } }))?.deletedAt).toBeNull();

      const owner = await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p.id }, token: alice.token }));
      expect(owner.status).toBe(204);
      expect(await prisma.post.findUnique({ where: { id: p.id } })).toMatchObject({ deletedByUserId: alice.id });
      expect((await prisma.post.findUnique({ where: { id: p.id } }))?.deletedAt).not.toBeNull();

      expect((await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id } }))).status).toBe(404);
      expect((await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p.id }, token: alice.token }))).status).toBe(404);
    });

    it('ADMIN başkasının postunu silebilir', async () => {
      const p = await mkPost(alice.id);
      const r = await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p.id }, token: admin.token }));
      expect(r.status).toBe(204);
      expect(await prisma.post.findUnique({ where: { id: p.id } })).toMatchObject({ deletedByUserId: admin.id });
    });

    it('rol DB’den taze okunur: JWT’de ADMIN ama DB’de USER → 403; JWT’de USER ama DB’de ADMIN → 204', async () => {
      const p1 = await mkPost(alice.id);
      const fake = await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p1.id }, token: fakeAdmin.token }));
      expect(fake.status).toBe(403);

      const p2 = await mkPost(alice.id);
      const stale = await call(postHandler, makeReq({ method: 'DELETE', query: { postId: p2.id }, token: staleAdmin.token }));
      expect(stale.status).toBe(204);
    });

    it('silinmiş post feed’de ve profil akışında görünmez', async () => {
      const u = await mkUser('feedowner');
      const keep = await mkPost(u.id, 'kalan');
      const gone = await mkPost(u.id, 'silinen', { deletedAt: new Date(), deletedByUserId: u.id });
      const r = await call(userPostsHandler, makeReq({ method: 'GET', query: { userId: u.id } }));
      expect(r.status).toBe(200);
      const ids = r.body.items.map((i: any) => i.id);
      expect(ids).toContain(keep.id);
      expect(ids).not.toContain(gone.id);
    });
  });

  // ── Feed kapsamları ────────────────────────────────────────────────────────────────────────
  describe('feed', () => {
    it('geçersiz scope 400; following kimliksiz 401', async () => {
      expect((await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'nope' } }))).status).toBe(400);
      expect((await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'following' } }))).status).toBe(401);
    });

    it('following: yalnızca takip edilenler + cursor sayfalama (20 + 5)', async () => {
      const reader = await mkUser('reader');
      const writer = await mkUser('writer');
      const other = await mkUser('other');
      await prisma.follow.create({ data: { followerId: reader.id, followingId: writer.id } });
      await prisma.post.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          authorId: writer.id,
          body: `w${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        })),
      });
      await mkPost(other.id, 'takip edilmiyor');

      const p1 = await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'following' }, token: reader.token }));
      expect(p1.status).toBe(200);
      expect(p1.body.items).toHaveLength(20);
      expect(p1.body.nextCursor).toBeTruthy();
      expect(p1.body.items.every((i: any) => i.author.id === writer.id)).toBe(true);
      const p2 = await call(
        postsHandler,
        makeReq({ method: 'GET', query: { scope: 'following', cursor: p1.body.nextCursor }, token: reader.token }),
      );
      expect(p2.body.items).toHaveLength(5);
      expect(p2.body.nextCursor).toBeNull();
      const all = [...p1.body.items, ...p2.body.items].map((i: any) => i.id);
      expect(new Set(all).size).toBe(25);
    });

    it('official: yalnızca OFFICIAL_BOT gönderileri', async () => {
      const bot = await mkPost(official.id, 'resmi', { authorType: 'OFFICIAL_BOT' });
      const user = await mkPost(alice.id, 'kullanıcı');
      const r = await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'official' } }));
      expect(r.status).toBe(200);
      expect(r.body.items.every((i: any) => i.authorType === 'OFFICIAL_BOT')).toBe(true);
      const ids = r.body.items.map((i: any) => i.id);
      expect(ids).toContain(bot.id);
      expect(ids).not.toContain(user.id);
    });
  });

  // ── Beğeni toggle + bildirim ───────────────────────────────────────────────────────────────
  describe('beğeni', () => {
    it('toggle → { liked, likes }; bildirim yalnızca başkasında ve tekrarlanmaz; kendi postu bildirim üretmez', async () => {
      const p = await mkPost(alice.id);
      const like1 = await call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: bob.token }));
      expect(like1.status).toBe(200);
      expect(like1.body).toEqual({ liked: true, likes: 1 });
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: bob.id, type: 'POST_LIKE', postId: p.id } })).toBe(1);

      const unlike = await call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: bob.token }));
      expect(unlike.body).toEqual({ liked: false, likes: 0 });
      const relike = await call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: bob.token }));
      expect(relike.body).toEqual({ liked: true, likes: 1 });
      // dedupe: beğen/geri al/beğen bildirimi çoğaltmaz
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: bob.id, type: 'POST_LIKE', postId: p.id } })).toBe(1);

      const own = await call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: alice.token }));
      expect(own.body).toEqual({ liked: true, likes: 2 });
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: alice.id } })).toBe(0);
    });

    it('kimliksiz 401, olmayan/silinmiş post 404', async () => {
      const p = await mkPost(alice.id);
      expect((await call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id } }))).status).toBe(401);
      expect((await call(likeHandler, makeReq({ method: 'POST', query: { postId: `${runId}-yok` }, token: bob.token }))).status).toBe(404);
      const gone = await mkPost(alice.id, 'x', { deletedAt: new Date() });
      expect((await call(likeHandler, makeReq({ method: 'POST', query: { postId: gone.id }, token: bob.token }))).status).toBe(404);
    });

    it('rate limit: dakikada 30 işlem, 31.si 429', async () => {
      const u = await mkUser('rl-like');
      const p = await mkPost(alice.id);
      const statuses = await burst31(() => call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: u.token })));
      expect(statuses.filter((x) => x === 200)).toHaveLength(30);
      expect(statuses.filter((x) => x === 429)).toHaveLength(1);
    });
  });

  // ── Yorum CRUD ─────────────────────────────────────────────────────────────────────────────
  describe('yorumlar', () => {
    it('oluştur (201) + POST_COMMENT bildirimi; kendi postuna yorum bildirim üretmez; 280+ ve boş 400', async () => {
      const p = await mkPost(alice.id);
      const r = await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: bob.token, body: { body: ' güzel ' } }));
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ body: 'güzel', postId: p.id, user: { id: bob.id } });
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: bob.id, type: 'POST_COMMENT', postId: p.id } })).toBe(1);

      const own = await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: alice.token, body: { body: 'teşekkürler' } }));
      expect(own.status).toBe(201);
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: alice.id } })).toBe(0);

      expect((await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: bob.token, body: { body: '' } }))).status).toBe(400);
      expect((await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: bob.token, body: { body: 'a'.repeat(281) } }))).status).toBe(400);
      expect((await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, body: { body: 'x' } }))).status).toBe(401);
      expect((await call(commentsHandler, makeReq({ method: 'POST', query: { postId: `${runId}-yok` }, token: bob.token, body: { body: 'x' } }))).status).toBe(404);
    });

    it('GET cursor sayfalama (20 + 5) ve yorum sayacı feed’de görünür', async () => {
      const p = await mkPost(alice.id);
      await prisma.postComment.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({ postId: p.id, userId: bob.id, body: `c${i}`, createdAt: new Date(Date.now() - i * 1000) })),
      });
      const p1 = await call(commentsHandler, makeReq({ method: 'GET', query: { postId: p.id } }));
      expect(p1.body.items).toHaveLength(20);
      const p2 = await call(commentsHandler, makeReq({ method: 'GET', query: { postId: p.id, cursor: p1.body.nextCursor } }));
      expect(p2.body.items).toHaveLength(5);
      expect(p2.body.nextCursor).toBeNull();
      const single = await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id } }));
      expect(single.body.comments).toBe(25);
    });

    it('silme: yabancı 403, sahip 204, ADMIN 204; silinen listede ve sayaçta yok; yanlış post 404', async () => {
      const p = await mkPost(alice.id);
      const other = await mkPost(alice.id);
      const mk = () => prisma.postComment.create({ data: { postId: p.id, userId: bob.id, body: 'yorum' }, select: { id: true } });
      const c1 = await mk();
      const c2 = await mk();
      const del = (commentId: string, token?: string, postId = p.id) =>
        call(commentHandler, makeReq({ method: 'DELETE', query: { postId, commentId }, token }));

      expect((await del(c1.id)).status).toBe(401);
      expect((await del(c1.id, alice.token)).status).toBe(403); // post sahibi ≠ yorum sahibi
      expect((await del(c1.id, bob.token, other.id)).status).toBe(404); // yorum başka posta ait
      expect((await del(c1.id, bob.token)).status).toBe(204);
      expect(await prisma.postComment.findUnique({ where: { id: c1.id } })).toMatchObject({ deletedByUserId: bob.id });
      expect((await del(c1.id, bob.token)).status).toBe(404);
      expect((await del(c2.id, admin.token)).status).toBe(204);
      expect(await prisma.postComment.findUnique({ where: { id: c2.id } })).toMatchObject({ deletedByUserId: admin.id });

      const list = await call(commentsHandler, makeReq({ method: 'GET', query: { postId: p.id } }));
      expect(list.body.items).toHaveLength(0);
      expect((await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id } }))).body.comments).toBe(0);
    });

    it('rate limit: dakikada 5 yorum, 6.sı 429', async () => {
      const u = await mkUser('rl-comment');
      const p = await mkPost(alice.id);
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: u.token, body: { body: `c${i}` } }))).status);
      }
      expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    });
  });

  // ── Takip ──────────────────────────────────────────────────────────────────────────────────
  describe('takip', () => {
    it('toggle → { following, followers } + FOLLOW bildirimi (tekrarlanmaz); kendini takip 400', async () => {
      const f = await mkUser('follower');
      const on = await call(followHandler, makeReq({ method: 'POST', query: { userId: alice.id }, token: f.token }));
      expect(on.body).toEqual({ following: true, followers: 1 });
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: f.id, type: 'FOLLOW' } })).toBe(1);
      const off = await call(followHandler, makeReq({ method: 'POST', query: { userId: alice.id }, token: f.token }));
      expect(off.body).toEqual({ following: false, followers: 0 });
      await call(followHandler, makeReq({ method: 'POST', query: { userId: alice.id }, token: f.token }));
      expect(await prisma.notification.count({ where: { userId: alice.id, actorId: f.id, type: 'FOLLOW' } })).toBe(1);

      const self = await call(followHandler, makeReq({ method: 'POST', query: { userId: f.id }, token: f.token }));
      expect(self.status).toBe(400);
      expect(await prisma.follow.count({ where: { followerId: f.id, followingId: f.id } })).toBe(0);
    });

    it('kimliksiz 401, olmayan kullanıcı 404', async () => {
      expect((await call(followHandler, makeReq({ method: 'POST', query: { userId: alice.id } }))).status).toBe(401);
      expect((await call(followHandler, makeReq({ method: 'POST', query: { userId: `${runId}-yok` }, token: bob.token }))).status).toBe(404);
    });

    it('rate limit: dakikada 30 işlem, 31.si 429', async () => {
      const u = await mkUser('rl-follow');
      const statuses = await burst31(() => call(followHandler, makeReq({ method: 'POST', query: { userId: alice.id }, token: u.token })));
      expect(statuses.filter((x) => x === 200)).toHaveLength(30);
      expect(statuses.filter((x) => x === 429)).toHaveLength(1);
    });
  });

  // ── Bildirimler ────────────────────────────────────────────────────────────────────────────
  describe('bildirimler', () => {
    it('liste + okunmamış sayısı + okundu işaretle (ids ve hepsi)', async () => {
      const owner = await mkUser('notif-owner');
      const actor = await mkUser('notif-actor');
      const p = await mkPost(owner.id, 'bildirimli');
      await call(likeHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: actor.token }));
      await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: actor.token, body: { body: 'selam' } }));
      await call(followHandler, makeReq({ method: 'POST', query: { userId: owner.id }, token: actor.token }));

      expect((await call(unreadHandler, makeReq({ method: 'GET' }))).status).toBe(401);
      expect((await call(unreadHandler, makeReq({ method: 'GET', token: owner.token }))).body).toEqual({ count: 3 });

      const list = await call(notificationsHandler, makeReq({ method: 'GET', token: owner.token }));
      expect(list.status).toBe(200);
      expect(list.body.items.map((n: any) => n.type).sort()).toEqual(['FOLLOW', 'POST_COMMENT', 'POST_LIKE']);
      expect(list.body.items[0].actor.id).toBe(actor.id);
      const likeN = list.body.items.find((n: any) => n.type === 'POST_LIKE');
      expect(likeN.post).toEqual({ id: p.id, body: 'bildirimli' });

      const some = await call(notificationsHandler, makeReq({ method: 'POST', token: owner.token, body: { ids: [likeN.id] } }));
      expect(some.body).toEqual({ updated: 1 });
      expect((await call(unreadHandler, makeReq({ method: 'GET', token: owner.token }))).body).toEqual({ count: 2 });

      // başkasının bildirimini işaretleyemez
      const foreign = await call(notificationsHandler, makeReq({ method: 'POST', token: actor.token, body: { ids: [likeN.id] } }));
      expect(foreign.body).toEqual({ updated: 0 });

      const all = await call(notificationsHandler, makeReq({ method: 'POST', token: owner.token, body: {} }));
      expect(all.body).toEqual({ updated: 2 });
      expect((await call(unreadHandler, makeReq({ method: 'GET', token: owner.token }))).body).toEqual({ count: 0 });
      expect((await call(notificationsHandler, makeReq({ method: 'POST', token: owner.token, body: { ids: 'x' } }))).status).toBe(400);
    });
  });

  // ── Push token kaydı ───────────────────────────────────────────────────────────────────────
  describe('push kaydı', () => {
    it('kayıt (upsert), platform doğrulama, başka kullanıcıya devir, silme', async () => {
      const u1 = await mkUser('push1');
      const u2 = await mkUser('push2');
      const token = `${runId}-ExponentPushToken[abc]`;

      expect((await call(pushHandler, makeReq({ method: 'POST', body: { token, platform: 'ios' } }))).status).toBe(401);
      expect((await call(pushHandler, makeReq({ method: 'POST', token: u1.token, body: { token, platform: 'symbian' } }))).status).toBe(400);
      expect((await call(pushHandler, makeReq({ method: 'POST', token: u1.token, body: { platform: 'ios' } }))).status).toBe(400);

      expect((await call(pushHandler, makeReq({ method: 'POST', token: u1.token, body: { token, platform: 'ios' } }))).status).toBe(204);
      expect(await prisma.pushToken.findUnique({ where: { token } })).toMatchObject({ userId: u1.id, platform: 'ios', disabledAt: null });

      await prisma.pushToken.update({ where: { token }, data: { disabledAt: new Date() } });
      expect((await call(pushHandler, makeReq({ method: 'POST', token: u2.token, body: { token, platform: 'android' } }))).status).toBe(204);
      expect(await prisma.pushToken.findUnique({ where: { token } })).toMatchObject({ userId: u2.id, platform: 'android', disabledAt: null });
      expect(await prisma.pushToken.count({ where: { token } })).toBe(1);

      // başkasının token'ını silemez
      await call(pushHandler, makeReq({ method: 'DELETE', token: u1.token, body: { token } }));
      expect(await prisma.pushToken.count({ where: { token } })).toBe(1);
      expect((await call(pushHandler, makeReq({ method: 'DELETE', token: u2.token, body: { token } }))).status).toBe(204);
      expect(await prisma.pushToken.count({ where: { token } })).toBe(0);
    });

    it('rate limit: dakikada 10 istek, 11.si 429', async () => {
      const u = await mkUser('rl-push');
      for (let i = 0; i < 10; i++) {
        const r = await call(pushHandler, makeReq({ method: 'POST', token: u.token, body: { token: `${runId}-rl-${i}`, platform: 'web' } }));
        expect(r.status).toBe(204);
      }
      expect((await call(pushHandler, makeReq({ method: 'POST', token: u.token, body: { token: `${runId}-rl-x`, platform: 'web' } }))).status).toBe(429);
    });
  });

  // ── Bot post (resmi hesap simülasyonu: test kullanıcısı) ─────────────────────────────────
  describe('bot-post', () => {
    const cron = () => ({ authorization: `Bearer ${process.env.CRON_SECRET}` });

    it('yetkisiz 401, ADMIN olmayan 403, yanlış cron secret reddedilir', async () => {
      expect((await call(botHandler, makeReq({ method: 'POST', body: { body: 'x' } }))).status).toBe(401);
      expect((await call(botHandler, makeReq({ method: 'POST', token: bob.token, body: { body: 'x' } }))).status).toBe(403);
      expect((await call(botHandler, makeReq({ method: 'POST', body: { body: 'x' }, headers: { authorization: 'Bearer yanlis' } }))).status).toBe(401);
      expect((await call(botHandler, makeReq({ method: 'GET' }))).status).toBe(405);
    });

    it('cron ile OFFICIAL_BOT post; aynı externalKey idempotent (hata değil, mevcut kayıt)', async () => {
      const key = `${runId}:goal:1`;
      const first = await call(botHandler, makeReq({ method: 'POST', headers: cron(), body: { body: 'GOL! 1-0', externalKey: key, matchId: 'm1', teamId: 5 } }));
      expect(first.status).toBe(201);
      expect(first.body.created).toBe(true);
      expect(first.body.post).toMatchObject({ authorType: 'OFFICIAL_BOT', body: 'GOL! 1-0', matchId: 'm1', teamId: 5 });
      expect(first.body.post.author.id).toBe(official.id);

      const again = await call(botHandler, makeReq({ method: 'POST', headers: cron(), body: { body: 'FARKLI METİN', externalKey: key } }));
      expect(again.status).toBe(200);
      expect(again.body.created).toBe(false);
      expect(again.body.post.id).toBe(first.body.post.id);
      expect(again.body.post.body).toBe('GOL! 1-0');
      expect(await prisma.post.count({ where: { externalKey: key } })).toBe(1);
    });

    it('ADMIN oturumuyla çalışır; 280+ karakter 400', async () => {
      const ok = await call(botHandler, makeReq({ method: 'POST', token: admin.token, body: { body: 'admin duyuru', externalKey: `${runId}:admin:1` } }));
      expect(ok.status).toBe(201);
      const long = await call(botHandler, makeReq({ method: 'POST', headers: cron(), body: { body: 'a'.repeat(281) } }));
      expect(long.status).toBe(400);
    });
  });
  // ── Faz B.1: author.followedByMe / sayaçlar ────────────────────────────────────────────────
  describe('author alanı: followedByMe, followerCount, followingCount', () => {
    it('post GET: takip eden görür true; oturumsuz ve kendi postunda false; sayaçlar Follow _count', async () => {
      const writer = await mkUser('fb-writer');
      const fan = await mkUser('fb-fan');
      const third = await mkUser('fb-third');
      const other = await mkUser('fb-other');
      const p = await mkPost(writer.id, 'takip testi');
      await prisma.follow.createMany({
        data: [
          { followerId: fan.id, followingId: writer.id },
          { followerId: third.id, followingId: writer.id },
          { followerId: writer.id, followingId: other.id },
        ],
      });

      const asFan = await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id }, token: fan.token }));
      expect(asFan.body.author).toMatchObject({ id: writer.id, followedByMe: true, followerCount: 2, followingCount: 1 });

      const asOther = await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id }, token: other.token }));
      expect(asOther.body.author).toMatchObject({ followedByMe: false, followerCount: 2, followingCount: 1 });

      const anon = await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id } }));
      expect(anon.body.author).toMatchObject({ followedByMe: false, followerCount: 2, followingCount: 1 });

      const own = await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id }, token: writer.token }));
      expect(own.body.author.followedByMe).toBe(false); // kendi postu: anlamsız ama hata değil
    });

    it('feed (scope=following) ve profil akışı (users/[id]/posts) aynı alanları taşır', async () => {
      const writer = await mkUser('fb2-writer');
      const fan = await mkUser('fb2-fan');
      await prisma.follow.create({ data: { followerId: fan.id, followingId: writer.id } });
      const p = await mkPost(writer.id, 'akış');

      const feed = await call(postsHandler, makeReq({ method: 'GET', query: { scope: 'following' }, token: fan.token }));
      const inFeed = feed.body.items.find((i: any) => i.id === p.id);
      expect(inFeed.author).toMatchObject({ followedByMe: true, followerCount: 1, followingCount: 0 });

      const profile = await call(userPostsHandler, makeReq({ method: 'GET', query: { userId: writer.id }, token: fan.token }));
      expect(profile.body.items[0].author).toMatchObject({ followedByMe: true, followerCount: 1 });
      const profileAnon = await call(userPostsHandler, makeReq({ method: 'GET', query: { userId: writer.id } }));
      expect(profileAnon.body.items[0].author.followedByMe).toBe(false);
    });

    it('takip toggle sonrası alan güncellenir; yeni post yanıtında yazarın sayaçları vardır', async () => {
      const writer = await mkUser('fb3-writer');
      const fan = await mkUser('fb3-fan');
      const p = await mkPost(writer.id);
      await call(followHandler, makeReq({ method: 'POST', query: { userId: writer.id }, token: fan.token }));
      expect((await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id }, token: fan.token }))).body.author.followedByMe).toBe(true);
      await call(followHandler, makeReq({ method: 'POST', query: { userId: writer.id }, token: fan.token }));
      expect((await call(postHandler, makeReq({ method: 'GET', query: { postId: p.id }, token: fan.token }))).body.author).toMatchObject({ followedByMe: false, followerCount: 0 });

      const created = await call(postsHandler, makeReq({ method: 'POST', token: writer.token, body: { body: 'yeni' } }));
      expect(created.status).toBe(201);
      expect(created.body.author).toMatchObject({ id: writer.id, followedByMe: false, followerCount: 0, followingCount: 0 });
    });
  });

  // ── Faz B.2: profil endpoint'i (users/[userId]) ────────────────────────────────────────────
  describe('profil: GET /api/gundem/users/[userId]', () => {
    it('sıfır post\'lu kullanıcı: 200, postCount 0, sayaçlar; oturumsuz followedByMe false', async () => {
      const u = await mkUser('pr-empty');
      const r = await call(userProfileHandler, makeReq({ method: 'GET', query: { userId: u.id } }));
      expect(r.status).toBe(200);
      expect(r.body.user).toMatchObject({ id: u.id, followedByMe: false, followerCount: 0, followingCount: 0, postCount: 0, official: false });
      expect(r.body.user.email).toBeUndefined(); // e-posta sızmaz
    });

    it('followedByMe: takip eden true; yabancı ve kendi profili false; sayaçlar + silinmiş post sayılmaz', async () => {
      const target = await mkUser('pr-target');
      const fan = await mkUser('pr-fan');
      const stranger = await mkUser('pr-stranger');
      await prisma.follow.create({ data: { followerId: fan.id, followingId: target.id } });
      await prisma.follow.create({ data: { followerId: target.id, followingId: stranger.id } });
      await mkPost(target.id, 'bir');
      await mkPost(target.id, 'iki');
      await mkPost(target.id, 'silinmiş', { deletedAt: new Date() });

      const asFan = await call(userProfileHandler, makeReq({ method: 'GET', query: { userId: target.id }, token: fan.token }));
      expect(asFan.body.user).toMatchObject({ followedByMe: true, followerCount: 1, followingCount: 1, postCount: 2 });
      const asStranger = await call(userProfileHandler, makeReq({ method: 'GET', query: { userId: target.id }, token: stranger.token }));
      expect(asStranger.body.user.followedByMe).toBe(false);
      const own = await call(userProfileHandler, makeReq({ method: 'GET', query: { userId: target.id }, token: target.token }));
      expect(own.body.user.followedByMe).toBe(false);
    });

    it('resmi hesap official: true (e-posta yine sızmaz)', async () => {
      const r = await call(userProfileHandler, makeReq({ method: 'GET', query: { userId: official.id } }));
      expect(r.body.user.official).toBe(true);
      expect(JSON.stringify(r.body)).not.toContain('example.invalid');
    });

    it('bilinmeyen kullanıcı 404; POST 405', async () => {
      expect((await call(userProfileHandler, makeReq({ method: 'GET', query: { userId: `${runId}-yok` } }))).status).toBe(404);
      expect((await call(userProfileHandler, makeReq({ method: 'POST', query: { userId: alice.id }, token: alice.token }))).status).toBe(405);
    });
  });

  // ── Faz B.1: satır sonu (\n) davranışı ─────────────────────────────────────────────────────
  describe('satır sonu: Gündem gövdesi \\n korur, ardışık 3+ boş satır 2\'ye iner', () => {
    it('post: CRLF → \\n, tab silinir, 3+ boş satır 2\'ye iner; DB\'de ve yanıtta aynı', async () => {
      const u = await mkUser('nl-post');
      const r = await call(postsHandler, makeReq({ method: 'POST', token: u.token, body: { body: 'satır1\r\nsatır2\n\n\n\n\nsatır\t3' } }));
      expect(r.status).toBe(201);
      expect(r.body.body).toBe('satır1\nsatır2\n\nsatır3');
      expect((await prisma.post.findUnique({ where: { id: r.body.id } }))?.body).toBe('satır1\nsatır2\n\nsatır3');
      // GET aynı metni döndürür (kart pre-wrap ile render eder)
      expect((await call(postHandler, makeReq({ method: 'GET', query: { postId: r.body.id } }))).body.body).toBe('satır1\nsatır2\n\nsatır3');
    });

    it('yorum aynı davranışta; yalnızca satır sonu olan gövde 400', async () => {
      const u = await mkUser('nl-comment');
      const p = await mkPost(alice.id);
      const ok = await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: u.token, body: { body: 'a\n\n\nb' } }));
      expect(ok.status).toBe(201);
      expect(ok.body.body).toBe('a\n\nb');
      const empty = await call(commentsHandler, makeReq({ method: 'POST', query: { postId: p.id }, token: u.token, body: { body: '\n \n\n' } }));
      expect(empty.status).toBe(400);
    });

    it('280 sınırı satır sonlarını da sayar (280 → 201, 281 → 400)', async () => {
      const u = await mkUser('nl-limit');
      const at = 'a\n'.repeat(139) + 'ab'; // 139*2 + 2 = 280
      expect(at.length).toBe(280);
      const ok = await call(postsHandler, makeReq({ method: 'POST', token: u.token, body: { body: at } }));
      expect(ok.status).toBe(201);
      const over = await call(postsHandler, makeReq({ method: 'POST', token: u.token, body: { body: `${at}c` } }));
      expect(over.status).toBe(400);
    });

    it('bot-post da satır sonlarını korur', async () => {
      const r = await call(botHandler, makeReq({ method: 'POST', headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, body: { body: 'GOL!\nİlk yarı', externalKey: `${runId}:nl:1` } }));
      expect(r.status).toBe(201);
      expect(r.body.post.body).toBe('GOL!\nİlk yarı');
    });
  });
});

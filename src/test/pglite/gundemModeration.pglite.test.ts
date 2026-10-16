/* eslint-disable @typescript-eslint/no-explicit-any -- sahte req/res gevşek tipli */
/**
 * Gündem moderasyonu — GERÇEK SQL motoru (PGlite, bellek içi; ağdaki hiçbir DB'ye bağlanılmaz) + gerçek Prisma şeması +
 * gerçek uç işleyicileri, mobil Bearer belirteciyle (web ve mobil aynı uçlar). Kapsam: içerik filtresi ve spam, şikâyet
 * ve eşikle gizleme, engelleme ve akış gizleme, @etiket + bildirim, yönetici yetkisi ve işlemleri, hesap silme uyumu.
 * Redis bellek içi sahte; hız sınırı açık (ayrı testli); e-posta gönderimi sahte.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

const redisState = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock('@/lib/redis', () => ({
  getRedisClient: () => null,
  withRedis: async (fn: (r: unknown) => Promise<unknown>) =>
    fn({
      get: async (k: string) => (redisState.store.has(k) ? redisState.store.get(k) : null),
      set: async (k: string, v: unknown) => {
        redisState.store.set(k, v);
        return 'OK';
      },
      del: async (k: string) => (redisState.store.delete(k) ? 1 : 0),
    }),
}));
// Oturumsuz akışın paylaşılan önbelleği bu dosyanın konusu değil (src/test/api/gundemPostsFeed.test.ts).
vi.mock('@/lib/livescoreCache', () => ({ readCache: async () => null, writeCache: async () => undefined }));
const rl = vi.hoisted(() => ({ allow: true }));
vi.mock('@/lib/rateLimit', () => ({
  hitFixedWindowRateLimit: async () => ({ success: rl.allow, remaining: 0, resetAt: Date.now() + 1000 }),
  requestIp: () => '203.0.113.7',
}));
const mail = vi.hoisted(() => ({ sent: [] as string[] }));
vi.mock('@/lib/security', async (orig) => ({
  ...(await orig<typeof import('@/lib/security')>()),
  sendModerationAlertEmail: async (to: string) => {
    mail.sent.push(to);
    return true;
  },
  sendAccountDeletedEmail: async () => true,
}));

type Handler = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>;
let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let issueMobileToken: typeof import('@/lib/mobileAuth').issueMobileToken;
let deleteOwnAccount: typeof import('@/server/account/deleteAccount').deleteOwnAccount;
let h: Record<string, Handler>;

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  process.env.AUTH_SECRET = 'itest-secret-gundem-moderation';
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  ({ issueMobileToken } = await import('@/lib/mobileAuth'));
  ({ deleteOwnAccount } = await import('@/server/account/deleteAccount'));
  const load = async (p: string) => (await import(p)).default as Handler;
  h = {
    posts: await load('@/pages/api/gundem/posts/index'),
    post: await load('@/pages/api/gundem/posts/[postId]/index'),
    comments: await load('@/pages/api/gundem/posts/[postId]/comments'),
    reports: await load('@/pages/api/gundem/reports'),
    block: await load('@/pages/api/gundem/users/[userId]/block'),
    blocks: await load('@/pages/api/gundem/blocks'),
    profile: await load('@/pages/api/gundem/users/[userId]/index'),
    userPosts: await load('@/pages/api/gundem/users/[userId]/posts'),
    follow: await load('@/pages/api/gundem/users/[userId]/follow'),
    search: await load('@/pages/api/gundem/users/search'),
    notifications: await load('@/pages/api/gundem/notifications/index'),
    unread: await load('@/pages/api/gundem/notifications/unread-count'),
    me: await load('@/pages/api/user/me'),
    adminReports: await load('@/pages/api/admin/moderation/reports'),
    adminActions: await load('@/pages/api/admin/moderation/actions'),
    adminTerms: await load('@/pages/api/admin/moderation/terms'),
  };
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

beforeEach(() => {
  redisState.store.clear();
  rl.allow = true;
  mail.sent = [];
});

// ── yardımcılar ──────────────────────────────────────────────────────────────

function mockRes() {
  const res: any = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: string) => void (res.headers[k] = v);
  res.getHeader = (k: string) => res.headers[k];
  res.end = () => res;
  return res as NextApiResponse & { statusCode: number; body: any };
}

const tokens = new Map<string, string>();
async function call(handler: Handler, userId: string | null, method: string, query: Record<string, string> = {}, body: unknown = undefined) {
  const headers: Record<string, string> = {};
  if (userId) {
    if (!tokens.has(userId)) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      tokens.set(userId, await issueMobileToken({ sub: u.id, role: u.role, email: u.email, tokenVersion: u.tokenVersion }));
    }
    headers.authorization = `Bearer ${tokens.get(userId)}`;
  }
  const res = mockRes();
  await handler({ method, headers, cookies: {}, query, body } as unknown as NextApiRequest, res);
  return res;
}

let seq = 0;
const OLD = new Date('2025-01-01T00:00:00Z');
async function user(opts: { admin?: boolean; createdAt?: Date; terms?: boolean } = {}) {
  const n = ++seq;
  return prisma.user.create({
    data: {
      email: `u${n}@example.invalid`,
      username: `kisi_${n}`,
      name: `Kişi ${n}`,
      password: 'x',
      role: opts.admin ? 'ADMIN' : 'USER',
      createdAt: opts.createdAt ?? OLD,
      termsAcceptedAt: opts.terms === false ? null : new Date(),
    },
  });
}
const feedIds = async (viewer: string | null) =>
  ((await call(h.posts, viewer, 'GET', { scope: 'all' })).body.items as { id: string }[]).map((p) => p.id);

// ── A) içerik filtresi ve spam ───────────────────────────────────────────────

describe('içerik filtresi (sunucu)', () => {
  it('AĞIR: gönderi reddedilir, kelime söylenmez, kategori sayacı kişisel verisiz artar', async () => {
    const a = await user();
    const r = await call(h.posts, a.id, 'POST', {}, { body: 'hakem s.i.k.t.i.r git' });
    expect(r.statusCode).toBe(400);
    expect(r.body.code).toBe('CONTENT_REJECTED');
    expect(r.body.error).not.toMatch(/sik/i);
    expect(await prisma.post.count({ where: { authorId: a.id } })).toBe(0);
    const stat = await prisma.moderationStat.findFirst({ where: { surface: 'post', outcome: 'rejected', category: 'profanity' } });
    expect(stat?.count).toBeGreaterThanOrEqual(1);
    expect(Object.keys(stat!).sort()).toEqual(['category', 'count', 'day', 'id', 'outcome', 'surface']);
  });

  it('AĞIR yorum da reddedilir; temiz yorum geçer', async () => {
    const [a, b] = [await user(), await user()];
    const p = await prisma.post.create({ data: { authorId: a.id, body: 'maç' } });
    expect((await call(h.comments, b.id, 'POST', { postId: p.id }, { body: 'orospu çocuğu' })).body.code).toBe('CONTENT_REJECTED');
    expect((await call(h.comments, b.id, 'POST', { postId: p.id }, { body: 'Bu maç çok sıktı' })).statusCode).toBe(201);
  });

  it('ORTA: yayınlanır + kuyruğa AUTO işareti (eşiğe sayılmaz)', async () => {
    const a = await user();
    const r = await call(h.posts, a.id, 'POST', {}, { body: 'hakem bugün salak gibiydi' });
    expect(r.statusCode).toBe(201);
    const rows = await prisma.contentReport.findMany({ where: { postId: r.body.id } });
    expect(rows).toMatchObject([{ source: 'AUTO', reporterId: null, reason: 'AUTO_INSULT', status: 'OPEN' }]);
    expect((await prisma.post.findUniqueOrThrow({ where: { id: r.body.id } })).hiddenAt).toBeNull();
  });

  it('yeni hesap 1\'den fazla bağlantı paylaşamaz; eski hesap 3 üstünde işaretlenir', async () => {
    const fresh = await user({ createdAt: new Date() });
    const r = await call(h.posts, fresh.id, 'POST', {}, { body: 'bak a.com ve b.net' });
    expect([r.statusCode, r.body.code]).toEqual([400, 'LINK_LIMIT']);
    const old = await user();
    const ok = await call(h.posts, old.id, 'POST', {}, { body: 'a.com b.com c.com d.com' });
    expect(ok.statusCode).toBe(201);
    expect(await prisma.contentReport.count({ where: { postId: ok.body.id, reason: 'AUTO_SPAM_LINKS' } })).toBe(1);
  });

  it('aynı metni kısa sürede tekrar: 409 DUPLICATE_CONTENT (büyük/küçük harf, noktalama farkı dahil)', async () => {
    const a = await user();
    expect((await call(h.posts, a.id, 'POST', {}, { body: 'Bugün derbi var!' })).statusCode).toBe(201);
    const r = await call(h.posts, a.id, 'POST', {}, { body: 'bugün DERBİ var' });
    expect([r.statusCode, r.body.code]).toEqual([409, 'DUPLICATE_CONTENT']);
  });

  it('profil: ad / kullanıcı adı / bio AĞIR içerik 400; temiz değer kaydedilir', async () => {
    const a = await user();
    expect((await call(h.me, a.id, 'PATCH', {}, { bio: 'amk hepinizin' })).body).toMatchObject({ code: 'CONTENT_REJECTED', field: 'bio' });
    expect((await call(h.me, a.id, 'PATCH', {}, { username: 'orospu_cocugu' })).statusCode).toBe(400);
    expect((await call(h.me, a.id, 'PATCH', {}, { name: 'Sıkıntısız Ali' })).statusCode).toBe(200);
  });

  it('kayıt: uygunsuz kullanıcı adı ve ad reddedilir', async () => {
    const { createUserAccount } = await import('@/lib/accounts');
    const base = { email: 'kayit@example.invalid', password: 'Gecerli-Sifre-123' };
    expect(await createUserAccount({ ...base, username: 'siktir_git' })).toMatchObject({ ok: false, code: 'USERNAME_NOT_ALLOWED' });
    expect(await createUserAccount({ ...base, name: 'pezevenk' })).toMatchObject({ ok: false, code: 'CONTENT_REJECTED' });
  });

  it('yönetici "İncelemeye al" (FLAG) terimi: yayınlanır + kuyruk; "İstisna" (ALLOW) temel listedeki eşleşmeyi kaldırır', async () => {
    const [admin, a] = [await user({ admin: true }), await user()];
    expect((await call(h.adminTerms, admin.id, 'POST', {}, { term: 'incelemelik', level: 'FLAG', match: 'exact' })).statusCode).toBe(201);
    const r = await call(h.posts, a.id, 'POST', {}, { body: 'bu incelemelik bir yorum' });
    expect(r.statusCode).toBe(201);
    expect(await prisma.contentReport.count({ where: { postId: r.body.id, source: 'AUTO', reason: 'AUTO_CUSTOM' } })).toBe(1);
    expect((await call(h.posts, a.id, 'POST', {}, { body: 'mac cok sikti' })).statusCode).toBe(201); // sınırda: yayın
    expect((await call(h.adminTerms, admin.id, 'POST', {}, { term: 'sikti', level: 'ALLOW' })).statusCode).toBe(201);
    const allowed = await call(h.posts, a.id, 'POST', {}, { body: 'bugün mac yine sikti' });
    expect(allowed.statusCode).toBe(201);
    expect(await prisma.contentReport.count({ where: { postId: allowed.body.id } })).toBe(0);
    const terms = (await call(h.adminTerms, admin.id, 'GET')).body.terms.map((t: any) => [t.term, t.level]);
    expect(terms).toEqual(expect.arrayContaining([['incelemelik', 'FLAG'], ['sikti', 'ALLOW']]));
    // Temizlik: istisna sonraki testleri etkilemesin.
    for (const t of (await call(h.adminTerms, admin.id, 'GET')).body.terms) await call(h.adminTerms, admin.id, 'DELETE', { id: t.id });
  });

  it('yönetici sözlüğe terim ekleyince (kod değişmeden) hemen uygulanır', async () => {
    const [admin, a] = [await user({ admin: true }), await user()];
    expect((await call(h.adminTerms, admin.id, 'POST', {}, { term: 'yasakkelime', level: 'BLOCK', match: 'prefix' })).statusCode).toBe(201);
    expect((await call(h.posts, a.id, 'POST', {}, { body: 'bu yasakkelimeler' })).body.code).toBe('CONTENT_REJECTED');
    expect(await prisma.moderationAction.count({ where: { action: 'TERM_ADD', adminId: admin.id } })).toBe(1);
  });
});

// ── B) şikâyet ───────────────────────────────────────────────────────────────

describe('şikâyet', () => {
  it('giriş zorunlu; kendi içeriği 400; geçersiz neden 400; yok 404; ikinci kez 200 duplicate', async () => {
    const [a, b] = [await user(), await user()];
    const p = await prisma.post.create({ data: { authorId: a.id, body: 'x' } });
    const body = { targetType: 'POST', targetId: p.id, reason: 'SPAM' };
    expect((await call(h.reports, null, 'POST', {}, body)).statusCode).toBe(401);
    expect((await call(h.reports, a.id, 'POST', {}, body)).body.code).toBe('CANNOT_REPORT_SELF');
    expect((await call(h.reports, b.id, 'POST', {}, { ...body, reason: 'NOPE' })).statusCode).toBe(400);
    expect((await call(h.reports, b.id, 'POST', {}, { ...body, targetId: 'yok' })).statusCode).toBe(404);
    const first = await call(h.reports, b.id, 'POST', {}, { ...body, note: 'reklam' });
    expect(first.statusCode).toBe(201);
    expect(first.body.reportId).toBeTruthy();
    expect((await call(h.reports, b.id, 'POST', {}, body)).body).toEqual({ ok: true, duplicate: true });
    await new Promise((r) => setTimeout(r, 50)); // arka plan özet e-postası
    expect(mail.sent.length).toBeGreaterThanOrEqual(1);
  });

  it('Kullanım Şartları onayı olmayan hesap da şikâyet edebilir; hız sınırı 429', async () => {
    const [a, b] = [await user(), await user({ terms: false })];
    const p = await prisma.post.create({ data: { authorId: a.id, body: 'x' } });
    expect((await call(h.reports, b.id, 'POST', {}, { targetType: 'post', targetId: p.id, reason: 'HATE' })).statusCode).toBe(201);
    rl.allow = false;
    expect((await call(h.reports, b.id, 'POST', {}, { targetType: 'POST', targetId: p.id, reason: 'HATE' })).statusCode).toBe(429);
  });

  it('3 farklı kullanıcı → içerik gizlenir; yazar "inceleme altında" görür, diğerleri görmez; şikâyet edenin kimliği yanıtta yok', async () => {
    const author = await user();
    const reporters = [await user(), await user(), await user()];
    const p = await prisma.post.create({ data: { authorId: author.id, body: 'şikâyetlik' } });
    for (const [i, r] of reporters.entries()) {
      await call(h.reports, r.id, 'POST', {}, { targetType: 'POST', targetId: p.id, reason: 'HARASSMENT' });
      const hidden = (await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).hiddenAt;
      expect(hidden === null).toBe(i < 2);
    }
    expect(await feedIds(reporters[0]!.id)).not.toContain(p.id);
    expect(await feedIds(null)).not.toContain(p.id);
    expect((await call(h.post, reporters[0]!.id, 'GET', { postId: p.id })).statusCode).toBe(404);
    const own = await call(h.post, author.id, 'GET', { postId: p.id });
    expect(own.body.underReview).toBe(true);
    expect(JSON.stringify(own.body)).not.toContain(reporters[0]!.id);
    const authorFeed = (await call(h.posts, author.id, 'GET', { scope: 'all' })).body.items.find((x: any) => x.id === p.id);
    expect(authorFeed.underReview).toBe(true);
  });

  it('yorum şikâyeti eşikte gizlenir; yorum listesinde yalnız yazar görür', async () => {
    const [a, c] = [await user(), await user()];
    const p = await prisma.post.create({ data: { authorId: a.id, body: 'x' } });
    const cm = await prisma.postComment.create({ data: { postId: p.id, userId: c.id, body: 'yorum' } });
    for (const r of [await user(), await user(), await user()]) {
      await call(h.reports, r.id, 'POST', {}, { targetType: 'COMMENT', targetId: cm.id, reason: 'SPAM' });
    }
    expect((await call(h.comments, a.id, 'GET', { postId: p.id })).body.items).toEqual([]);
    expect((await call(h.comments, c.id, 'GET', { postId: p.id })).body.items[0].underReview).toBe(true);
  });
});

// ── C) engelleme ─────────────────────────────────────────────────────────────

describe('engelleme', () => {
  it('engellenenin gönderi, yorum ve bildirimleri gizlenir; takip iki yönde kalkar; engellenene söylenmez', async () => {
    const [me, bad] = [await user(), await user()];
    await prisma.follow.createMany({ data: [{ followerId: me.id, followingId: bad.id }, { followerId: bad.id, followingId: me.id }] });
    const badPost = await prisma.post.create({ data: { authorId: bad.id, body: 'kötü' } });
    const myPost = await prisma.post.create({ data: { authorId: me.id, body: 'benim' } });
    await prisma.postComment.create({ data: { postId: myPost.id, userId: bad.id, body: 'eski yorum' } });
    await prisma.notification.create({ data: { userId: me.id, actorId: bad.id, type: 'FOLLOW' } });

    expect((await call(h.block, me.id, 'POST', { userId: bad.id })).body).toEqual({ blocked: true });
    expect((await call(h.block, me.id, 'POST', { userId: bad.id })).body).toEqual({ blocked: true }); // idempotent
    expect(await prisma.follow.count({ where: { OR: [{ followerId: me.id }, { followingId: me.id }] } })).toBe(0);

    expect(await feedIds(me.id)).not.toContain(badPost.id);
    expect((await call(h.userPosts, me.id, 'GET', { userId: bad.id })).body.items).toEqual([]);
    expect((await call(h.comments, me.id, 'GET', { postId: myPost.id })).body.items).toEqual([]);
    expect((await call(h.notifications, me.id, 'GET')).body.items).toEqual([]);
    expect((await call(h.unread, me.id, 'GET')).body.count).toBe(0);
    expect((await call(h.profile, me.id, 'GET', { userId: bad.id })).body.user.blockedByMe).toBe(true);

    // Engellenen taraf: engelleyenin gönderisi görünür, profilde engel bilgisi yok, yeni etkileşim bildirimi üretmez.
    expect(await feedIds(bad.id)).toContain(myPost.id);
    expect((await call(h.profile, bad.id, 'GET', { userId: me.id })).body.user.blockedByMe).toBe(false);
    expect((await call(h.comments, bad.id, 'POST', { postId: myPost.id }, { body: 'yeni yorum' })).statusCode).toBe(201);
    await call(h.follow, bad.id, 'POST', { userId: me.id });
    expect(await prisma.notification.count({ where: { userId: me.id, actorId: bad.id } })).toBe(1); // yalnız eski satır

    expect((await call(h.blocks, me.id, 'GET')).body.items.map((r: any) => r.user.id)).toEqual([bad.id]);
    expect((await call(h.block, me.id, 'DELETE', { userId: bad.id })).body).toEqual({ blocked: false });
    expect(await feedIds(me.id)).toContain(badPost.id);
  });

  it('kendini 400, silinmiş kullanıcı yer tutucusu engellenemez', async () => {
    const me = await user();
    expect((await call(h.block, me.id, 'POST', { userId: me.id })).body.code).toBe('CANNOT_BLOCK_SELF');
    expect((await call(h.block, me.id, 'POST', { userId: 'deleted-user' })).statusCode).toBe(404);
  });
});

// ── F) @etiket ───────────────────────────────────────────────────────────────

describe('@etiketleme', () => {
  it('geçerli etiket: mentions alanı + tek bildirim; yok / engelli düz metin; kendine bildirim yok; en fazla 5', async () => {
    const author = await user();
    const t1 = await user();
    const blocker = await user();
    await prisma.userBlock.create({ data: { blockerId: blocker.id, blockedId: author.id } });
    const extra = [await user(), await user(), await user(), await user(), await user()];
    const body = `@${t1.username} @yok_kimse @${blocker.username} @${author.username} ${extra.map((u) => `@${u.username}`).join(' ')}`;
    const r = await call(h.posts, author.id, 'POST', {}, { body });
    expect(r.statusCode).toBe(201);
    const ids = r.body.mentions.map((m: any) => m.userId);
    expect(ids).toHaveLength(5);
    expect(ids.slice(0, 2)).toEqual([t1.id, author.id]);
    expect(ids).not.toContain(blocker.id);
    expect(r.body.body).toBe(body); // metin düz saklanır
    expect(await prisma.notification.count({ where: { type: 'MENTION', userId: t1.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: 'MENTION', userId: author.id } })).toBe(0);
    expect(await prisma.notification.count({ where: { type: 'MENTION', userId: blocker.id } })).toBe(0);

    // Aynı gönderide yorumla tekrar etiket → ikinci bildirim yok.
    await call(h.comments, author.id, 'POST', { postId: r.body.id }, { body: `tekrar @${t1.username}` });
    expect(await prisma.notification.count({ where: { type: 'MENTION', userId: t1.id } })).toBe(1);
  });

  it('öneri araması: önek, engelli / kendisi hariç; giriş zorunlu; e-posta yok', async () => {
    const me = await user();
    const blockedMe = await user();
    await prisma.user.update({ where: { id: blockedMe.id }, data: { username: 'zz_engel' } });
    const ok = await prisma.user.create({ data: { email: 'zz@example.invalid', username: 'zz_uygun' } });
    await prisma.userBlock.create({ data: { blockerId: blockedMe.id, blockedId: me.id } });
    expect((await call(h.search, null, 'GET', { q: 'zz' })).statusCode).toBe(401);
    const r = await call(h.search, me.id, 'GET', { q: 'ZZ' });
    expect(r.body.items.map((u: any) => u.id)).toEqual([ok.id]);
    expect(JSON.stringify(r.body)).not.toContain('@example.invalid');
  });
});

// ── D) yönetici ──────────────────────────────────────────────────────────────

describe('yönetici denetimi', () => {
  it('yönetici olmayan 403; oturumsuz 401', async () => {
    const a = await user();
    expect((await call(h.adminReports, a.id, 'GET')).statusCode).toBe(403);
    expect((await call(h.adminActions, a.id, 'POST', {}, { action: 'HIDE' })).statusCode).toBe(403);
    expect((await call(h.adminTerms, a.id, 'GET')).statusCode).toBe(403);
    expect((await call(h.adminReports, null, 'GET')).statusCode).toBe(401);
  });

  it('kuyruk + gizle / geri aç / uyar / askıya al; denetim kaydı; askıda okuma açık, yazma 403', async () => {
    const [admin, author, r1] = [await user({ admin: true }), await user(), await user()];
    const p = await prisma.post.create({ data: { authorId: author.id, body: 'kuyrukta' } });
    await call(h.reports, r1.id, 'POST', {}, { targetType: 'POST', targetId: p.id, reason: 'HATE', note: 'not' });
    const q = await call(h.adminReports, admin.id, 'GET');
    const item = q.body.items.find((i: any) => i.targetKey === `post:${p.id}`);
    expect(item).toMatchObject({ reportCount: 1, reasons: { HATE: 1 }, notes: ['not'], content: { body: 'kuyrukta' }, author: { id: author.id } });
    expect(JSON.stringify(item)).not.toContain(r1.id);

    const act = (body: object) => call(h.adminActions, admin.id, 'POST', {}, body);
    expect((await act({ action: 'HIDE', targetKey: `post:${p.id}` })).body).toEqual({ ok: true, resolvedReports: 1 });
    expect(await feedIds(r1.id)).not.toContain(p.id);
    expect((await act({ action: 'UNHIDE', targetKey: `post:${p.id}` })).statusCode).toBe(200);
    expect(await feedIds(r1.id)).toContain(p.id);

    expect((await act({ action: 'WARN', userId: author.id })).statusCode).toBe(200);
    expect(await prisma.notification.count({ where: { userId: author.id, type: 'MODERATION_WARNING', actorId: null } })).toBe(1);

    expect((await act({ action: 'SUSPEND', userId: author.id, days: 7 })).statusCode).toBe(200);
    const blocked = await call(h.posts, author.id, 'POST', {}, { body: 'askıdayım' });
    expect([blocked.statusCode, blocked.body.code]).toEqual([403, 'GUNDEM_SUSPENDED']);
    expect((await call(h.posts, author.id, 'GET', { scope: 'all' })).statusCode).toBe(200);
    expect((await act({ action: 'SUSPEND', userId: admin.id, days: null })).statusCode).toBe(400); // yönetici askıya alınmaz
    expect((await act({ action: 'UNSUSPEND', userId: author.id })).statusCode).toBe(200);
    expect((await call(h.posts, author.id, 'POST', {}, { body: 'geri döndüm' })).statusCode).toBe(201);

    const log = await prisma.moderationAction.findMany({ where: { adminId: admin.id }, orderBy: { createdAt: 'asc' } });
    expect(log.map((l) => l.action)).toEqual(['HIDE', 'UNHIDE', 'WARN', 'SUSPEND', 'UNSUSPEND']);
  });

  it('reddet: eşikle gizlenen içerik geri açılır, şikâyetler DISMISSED', async () => {
    const [admin, author] = [await user({ admin: true }), await user()];
    const p = await prisma.post.create({ data: { authorId: author.id, body: 'yersiz' } });
    for (const r of [await user(), await user(), await user()]) await call(h.reports, r.id, 'POST', {}, { targetType: 'POST', targetId: p.id, reason: 'SPAM' });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).hiddenReason).toBe('REPORTS');
    await call(h.adminActions, admin.id, 'POST', {}, { action: 'DISMISS', targetKey: `post:${p.id}` });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).hiddenAt).toBeNull();
    expect(await prisma.contentReport.count({ where: { postId: p.id, status: 'DISMISSED' } })).toBe(3);
  });
});

// ── hesap silme uyumu ────────────────────────────────────────────────────────

describe('hesap silme ile uyum', () => {
  it('şikâyetleri anonimleşir, engelleri ve etiketleri silinir; gönderisi "Silinmiş kullanıcı"ya geçer, şikâyeti kuyrukta kalır', async () => {
    const [gone, other] = [await user(), await user()];
    const otherPost = await prisma.post.create({ data: { authorId: other.id, body: 'o' } });
    await call(h.reports, gone.id, 'POST', {}, { targetType: 'POST', targetId: otherPost.id, reason: 'SPAM' });
    const goneR = await call(h.posts, gone.id, 'POST', {}, { body: `selam @${other.username}` });
    await call(h.reports, other.id, 'POST', {}, { targetType: 'POST', targetId: goneR.body.id, reason: 'HATE' });
    await call(h.posts, other.id, 'POST', {}, { body: `hey @${gone.username}` });
    await prisma.userBlock.createMany({ data: [{ blockerId: gone.id, blockedId: other.id }, { blockerId: other.id, blockedId: gone.id }] });

    const res = await deleteOwnAccount(gone.id, { confirm: 'SİL', source: 'mobile', sendEmail: async () => true });
    expect(res.ok && res.counts).toMatchObject({ reportsAnonymized: 1, blocksDeleted: 2, mentionsDeleted: 1, postsAnonymized: 1 });
    expect(await prisma.contentReport.count({ where: { postId: otherPost.id, reporterId: null, source: 'USER' } })).toBe(1);
    expect(await prisma.userBlock.count({ where: { OR: [{ blockerId: gone.id }, { blockedId: gone.id }] } })).toBe(0);
    const anon = await prisma.post.findUniqueOrThrow({ where: { id: goneR.body.id } });
    expect(anon.authorId).toBe('deleted-user');
    expect(await prisma.contentReport.count({ where: { postId: anon.id, status: 'OPEN', targetUserId: null } })).toBe(1);
    expect((await call(h.block, other.id, 'POST', { userId: 'deleted-user' })).statusCode).toBe(404);
    expect((await call(h.profile, other.id, 'GET', { userId: 'deleted-user' })).statusCode).toBe(404);
  });
});

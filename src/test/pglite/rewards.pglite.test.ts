/**
 * Kredi teşvikleri — GERÇEK SQL (PGlite, bellek içi; ağdaki DB'ye bağlanılmaz): başlangıç görevleri (doğrulama, tek sefer,
 * e-posta şartı), dönem ödülleri (tahmin oyunu haftası + Frikik ayı; idempotent, cron tekrarında çift ödül yok) ve Frikik
 * sezon tablosu SQL'i.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/livescoreCache', () => ({ readCache: async () => null, writeCache: async () => undefined }));

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let rewards: typeof import('@/server/rewards');
let lb: typeof import('@/server/frikik/leaderboardService');

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  rewards = await import('@/server/rewards');
  lb = await import('@/server/frikik/leaderboardService');
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

let n = 0;
const mkUser = (opts: { verified?: boolean; credits?: number } = {}) =>
  prisma.user.create({
    data: { email: `rw${++n}@example.test`, username: `oyuncu${n}`, credits: opts.credits ?? 0, emailVerified: opts.verified === false ? null : new Date() },
    select: { id: true },
  });
const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;

let frikikSeq = 0;
const frikik = (userId: string, day: string, level: number, score: number) =>
  prisma.frikikDailyScore.create({
    data: { userId, day, month: day.slice(0, 7), level, score, cleared: level, simVersion: 1, seed: 1, shots: 10, createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, ++frikikSeq)) },
  });

describe('başlangıç görevleri', () => {
  it('yapılmamış görev alınamaz; yapılınca +1, ikinci kez alınamaz', async () => {
    const u = await mkUser({ credits: 0 });
    let s = await rewards.loadOnboardingTasks(u.id);
    expect(s.verified).toBe(true);
    expect(s.tasks.every((t) => !t.done && !t.claimed)).toBe(true);
    expect(await rewards.claimOnboardingTask(u.id, 'frikik')).toEqual({ ok: false, code: 'NOT_DONE' });

    await frikik(u.id, '2026-11-02', 2, 300);
    expect(await rewards.claimOnboardingTask(u.id, 'frikik')).toEqual({ ok: true, balance: 1 });
    expect(await rewards.claimOnboardingTask(u.id, 'frikik')).toEqual({ ok: false, code: 'ALREADY_CLAIMED' });
    expect(await credits(u.id)).toBe(1);
    s = await rewards.loadOnboardingTasks(u.id);
    expect(s.tasks.find((t) => t.id === 'frikik')).toMatchObject({ done: true, claimed: true });
    const tx = await prisma.creditTransaction.findFirstOrThrow({ where: { userId: u.id } });
    expect(tx).toMatchObject({ type: 'ONBOARDING_REWARD', amount: 1, balanceAfter: 1, idempotencyKey: 'reward:onboarding:frikik' });
  });

  it('Gündem görevi: silinmiş gönderi sayılmaz, yorum sayılır', async () => {
    const u = await mkUser();
    await prisma.post.create({ data: { authorId: u.id, body: 'x', deletedAt: new Date() } });
    expect(await rewards.claimOnboardingTask(u.id, 'gundem')).toEqual({ ok: false, code: 'NOT_DONE' });
    const other = await mkUser();
    const post = await prisma.post.create({ data: { authorId: other.id, body: 'y' } });
    await prisma.postComment.create({ data: { postId: post.id, userId: u.id, body: 'yorum' } });
    expect(await rewards.claimOnboardingTask(u.id, 'gundem')).toMatchObject({ ok: true });
  });

  it('e-postası doğrulanmamış hesap ödül alamaz; eşzamanlı iki istekte tek ödül', async () => {
    const un = await mkUser({ verified: false });
    await frikik(un.id, '2026-11-03', 1, 100);
    expect(await rewards.claimOnboardingTask(un.id, 'frikik')).toEqual({ ok: false, code: 'UNVERIFIED' });
    expect(await credits(un.id)).toBe(0);

    const u = await mkUser();
    await frikik(u.id, '2026-11-03', 1, 100);
    const res = await Promise.all([rewards.claimOnboardingTask(u.id, 'frikik'), rewards.claimOnboardingTask(u.id, 'frikik')]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(await credits(u.id)).toBe(1);
  });
});

describe('dönem ödülleri', () => {
  it('tahmin oyunu haftası: katılım + ilk 3; cron tekrarında çift ödül yok; başlangıçtan eski hafta ödüllenmez', async () => {
    const now = new Date('2026-11-24T10:00:00Z');
    const mk = async (weekKey: string, startsAt: string) =>
      prisma.gameWeek.create({
        data: { weekKey, season: '2026-27', status: 'SETTLED', startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + 7 * 86_400_000), settledAt: now },
      });
    const w = await mk('2026-W47', '2026-11-15T21:00:00Z');
    const old = await mk('2026-W45', '2026-11-01T21:00:00Z');
    const matches = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        prisma.gameMatch.create({ data: { weekId: w.id, position: i, fixtureId: `r${i}`, kickoffAt: new Date('2026-11-18T18:00:00Z'), status: 'FINISHED', homeGoals: 1, awayGoals: 0 } }),
      ),
    );
    const oldMatch = await prisma.gameMatch.create({ data: { weekId: old.id, position: 0, fixtureId: 'old0', kickoffAt: new Date('2026-11-04T18:00:00Z'), status: 'FINISHED' } });

    const [a, b, c, d, hidden] = await Promise.all([mkUser(), mkUser(), mkUser(), mkUser(), mkUser({ verified: false })]);
    const play = async (userId: string, picks: number, points: number) => {
      for (let i = 0; i < picks; i++) await prisma.gamePrediction.create({ data: { userId, gameMatchId: matches[i]!.id, weekId: w.id, home: 1, away: 0, points: i === 0 ? points : 0 } });
      await prisma.gameWeekEntry.create({ data: { userId, weekId: w.id, season: '2026-27', totalPoints: points } });
    };
    await play(a.id, 6, 30); // hepsi + 1.
    await play(b.id, 5, 20); // 2.
    await play(c.id, 4, 25); // puanı yüksek ama 5 tahmin yok → ilk 3 dışı
    await play(d.id, 6, 5); // hepsi + 3.
    await play(hidden.id, 6, 99); // doğrulanmamış → tabloda görünmez
    await prisma.gamePrediction.create({ data: { userId: a.id, gameMatchId: oldMatch.id, weekId: old.id, home: 1, away: 0, points: 10 } });
    await prisma.gameWeekEntry.create({ data: { userId: a.id, weekId: old.id, season: '2026-27', totalPoints: 10 } });

    const first = await rewards.grantPeriodicRewards(now);
    expect(first.granted).toBe(5); // a full + top, b top, d full + top
    expect(await credits(a.id)).toBe(1 + 3);
    expect(await credits(b.id)).toBe(2);
    expect(await credits(c.id)).toBe(0);
    expect(await credits(d.id)).toBe(1 + 1);
    expect(await credits(hidden.id)).toBe(0);
    expect(await prisma.creditTransaction.count({ where: { idempotencyKey: { startsWith: 'reward:game-week:2026-W45' } } })).toBe(0);

    const again = await rewards.grantPeriodicRewards(new Date(now.getTime() + 600_000));
    expect(again.granted).toBe(0);
    expect(await credits(a.id)).toBe(4);
  });

  it('Frikik ayı: 7+ gün +2, ilk 3 +5/+4/+3 (doğrulanmamışa verilmez, sıra kaymaz); ay bitmeden ödül yok', async () => {
    const [x, y, z, un, casual] = await Promise.all([mkUser(), mkUser(), mkUser(), mkUser({ verified: false }), mkUser()]);
    for (let d = 1; d <= 7; d++) await frikik(x.id, `2026-11-${String(10 + d).padStart(2, '0')}`, 3, 500);
    await frikik(x.id, '2026-11-25', 9, 3000); // x ayın 1.si (seviye 9) + 8 gün
    await frikik(un.id, '2026-11-25', 8, 2900); // 2. ama doğrulanmamış → ödül yok, 3. sıradaki 4 almaz
    await frikik(y.id, '2026-11-25', 7, 2000); // 3.
    await frikik(z.id, '2026-11-25', 6, 1500); // 4. → ödül yok
    await frikik(casual.id, '2026-11-26', 1, 50);
    // Önceki testlerin kasım kayıtları seviye ≤ 2 → ilk 3'e girmez.

    expect((await rewards.grantPeriodicRewards(new Date('2026-11-30T12:00:00Z'))).months).toBe(0);
    expect(await credits(x.id)).toBe(0);

    const s = await rewards.grantPeriodicRewards(new Date('2026-12-01T09:00:00Z'));
    expect(s.months).toBe(1);
    expect(await credits(x.id)).toBe(2 + 5);
    expect(await credits(un.id)).toBe(0);
    expect(await credits(y.id)).toBe(3);
    expect(await credits(z.id)).toBe(0);
    expect(await credits(casual.id)).toBe(0);
    expect((await rewards.grantPeriodicRewards(new Date('2026-12-01T09:10:00Z'))).granted).toBe(0);
  });

  it('Frikik sezon tablosu: günlük en iyilerin toplamı, eşitlikte çok gün; kendi sırası', async () => {
    const [p, q] = await Promise.all([mkUser(), mkUser()]);
    await frikik(p.id, '2027-01-02', 5, 60_000);
    await frikik(q.id, '2027-01-02', 5, 30_000);
    await frikik(q.id, '2027-01-03', 5, 30_000); // q toplamı p'ye eşit, daha çok gün → önde
    const board = await lb.loadLeaderboard('2027-01-03');
    expect(board.season).toBe('2026-27');
    const top2 = board.seasonal.slice(0, 2).map((r) => [r.nickname, r.score, r.days]);
    const names = await prisma.user.findMany({ where: { id: { in: [p.id, q.id] } }, select: { id: true, username: true } });
    const nick = (id: string) => names.find((u) => u.id === id)!.username;
    expect(top2).toEqual([
      [nick(q.id), 60_000, 2],
      [nick(p.id), 60_000, 1],
    ]);
    const me = await lb.loadMyStanding(p.id, '2027-01-03');
    expect(me.season_total).toEqual({ score: 60_000, days: 1, rank: 2 });
  });
});

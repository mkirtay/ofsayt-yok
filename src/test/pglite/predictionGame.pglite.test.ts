/**
 * Tahmin oyunu uçtan uca — GERÇEK SQL motoru (PGlite, bellek içi; ağdaki hiçbir DB'ye bağlanılmaz) üzerinde gerçek Prisma:
 * taslak → maç listesi (snapshot) → yayın → tahmin + joker → kilit → sonuç işi (önbellekteki gün listesi taklit) → puan,
 * iptal, hafta kapanışı, sıralama ve dağılım. Sağlayıcı ve Redis taklit; zaman kilidi veritabanı saatinde.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/livescoreCache', () => {
  const m = new Map<string, unknown>();
  return { readCache: async (k: string) => m.get(k) ?? null, writeCache: async (k: string, v: unknown) => void m.set(k, v) };
});

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let weeks: typeof import('@/server/game/weeks');
let play: typeof import('@/server/game/play');
let settle: typeof import('@/server/game/settle');
let week: typeof import('@/lib/game/week');

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  weeks = await import('@/server/game/weeks');
  play = await import('@/server/game/play');
  settle = await import('@/server/game/settle');
  week = await import('@/lib/game/week');
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

const DAY = 86_400_000;
let weekKey = '';
let ids: string[] = []; // GameMatch id'leri, sıra = pozisyon
const users: Record<string, string> = {};

const fixture = (id: string, kickoff: Date, over: Partial<Match> = {}): Match =>
  ({
    id: Number(id),
    status: 'NOT STARTED',
    time: '',
    date: kickoff.toISOString().slice(0, 10),
    scheduled: kickoff.toISOString().slice(11, 16),
    home: { name: `Ev ${id}` },
    away: { name: `Dep ${id}` },
    ...over,
  }) as Match;

async function setKickoff(i: number, at: Date) {
  await prisma.gameMatch.update({ where: { id: ids[i]! }, data: { kickoffAt: at } });
}

describe('tahmin oyunu (PGlite + Prisma)', () => {
  it('taslak → maç listesi → yayın', async () => {
    weekKey = week.shiftWeek(week.weekKeyOf(Date.now()), 1)!;
    const r = week.weekRange(weekKey)!;
    for (let i = 0; i < 5; i++) {
      const fixtureId = String(9000 + i);
      await prisma.matchSnapshot.create({
        data: { fixtureId, homeTeamId: i * 2 + 1, homeName: `Ev ${fixtureId}`, awayTeamId: i * 2 + 2, awayName: `Dep ${fixtureId}`, startingAt: new Date(r.startsAt.getTime() + (i + 1) * DAY) },
      });
    }
    await prisma.matchSnapshot.create({ data: { fixtureId: '9999', homeTeamId: 99, homeName: 'X', awayTeamId: 98, awayName: 'Y', startingAt: new Date(r.endsAt.getTime() + DAY) } });

    await weeks.createDraftWeek(weekKey);
    await expect(weeks.setWeekMatches(weekKey, ['9000', '9999'])).rejects.toMatchObject({ code: 'OUT_OF_WEEK' });
    await expect(weeks.publishWeek(weekKey, 'admin')).rejects.toMatchObject({ code: 'BAD_MATCHES' });
    const w = await weeks.setWeekMatches(weekKey, ['9000', '9001', '9002', '9003', '9004']);
    expect(w.matches.map((m) => m.home.name)).toEqual(['Ev 9000', 'Ev 9001', 'Ev 9002', 'Ev 9003', 'Ev 9004']);
    ids = w.matches.map((m) => m.id);
    expect(await weeks.loadPublicWeek(weekKey)).toBeNull(); // taslak görünmez
    await weeks.publishWeek(weekKey, 'admin');
    expect((await weeks.loadPublicWeek(weekKey))?.matches).toHaveLength(5);
    await expect(weeks.setWeekMatches(weekKey, ['9000'])).rejects.toMatchObject({ code: 'NOT_DRAFT' });
  });

  it('tahmin + joker; başlamış maç kalemi LOCKED, diğerleri yazılır', async () => {
    for (const [name, username, verified] of [['a', 'eren', true], ['b', 'zeynep', true], ['c', 'dogrulanmamis', false]] as const) {
      users[name] = (await prisma.user.create({ data: { email: `${name}@ornek.example`, username, emailVerified: verified ? new Date() : null } })).id;
    }
    const all = (h: number, a: number) => ids.map((gameMatchId) => ({ gameMatchId, home: h, away: a }));
    const ra = await play.savePredictions(users.a!, weekKey, { items: all(2, 1), jokerGameMatchId: ids[0]! });
    expect(ra!.items.every((i) => i.ok)).toBe(true);
    expect(ra!.joker).toEqual({ ok: true });
    expect(ra!.me.predictions).toHaveLength(5);
    await play.savePredictions(users.b!, weekKey, { items: all(1, 1) });
    await play.savePredictions(users.c!, weekKey, { items: all(2, 1) });

    // 1. maç başladı: güncelleme ve joker taşıma reddedilir, diğer maç yazılır.
    await setKickoff(0, new Date(Date.now() - 60_000));
    const r2 = await play.savePredictions(users.a!, weekKey, { items: [{ gameMatchId: ids[0]!, home: 5, away: 0 }, { gameMatchId: ids[1]!, home: 0, away: 3 }], jokerGameMatchId: ids[1]! });
    expect(r2!.items).toEqual([{ gameMatchId: ids[0], ok: false, code: 'LOCKED' }, { gameMatchId: ids[1], ok: true }]);
    expect(r2!.joker).toEqual({ ok: false, code: 'LOCKED' });
    expect(r2!.me.predictions.find((p) => p.gameMatchId === ids[0])).toMatchObject({ home: 2, away: 1 });
    expect(r2!.me.jokerGameMatchId).toBe(ids[0]);
  });

  it('dağılım başlamadan kapalı, başlayınca açık', async () => {
    expect(await play.loadDistribution(ids[2]!)).toEqual({ kind: 'locked' });
    const d = await play.loadDistribution(ids[0]!);
    expect(d).toMatchObject({ kind: 'ok', view: { total: 2, shares: { home: 50, draw: 50, away: 0 } } }); // c doğrulanmamış
  });

  it('sonuç işi: önbellekteki listeden normal süre skoru; joker ×2; uzak maçlara istek yok', async () => {
    const k0 = (await prisma.gameMatch.findUniqueOrThrow({ where: { id: ids[0]! } })).kickoffAt;
    const listFor = vi.fn(async (day: string) => (day === k0.toISOString().slice(0, 10) ? [fixture('9000', k0, { status: 'FINISHED', scores: { score: '3-1', ft_score: '2-1' } })] : []));
    const lookup = vi.fn(async () => null);
    const s = await settle.settleGameMatches({ fixturesForUtcDate: listFor, lookupFixture: lookup });
    expect(s).toMatchObject({ evaluated: 1, voided: 0, errors: 0, closedWeeks: 0 });
    expect(listFor).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();

    const a = await play.loadMyWeek(users.a!, weekKey);
    expect(a!.predictions.find((p) => p.gameMatchId === ids[0])).toMatchObject({ points: 16, breakdown: { dir: 3, diff: 1, total: 1, exact: 3, rare: 0, joker: true } });
    expect(a!.totalPoints).toBe(16);
    expect(a!.rank).toBe(1);
    const c = await play.loadMyWeek(users.c!, weekKey);
    expect(c).toMatchObject({ totalPoints: 8, rank: null, visible: false });

    const board = await play.loadLeaderboard('week', weekKey);
    expect(board!.entries.map((e) => [e.rank, e.nickname, e.points])).toEqual([[1, 'eren', 16], [2, 'zeynep', 0]]);

    // Tekrar çalıştırma: yapılacak iş yok.
    expect(await settle.settleGameMatches({ fixturesForUtcDate: listFor, lookupFixture: lookup })).toMatchObject({ evaluated: 0 });
  });

  it('erken başlama: listede canlı görünen maç kilitlenir; iptal edilen VOID; sonuncular bitince hafta kapanır', async () => {
    const soon = new Date(Date.now() + 60 * 60_000); // 1 sa sonra (3 sa penceresinde)
    await setKickoff(1, soon);
    const listFor = async () => [fixture('9001', soon, { status: 'IN PLAY' })];
    expect(await settle.settleGameMatches({ fixturesForUtcDate: listFor, lookupFixture: async () => null })).toMatchObject({ kickoffUpdates: 1 });
    const r = await play.savePredictions(users.b!, weekKey, { items: [{ gameMatchId: ids[1]!, home: 4, away: 4 }] });
    expect(r!.items[0]).toMatchObject({ ok: false, code: 'LOCKED' });

    const past = new Date(Date.now() - 2 * 3_600_000);
    for (const i of [1, 2, 3, 4]) await setKickoff(i, past);
    const list = [
      fixture('9001', past, { status: 'FINISHED', state_code: 'CANCELLED' }),
      fixture('9002', past, { status: 'FINISHED', scores: { score: '0-3', ft_score: '0-3' } }),
      fixture('9003', past, { status: 'FINISHED', scores: { score: '1-1', ft_score: '1-1' } }),
      fixture('9004', past, { status: 'FINISHED', scores: { score: '2-0', ft_score: '2-0' } }),
    ];
    const s = await settle.settleGameMatches({ fixturesForUtcDate: async () => list, lookupFixture: async () => null });
    expect(s).toMatchObject({ evaluated: 3, voided: 1, closedWeeks: 1, errors: 0 });
    expect((await prisma.gameWeek.findUniqueOrThrow({ where: { weekKey } })).status).toBe('SETTLED');

    // eren: 9000 16 (joker) + 9001 iptal 0 + 9002 (2-1 vs 0-3) toplam 3 → 1 + 9003 (2-1 vs 1-1) 0 + 9004 (2-1 vs 2-0) yön 3 = 20
    // zeynep: 9003 (1-1) tam 8 + 9004 (1-1 vs 2-0) toplam 2 → 1 = 9 (9000 1-1 vs 2-1 → 0; 9002 1-1 vs 0-3 → 0)
    const board = await play.loadLeaderboard('week', weekKey);
    expect(board!.entries.map((e) => [e.nickname, e.points, e.exact])).toEqual([['eren', 20, 1], ['zeynep', 9, 1]]);
    const season = await play.loadLeaderboard('season', week.seasonOf(weekKey)!);
    expect(season!.entries.map((e) => [e.nickname, e.points])).toEqual([['eren', 20], ['zeynep', 9]]);
    expect(await play.loadMyStanding(users.b!, 'season', week.seasonOf(weekKey)!)).toMatchObject({ points: 9, rank: 2, visible: true });

    // Kapanmış haftaya yazım yok.
    expect(await play.savePredictions(users.a!, weekKey, { items: [{ gameMatchId: ids[4]!, home: 0, away: 0 }] })).toBeNull();
  });

  it('admin sonucu düzeltir: yeniden puanlama idempotent', async () => {
    const m = await prisma.gameMatch.findUniqueOrThrow({ where: { id: ids[3]! } });
    await settle.finishMatch(m, 2, 1);
    await settle.finishMatch(m, 2, 1);
    await play.invalidateLeaderboards(weekKey, week.seasonOf(weekKey)!);
    const board = await play.loadLeaderboard('week', weekKey);
    // eren 9003 artık 2-1 tam skor 8 → 28; zeynep 9003 1-1 vs 2-1 → 0 → 1
    expect(board!.entries.map((e) => [e.nickname, e.points])).toEqual([['eren', 28], ['zeynep', 1]]);
  });
});

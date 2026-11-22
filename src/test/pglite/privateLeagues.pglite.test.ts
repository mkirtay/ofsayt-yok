/**
 * Tahmin oyunu özel ligleri (büyüme raporu 2.2) — GERÇEK SQL (PGlite, bellek içi) + Prisma: kur, kodla katıl, sınırlar,
 * sezon / hafta sıralaması (GameWeekEntry toplamları; tahmini olmayan üye 0 puanla), ayrıl, kurucu ayrılınca silinir,
 * kullanıcı silinince üyelik CASCADE.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/moderation/contentGate', () => ({ isProfileTextAllowed: async (v: string) => !/yasak/i.test(v) }));

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let leagues: typeof import('@/server/game/leagues');
let week: typeof import('@/lib/game/week');

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  leagues = await import('@/server/game/leagues');
  week = await import('@/lib/game/week');
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

const user = async (name: string) => (await prisma.user.create({ data: { email: `${name}@ornek.example`, username: name, emailVerified: new Date() } })).id;

describe('özel ligler (PGlite + Prisma)', () => {
  it('kur → kodla katıl → sıralama → ayrıl → kurucu silince lig gider', async () => {
    const [a, b, c] = [await user('ayse'), await user('bora'), await user('cem')];

    await expect(leagues.createLeague(a, 'x')).rejects.toMatchObject({ code: 'NAME_INVALID' });
    await expect(leagues.createLeague(a, 'Bahis ligi')).rejects.toMatchObject({ code: 'NAME_BLOCKED' });
    await expect(leagues.createLeague(a, 'yasak ad')).rejects.toMatchObject({ code: 'NAME_BLOCKED' });

    const l = await leagues.createLeague(a, '  Ofis   Ligi ');
    expect(l).toMatchObject({ name: 'Ofis Ligi', owner: true, members: 1 });
    expect(l.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    await expect(leagues.joinLeague(b, 'ZZZZZZZZ')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await leagues.joinLeague(b, l.code.toLowerCase())).toMatchObject({ members: 2, owner: false });
    expect(await leagues.joinLeague(b, l.code)).toMatchObject({ members: 2 }); // ikinci kez: değişmez

    // Puanlar: bu hafta a=7, b=12; geçen hafta a=10. c üye değil (sayılmaz).
    const now = new Date();
    const thisKey = week.weekKeyOf(now.getTime());
    const lastKey = week.weekKeyOf(now.getTime() - 7 * 86_400_000);
    const season = week.seasonOf(thisKey)!;
    const mk = (key: string) => prisma.gameWeek.create({ data: { weekKey: key, season: week.seasonOf(key)!, status: 'PUBLISHED', ...week.weekRange(key)! } });
    const [w1, w0] = [await mk(thisKey), await mk(lastKey)];
    await prisma.gameWeekEntry.createMany({
      data: [
        { userId: a, weekId: w1.id, season, totalPoints: 7, exactCount: 1, directionCount: 3 },
        { userId: b, weekId: w1.id, season, totalPoints: 12, exactCount: 2, directionCount: 4 },
        { userId: c, weekId: w1.id, season, totalPoints: 99 },
        ...(w0.season === season ? [{ userId: a, weekId: w0.id, season, totalPoints: 10, exactCount: 1, directionCount: 2 }] : []),
      ],
    });

    const v = (await leagues.loadLeagueView(l.code, a, now))!;
    expect(v).toMatchObject({ name: 'Ofis Ligi', members: 2, member: true, owner: true });
    expect(v.week!.rows.map((r) => [r.nickname, r.points])).toEqual([
      ['bora', 12],
      ['ayse', 7],
    ]);
    const seasonA = w0.season === season ? 17 : 7;
    expect(v.season.rows.find((r) => r.nickname === 'ayse')!.points).toBe(seasonA);
    expect(v.season.rows.map((r) => r.userId)).not.toContain(c);

    const asStranger = (await leagues.loadLeagueView(l.code, c, now))!;
    expect(asStranger).toMatchObject({ member: false, owner: false });

    expect((await leagues.listMyLeagues(b)).map((x) => x.name)).toEqual(['Ofis Ligi']);
    expect(await leagues.leaveLeague(b, l.id)).toEqual({ deleted: false });
    await expect(leagues.leaveLeague(b, l.id)).rejects.toMatchObject({ code: 'NOT_MEMBER' });
    expect(await leagues.leaveLeague(a, l.id)).toEqual({ deleted: true });
    expect(await prisma.gameLeague.count()).toBe(0);
    expect(await prisma.gameLeagueMember.count()).toBe(0);
  });

  it('kurma sınırı ve kullanıcı silinince üyelik gider', async () => {
    const d = await user('deniz');
    for (let i = 0; i < leagues.MAX_OWNED; i++) await leagues.createLeague(d, `Lig ${i + 1}`);
    await expect(leagues.createLeague(d, 'Fazla lig')).rejects.toMatchObject({ code: 'OWN_LIMIT' });
    await prisma.user.delete({ where: { id: d } });
    expect(await prisma.gameLeague.count({ where: { ownerId: d } })).toBe(0);
    expect(await prisma.gameLeagueMember.count({ where: { userId: d } })).toBe(0);
  });

  it('davet metni ve WhatsApp linki', () => {
    const t = leagues.leagueInviteText('Ofis Ligi', 'https://www.getscor3.com/tahmin/lig/ABCD2345');
    expect(t).toContain('"Ofis Ligi"');
    expect(leagues.whatsappShareUrl(t)).toMatch(/^https:\/\/wa\.me\/\?text=%22Ofis%20Ligi%22/);
  });
});

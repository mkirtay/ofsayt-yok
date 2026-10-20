/**
 * Haftalık listenin otomatik seçimi — GERÇEK SQL (PGlite, bellek içi; ağdaki DB'ye bağlanılmaz) + gerçek Prisma:
 * hafta yoksa seçip YAYINLAR (yalnız başlamamış maçlar, öncelik sırası), boş yerleri sonra doldurur (mevcut maçlara dokunmadan,
 * saatte bir), admin kilidinde dokunmaz; "otomatiğe bırak"; tahmin almış maç admin listesinden çıkarılamaz.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Match } from '@/models/liveScore';
import * as wk from '@/lib/game/week';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

vi.mock('@/lib/livescoreCache', () => {
  const m = new Map<string, unknown>();
  return { readCache: async (k: string) => m.get(k) ?? null, writeCache: async (k: string, v: unknown) => void m.set(k, v) };
});
// Snapshot: ağ yok — testin fikstür listesinden üretilir.
const fixtures = new Map<string, Match>();
vi.mock('@/lib/gundem/matchSnapshot', async () => {
  const { prisma } = await import('@/lib/prisma');
  return {
    ensureMatchSnapshot: async (id: string) => {
      const f = fixtures.get(id)!;
      return prisma.matchSnapshot.upsert({
        where: { fixtureId: id },
        create: { fixtureId: id, homeTeamId: Number(f.home.id), homeName: f.home.name, awayTeamId: Number(f.away.id), awayName: f.away.name, startingAt: new Date(`${f.date}T${f.scheduled}:00Z`), leagueId: f.competition_id ?? null },
        update: {},
      });
    },
  };
});

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let auto: typeof import('@/server/game/autoWeek');
let weeks: typeof import('@/server/game/weeks');

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  ({ prisma } = await import('@/lib/prisma'));
  auto = await import('@/server/game/autoWeek');
  weeks = await import('@/server/game/weeks');
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});

let seq = 7000;
const fx = (at: Date, league: number, homeId: number, awayId: number): Match => {
  const f = { id: ++seq, date: at.toISOString().slice(0, 10), scheduled: at.toISOString().slice(11, 16), status: 'NOT STARTED', competition_id: league, home: { id: homeId, name: `T${homeId}` }, away: { id: awayId, name: `T${awayId}` } } as Match;
  fixtures.set(String(f.id), f);
  return f;
};

describe('otomatik haftalık liste (game-settle)', () => {
  // Haftanın Çarşamba 12:00'si (İstanbul): hafta başlamış, öncesi oynanmış.
  const weekKey = wk.shiftWeek(wk.weekKeyOf(Date.now()), 1)!;
  const r = wk.weekRange(weekKey)!;
  const at = (dayOffset: number, hourUtc: number) => new Date(r.startsAt.getTime() + dayOffset * 86_400_000 + hourUtc * 3_600_000);
  const now = at(2, 12);
  const list: Match[] = [];

  it('hafta yoksa: yalnız başlamamış maçlardan öncelik sırasıyla seçer ve doğrudan yayınlar', async () => {
    list.push(
      fx(at(1, 19), 2, 34, 690), // GS — Salı: oynandı, alınmaz
      fx(at(2, 19), 2, 690, 34), // Lille – GS (UCL, Çarşamba akşamı)
      fx(at(4, 16), 600, 88, 554), // FB – BJK
      fx(at(3, 19), 8, 9, 8), // MCI – LIV (iki dev)
      fx(at(5, 16), 600, 1000, 1001), // Süper Lig sıradan
      fx(at(5, 18), 72, 1100, 1101), // Eredivisie (diğer)
    );
    const listFor = async (d: string) => list.filter((m) => m.date === d);
    const res = await auto.ensureWeeklyRound({ now, fixturesForUtcDate: listFor });
    expect(res).toMatchObject({ weekKey: wk.weekKeyOf(now.getTime()), created: true, added: 5 });
    const w = await weeks.loadAdminWeek(res.weekKey);
    expect(w).toMatchObject({ rawStatus: 'PUBLISHED', lockedByAdmin: false });
    expect(w!.matches.map((m) => `${m.home.name}-${m.away.name}`)).toEqual(['T88-T554', 'T690-T34', 'T9-T8', 'T1000-T1001', 'T1100-T1101']); // dört büyükler (Süper Lig önce) → iki dev → Süper Lig → diğer
    expect(await weeks.loadPublicWeek(res.weekKey)).not.toBeNull(); // oyuncu görür
  });

  it('boş yer: saatte bir yeniden dener; yalnız ekler, mevcut maçlara dokunmaz', async () => {
    const wKey = wk.weekKeyOf(now.getTime());
    list.push(fx(at(6, 15), 564, 83, 3468)); // sonradan fikstüre düşen El Clásico
    const listFor = async (d: string) => list.filter((m) => m.date === d);
    expect(await auto.ensureWeeklyRound({ now: new Date(now.getTime() + 10 * 60_000), fixturesForUtcDate: listFor })).toMatchObject({ skipped: 'recent', added: 0 });
    const later = new Date(now.getTime() + 61 * 60_000);
    const before = (await weeks.loadAdminWeek(wKey))!.matches.map((m) => m.id);
    const res = await auto.ensureWeeklyRound({ now: later, fixturesForUtcDate: listFor });
    expect(res).toMatchObject({ created: false, added: 1 });
    const after = (await weeks.loadAdminWeek(wKey))!.matches;
    expect(after.slice(0, before.length).map((m) => m.id)).toEqual(before);
    expect(after.at(-1)).toMatchObject({ home: { name: 'T83' } });
  });

  it('admin değişikliği kilitler (cron ezmez); tahmin almış maç çıkarılamaz; otomatiğe bırak', async () => {
    const wKey = wk.weekKeyOf(now.getTime());
    const w = (await weeks.loadAdminWeek(wKey))!;
    const u = await prisma.user.create({ data: { email: 'a@ornek.example', username: 'eren', emailVerified: new Date() } });
    const fbBjk = w.matches.find((m) => m.home.name === 'T88')!;
    await prisma.gamePrediction.create({ data: { userId: u.id, gameMatchId: fbBjk.id, weekId: w.id, home: 1, away: 1 } });
    const keep = w.matches.filter((m) => m.home.name !== 'T1100').map((m) => m.fixtureId);
    await expect(weeks.setWeekMatches(wKey, keep.filter((id) => id !== fbBjk.fixtureId), now)).rejects.toMatchObject({ code: 'HAS_PREDICTIONS' });
    const edited = await weeks.setWeekMatches(wKey, keep, now); // Eredivisie maçı çıkarıldı
    expect(edited.lockedByAdmin).toBe(true);
    expect(edited.matches).toHaveLength(5);
    list.push(fx(at(6, 18), 384, 2930, 113)); // Inter – Milan
    const listFor = async (d: string) => list.filter((m) => m.date === d);
    expect(await auto.ensureWeeklyRound({ now: new Date(now.getTime() + 3 * 3_600_000), fixturesForUtcDate: listFor })).toMatchObject({ skipped: 'locked', added: 0 });
    await weeks.unlockWeek(wKey);
    const res = await auto.ensureWeeklyRound({ now: new Date(now.getTime() + 3 * 3_600_000), fixturesForUtcDate: listFor });
    expect(res.added).toBeGreaterThanOrEqual(1);
    expect((await weeks.loadAdminWeek(wKey))!.matches.map((m) => m.home.name)).toContain('T2930');
  });

  it('başka haftanın listesindeki maç alınmaz; aday yoksa hafta açılmaz', async () => {
    const nextNow = new Date(r.endsAt.getTime() + 86_400_000); // sonraki hafta Salı
    const other = await auto.ensureWeeklyRound({ now: nextNow, fixturesForUtcDate: async () => [] });
    expect(other).toMatchObject({ created: false, skipped: 'none' });
    expect(await prisma.gameWeek.count({ where: { weekKey: wk.weekKeyOf(nextNow.getTime()) } })).toBe(0);
  });
});

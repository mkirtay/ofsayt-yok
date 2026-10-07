import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dailyRankSql, dailyTopSql, monthlyBest, monthlyRankSql, monthlyTopSql, myMonthBestSql, type LeaderboardRow } from '@/lib/frikik/leaderboard';

/**
 * Frikik skor migration'ı (20261008120000_frikik_daily_score) GERÇEK Postgres motorunda (PGlite, bellek içi — üretim
 * DB'sine bağlanmaz) + canlıda kullanılan sıralama SQL'leri aynı metinle (lib/frikik/leaderboard.ts) bu tabloda çalışır
 * ve saf referans (`monthlyBest`) ile aynı sonucu verir.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261008120000_frikik_daily_score', 'migration.sql'), 'utf8');
let db: PGlite;

const at = (day: string, s: number) => new Date(`${day}T10:00:${String(s).padStart(2, '0')}Z`);
type Row = { id: string; userId: string; day: string; level: number; score: number; createdAt: Date };
const ROWS: Row[] = [
  { id: 'r1', userId: 'u1', day: '2026-10-01', level: 3, score: 600, createdAt: at('2026-10-01', 1) },
  { id: 'r2', userId: 'u1', day: '2026-10-02', level: 4, score: 900, createdAt: at('2026-10-02', 2) },
  { id: 'r3', userId: 'u1', day: '2026-10-03', level: 4, score: 700, createdAt: at('2026-10-03', 3) },
  { id: 'r4', userId: 'u2', day: '2026-10-01', level: 2, score: 400, createdAt: at('2026-10-01', 4) },
  { id: 'r5', userId: 'u2', day: '2026-10-02', level: 2, score: 450, createdAt: at('2026-10-02', 5) },
  { id: 'r6', userId: 'u3', day: '2026-10-02', level: 4, score: 900, createdAt: at('2026-10-02', 0) },
  { id: 'r7', userId: 'u3', day: '2026-09-30', level: 9, score: 9000, createdAt: at('2026-09-30', 0) },
];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY, username TEXT);
    INSERT INTO "User" (id, username) VALUES ('u1', 'eren'), ('u2', NULL), ('u3', 'zeynep');
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await db.exec(SQL);
  for (const r of ROWS) {
    await db.query(
      `INSERT INTO "FrikikDailyScore" (id, "userId", day, month, score, level, cleared, "simVersion", seed, shots, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, 2, 1, 4, $8)`,
      [r.id, r.userId, r.day, r.day.slice(0, 7), r.score, r.level, r.level - 1, r.createdAt],
    );
  }
});

const run = async <T>(q: { text: string; values: unknown[] }) => (await db.query<T>(q.text, q.values)).rows;
const one = async <T>(q: { text: string; values: unknown[] }) => (await run<T>(q))[0]!;

describe('frikik_daily_score migration (gerçek SQL)', () => {
  it('RLS açık, anon / authenticated tablo yetkisi yok', async () => {
    expect((await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'FrikikDailyScore'`)).rows[0]).toEqual({ relrowsecurity: true });
    for (const role of ['anon', 'authenticated']) {
      const r = (await db.query<{ ok: boolean }>(`SELECT has_table_privilege('${role}', '"FrikikDailyScore"', 'SELECT') AS ok`)).rows[0]!;
      expect(r.ok, role).toBe(false);
    }
  });

  it('kullanıcı + gün tekil (günün ilk koşusu kalır); kullanıcı silinince kayıtlar silinir', async () => {
    await expect(
      db.query(`INSERT INTO "FrikikDailyScore" (id, "userId", day, month, score, level, cleared, "simVersion", seed, shots) VALUES ('dup', 'u1', '2026-10-01', '2026-10', 99999, 99, 98, 2, 1, 4)`),
    ).rejects.toThrow(/FrikikDailyScore_userId_day_key/);
    await db.exec(`INSERT INTO "User" (id) VALUES ('tmp')`);
    await db.exec(`INSERT INTO "FrikikDailyScore" (id, "userId", day, month, score, level, cleared, "simVersion", seed, shots) VALUES ('t1', 'tmp', '2026-10-01', '2026-10', 1, 1, 0, 2, 1, 3)`);
    await db.exec(`DELETE FROM "User" WHERE id = 'tmp'`);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "FrikikDailyScore" WHERE "userId" = 'tmp'`)).rows[0]).toEqual({ n: 0 });
  });

  it('günün tablosu: seviye > puan > erken kayıt; takma ad username (null olabilir)', async () => {
    const rows = await run<LeaderboardRow>(dailyTopSql('2026-10-02'));
    expect(rows.map((r) => [r.userId, r.nickname, r.level, r.score])).toEqual([
      ['u3', 'zeynep', 4, 900],
      ['u1', 'eren', 4, 900],
      ['u2', null, 2, 450],
    ]);
    expect(await run(dailyTopSql('2026-10-02', 1))).toHaveLength(1);
    expect(await run(dailyTopSql('2026-10-09'))).toEqual([]);
  });

  it('ayın tablosu: kullanıcı başına en iyi günlük kayıt; eylül kaydı ekime girmez; saf referansla aynı', async () => {
    const rows = await run<LeaderboardRow>(monthlyTopSql('2026-10'));
    expect(rows.map((r) => [r.userId, r.day, r.level, r.score])).toEqual([
      ['u3', '2026-10-02', 4, 900],
      ['u1', '2026-10-02', 4, 900],
      ['u2', '2026-10-02', 2, 450],
    ]);
    const ref = monthlyBest(ROWS.filter((r) => r.day.startsWith('2026-10')));
    expect(rows.map((r) => `${r.userId}:${r.day}`)).toEqual(ref.map((r) => `${r.userId}:${r.day}`));
  });

  it('sıram: önde olan kayıt / kullanıcı sayısı', async () => {
    const me = { level: 4, score: 900, createdAt: at('2026-10-02', 2) }; // u1'in 2 Ekim kaydı
    expect(await one<{ n: number }>(dailyRankSql('2026-10-02', me))).toEqual({ n: 1 }); // yalnız u3 (erken kayıt)
    expect(await one<{ n: number }>(monthlyRankSql('2026-10', me))).toEqual({ n: 1 });
    expect(await one<{ n: number }>(dailyRankSql('2026-10-02', { level: 2, score: 450, createdAt: at('2026-10-02', 5) }))).toEqual({ n: 2 });
    const best = await one<LeaderboardRow>(myMonthBestSql('u1', '2026-10'));
    expect([best.day, best.level, best.score]).toEqual(['2026-10-02', 4, 900]);
    expect(await run(myMonthBestSql('u9', '2026-10'))).toEqual([]);
  });
});

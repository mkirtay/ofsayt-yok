import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { dailySeed, parseDayKey } from '@/lib/frikik/daily';
import { dailyRankSql, dailyTopSql, monthlyTopSql, myMonthBestSql, type LeaderboardRow } from '@/lib/frikik/leaderboard';

/**
 * Tohum 32 bit işaretsiz, "seed" sütunu INT4 (üst sınır 2^31-1). 2^31 üstü tohumlu günlerde (≈ günlerin yarısı) ham
 * değer yazılamıyordu (Sentry OFSAYT-YOK-S). Servis `run.seed | 0` yazar; bu test GERÇEK migration tablosunda (PGlite,
 * bellek içi) kaydın oluştuğunu, `>>> 0` ile tohumun geri alındığını ve sıralama SQL'lerinin bozulmadığını doğrular.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261008120000_frikik_daily_score', 'migration.sql'), 'utf8');
let db: PGlite;

const HIGH = [
  { day: '2026-10-09', seed: 2147744602 },
  { day: '2026-10-10', seed: 3804986645 },
];
const at = (day: string, s: number) => new Date(`${day}T10:00:${String(s).padStart(2, '0')}Z`);
const insert = (id: string, userId: string, day: string, level: number, score: number, seed: number, s: number) =>
  db.query(
    `INSERT INTO "FrikikDailyScore" (id, "userId", day, month, score, level, cleared, "simVersion", seed, shots, "createdAt") VALUES ($1, $2, $3, $4, $5, $6, $7, 2, $8, 4, $9)`,
    [id, userId, day, day.slice(0, 7), score, level, level - 1, seed, at(day, s)],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY, username TEXT);
    INSERT INTO "User" (id, username) VALUES ('u1', 'eren'), ('u2', 'zeynep'), ('u3', NULL);
    CREATE ROLE anon; CREATE ROLE authenticated;
  `);
  await db.exec(SQL);
});

const run = async <T>(q: { text: string; values: unknown[] }) => (await db.query<T>(q.text, q.values)).rows;

describe('FrikikDailyScore.seed INT4 (2^31 üstü tohum)', () => {
  it('sabit günlerin tohumları gerçekten 2^31 üstü', () => {
    for (const { day, seed } of HIGH) expect(dailySeed(parseDayKey(day)!), day).toBe(seed);
    for (const { seed } of HIGH) expect(seed).toBeGreaterThan(2 ** 31 - 1);
  });

  it('ham işaretsiz tohum INT4 sütununa yazılamaz (eski hata)', async () => {
    await expect(insert('raw', 'u1', '2026-10-09', 1, 1, HIGH[0]!.seed, 0)).rejects.toThrow(/out of range/i);
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM "FrikikDailyScore"`)).rows[0]).toEqual({ n: 0 });
  });

  it('`seed | 0` yazılır, kayıt oluşur ve `>>> 0` ile aynı tohum geri alınır', async () => {
    for (const [i, { day, seed }] of HIGH.entries()) {
      await insert(`h${i}`, 'u1', day, 4, 900, seed | 0, 1);
      const r = (await db.query<{ seed: number }>(`SELECT seed FROM "FrikikDailyScore" WHERE id = $1`, [`h${i}`])).rows[0]!;
      expect(r.seed).toBe(seed | 0);
      expect(r.seed).toBeLessThan(0);
      expect(r.seed >>> 0).toBe(seed);
    }
  });

  it('negatif saklanan tohum sıralamayı etkilemez (seviye > puan > erken kayıt)', async () => {
    const [d9, d10] = HIGH as [(typeof HIGH)[0], (typeof HIGH)[0]];
    await insert('z9', 'u2', d9.day, 5, 300, d9.seed | 0, 2);
    await insert('n9', 'u3', d9.day, 4, 900, 7, 0); // küçük pozitif tohum, u1 ile eşit ama erken
    await insert('z10', 'u2', d10.day, 2, 100, d10.seed | 0, 3);

    const daily = await run<LeaderboardRow>(dailyTopSql(d9.day));
    expect(daily.map((r) => [r.userId, r.level, r.score])).toEqual([
      ['u2', 5, 300],
      ['u3', 4, 900],
      ['u1', 4, 900],
    ]);
    expect((await run<{ n: number }>(dailyRankSql(d9.day, { level: 4, score: 900, createdAt: at(d9.day, 1) })))[0]).toEqual({ n: 2 });

    const monthly = await run<LeaderboardRow>(monthlyTopSql('2026-10'));
    expect(monthly.map((r) => [r.userId, r.day, r.level])).toEqual([
      ['u2', d9.day, 5],
      ['u3', d9.day, 4],
      ['u1', d9.day, 4],
    ]);
    const best = (await run<LeaderboardRow>(myMonthBestSql('u2', '2026-10')))[0]!;
    expect([best.day, best.level, best.score]).toEqual([d9.day, 5, 300]);
  });
});

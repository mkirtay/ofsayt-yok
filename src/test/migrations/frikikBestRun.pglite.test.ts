import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dailyTopSql, upsertBestRunSql, type BestRunInput, type LeaderboardRow } from '@/lib/frikik/leaderboard';

/**
 * Günün EN İYİ koşusu: `upsertBestRunSql` GERÇEK migration tablosunda (PGlite, bellek içi — üretim DB'sine bağlanmaz).
 * Daha iyi → güncellenir, daha kötü / eşit → dokunulmaz (satır dönmez), ilk kayıt `inserted = true`. Yarış: koşul tek
 * ifadede (ON CONFLICT … WHERE) olduğu için gönderim sırası sonucu değiştirmez; eşzamanlı gönderimler en iyisini bırakır.
 * Not: PGlite tek bağlantıdır, eşzamanlı sorgular sıraya girer; gerçek Postgres'te ON CONFLICT satırı kilitleyip WHERE'i
 * en güncel sürüm üzerinde yeniden değerlendirir — aynı sonuç.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261008120000_frikik_daily_score', 'migration.sql'), 'utf8');
let db: PGlite;
const DAY = '2026-10-13';
let n = 0;

const runOf = (level: number, score: number, userId = 'u1'): BestRunInput => ({
  id: `r${++n}`,
  userId,
  day: DAY,
  month: DAY.slice(0, 7),
  score,
  level,
  cleared: level - 1,
  simVersion: 2,
  seed: -123, // `seed | 0` ile yazılan 2^31 üstü tohum gibi
  shots: level + 2,
});
const submit = async (r: BestRunInput) => {
  const q = upsertBestRunSql(r);
  return (await db.query<{ inserted: boolean }>(q.text, q.values)).rows;
};
const current = async (userId = 'u1') =>
  (await db.query<{ level: number; score: number; cleared: number; shots: number; id: string }>(`SELECT id, level, score, cleared, shots FROM "FrikikDailyScore" WHERE "userId" = $1 AND day = $2`, [userId, DAY])).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY, username TEXT);
    INSERT INTO "User" (id, username) VALUES ('u1', 'eren'), ('u2', 'zeynep');
    CREATE ROLE anon; CREATE ROLE authenticated;
  `);
  await db.exec(SQL);
});
beforeEach(async () => void (await db.exec(`DELETE FROM "FrikikDailyScore"`)));

describe('upsertBestRunSql (günün en iyi koşusu)', () => {
  it('ilk gönderim eklenir (inserted=true)', async () => {
    expect(await submit(runOf(1, 0))).toEqual([{ inserted: true }]);
    expect(await current()).toMatchObject([{ level: 1, score: 0 }]);
  });

  it('daha iyi: yüksek seviye (puanı düşük olsa da) ya da aynı seviyede yüksek puan → güncellenir (inserted=false)', async () => {
    const first = runOf(3, 900);
    await submit(first);
    expect(await submit(runOf(4, 400))).toEqual([{ inserted: false }]);
    expect(await current()).toMatchObject([{ id: first.id, level: 4, score: 400, cleared: 3, shots: 6 }]);
    expect(await submit(runOf(4, 550))).toEqual([{ inserted: false }]);
    expect(await current()).toMatchObject([{ id: first.id, level: 4, score: 550 }]);
  });

  it('daha kötü: düşük seviye (puanı yüksek olsa da) ya da aynı seviyede düşük puan → dokunulmaz, satır dönmez', async () => {
    await submit(runOf(4, 550));
    expect(await submit(runOf(3, 5000))).toEqual([]);
    expect(await submit(runOf(4, 549))).toEqual([]);
    expect(await current()).toMatchObject([{ level: 4, score: 550 }]);
  });

  it('eşit (aynı seviye + puan) → dokunulmaz; erken kaydın "createdAt" sırası korunur', async () => {
    await submit(runOf(4, 550));
    const before = (await db.query<{ createdAt: Date }>(`SELECT "createdAt" FROM "FrikikDailyScore"`)).rows[0]!.createdAt;
    expect(await submit(runOf(4, 550))).toEqual([]);
    const after = (await db.query<{ createdAt: Date }>(`SELECT "createdAt" FROM "FrikikDailyScore"`)).rows[0]!.createdAt;
    expect(after).toEqual(before);
    expect(await current()).toHaveLength(1);
  });

  it('yarış: eşzamanlı gönderimler (her sıralamada) tek satır bırakır ve o satır en iyisidir', async () => {
    const runs: [number, number][] = [
      [2, 300],
      [5, 1200],
      [5, 1350],
      [1, 0],
      [4, 9000],
    ];
    const orders = [runs, [...runs].reverse(), [runs[2]!, runs[0]!, runs[4]!, runs[1]!, runs[3]!]];
    for (const order of orders) {
      await db.exec(`DELETE FROM "FrikikDailyScore"`);
      const results = await Promise.all(order.map(([l, s]) => submit(runOf(l, s))));
      expect(results.filter((r) => r[0]?.inserted === true)).toHaveLength(1);
      expect(await current()).toMatchObject([{ level: 5, score: 1350 }]);
    }
  });

  it('kullanıcılar birbirini etkilemez; tablo sıralaması güncel en iyiyi gösterir', async () => {
    await Promise.all([submit(runOf(2, 300, 'u1')), submit(runOf(3, 500, 'u2'))]);
    await submit(runOf(4, 700, 'u1'));
    await submit(runOf(1, 0, 'u2'));
    const q = dailyTopSql(DAY);
    const rows = (await db.query<LeaderboardRow>(q.text, q.values)).rows;
    expect(rows.map((r) => [r.nickname, r.level, r.score])).toEqual([
      ['eren', 4, 700],
      ['zeynep', 3, 500],
    ]);
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  matchAggregateSql,
  refereeAggregateSql,
  refereeRecentSql,
  toAggregate,
  toRecent,
  type SqlQuery,
} from '@/lib/refereeRating';
import { DELETED_USER_ID } from '@/config/deletedUser';

/**
 * Hakem puanlama migration'ı (20261108120000_referee_rating) + ortalama SQL'i GERÇEK Postgres motorunda (PGlite, bellek
 * içi — üretim DB'sine bağlanmaz). Tekil oy, 1–10 kısıtı, CASCADE, RLS, silinmiş kullanıcı hariç ortalama.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261108120000_referee_rating', 'migration.sql'), 'utf8');
let db: PGlite;
let n = 0;

const insert = (userId: string, matchId: string, refereeId: number, score: number, kickoff = '2026-11-01T18:00:00Z', home = 'Galatasaray', away = 'Fenerbahçe') =>
  db.query(
    `INSERT INTO "RefereeRating" (id, "userId", "matchId", "refereeId", score, "homeName", "awayName", "kickoffAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [`r${++n}`, userId, matchId, refereeId, score, home, away, kickoff],
  );
const run = async <T,>(q: SqlQuery) => (await db.query<T>(q.text, q.values)).rows;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY);
    INSERT INTO "User" (id) VALUES ('u1'), ('u2'), ('u3'), ('u4'), ('u5'), ('u6'), ('${DELETED_USER_ID}');
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await db.exec(SQL);
});
beforeEach(async () => void (await db.exec(`DELETE FROM "RefereeRating"`)));

describe('referee_rating migration', () => {
  it('RLS açık, anon / authenticated yetkisi yok; ikinci çalıştırma hata vermez', async () => {
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname = 'RefereeRating'`)).rows[0]).toEqual({ relrowsecurity: true });
    for (const role of ['anon', 'authenticated']) {
      expect((await db.query(`SELECT has_table_privilege('${role}', '"RefereeRating"', 'SELECT') AS ok`)).rows[0]).toEqual({ ok: false });
    }
    await db.exec(SQL);
  });

  it('aynı kullanıcı aynı maça ikinci satır yazamaz (userId + matchId tekil)', async () => {
    await insert('u1', '100', 7, 6);
    await expect(insert('u1', '100', 7, 8)).rejects.toThrow(/unique|duplicate/i);
    await insert('u2', '100', 7, 8);
  });

  it('puan 1–10 dışında reddedilir', async () => {
    await expect(insert('u1', '100', 7, 0)).rejects.toThrow(/RefereeRating_score_range/);
    await expect(insert('u1', '100', 7, 11)).rejects.toThrow(/RefereeRating_score_range/);
    await insert('u1', '100', 7, 1);
    await insert('u2', '100', 7, 10);
  });

  it('kullanıcı silinince puanları da silinir (CASCADE)', async () => {
    await db.exec(`INSERT INTO "User" (id) VALUES ('gone')`);
    await insert('gone', '100', 7, 9);
    await db.exec(`DELETE FROM "User" WHERE id = 'gone'`);
    expect((await db.query(`SELECT count(*)::int AS c FROM "RefereeRating"`)).rows[0]).toEqual({ c: 0 });
  });
});

describe('ortalama SQL', () => {
  it('maç ortalaması tek ondalık; silinmiş kullanıcı yer tutucusu sayılmaz', async () => {
    await insert('u1', '100', 7, 6);
    await insert('u2', '100', 7, 7);
    await insert('u3', '100', 7, 7);
    await insert(DELETED_USER_ID, '100', 7, 1);
    await insert('u1', '200', 7, 2);
    expect(toAggregate(await run(matchAggregateSql('100')))).toEqual({ average: 6.7, count: 3 });
  });

  it('oy yoksa ortalama null, sayı 0', async () => {
    expect(toAggregate(await run(matchAggregateSql('999')))).toEqual({ average: null, count: 0 });
    expect(toAggregate(await run(refereeAggregateSql(42)))).toEqual({ average: null, count: 0 });
  });

  it('hakem özeti: bütün maçlardaki oyların ortalaması; son puanlanan maçlar yeni önce, maç başı ortalama', async () => {
    await insert('u1', '100', 7, 4, '2026-10-20T18:00:00Z', 'A', 'B');
    await insert('u2', '100', 7, 6, '2026-10-20T18:00:00Z', 'A', 'B');
    await insert('u1', '200', 7, 9, '2026-11-01T18:00:00Z', 'C', 'D');
    await insert('u1', '300', 8, 1, '2026-11-02T18:00:00Z', 'E', 'F'); // başka hakem
    await insert(DELETED_USER_ID, '200', 7, 1, '2026-11-01T18:00:00Z', 'C', 'D');
    expect(toAggregate(await run(refereeAggregateSql(7)))).toEqual({ average: 6.3, count: 3 });
    expect(toRecent(await run(refereeRecentSql(7)))).toEqual([
      { matchId: '200', homeName: 'C', awayName: 'D', kickoffAt: '2026-11-01T18:00:00.000Z', average: 9, count: 1 },
      { matchId: '100', homeName: 'A', awayName: 'B', kickoffAt: '2026-10-20T18:00:00.000Z', average: 5, count: 2 },
    ]);
  });

  it('son maçlar sınırı uygulanır', async () => {
    for (let i = 1; i <= 7; i++) await insert('u1', String(i), 7, 5, `2026-10-0${i}T18:00:00Z`);
    const recent = toRecent(await run(refereeRecentSql(7, 5)));
    expect(recent.map((r) => r.matchId)).toEqual(['7', '6', '5', '4', '3']);
  });
});

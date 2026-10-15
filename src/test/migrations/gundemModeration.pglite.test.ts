import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Gündem moderasyonu migration'ı (20261016120000_gundem_moderation) GERÇEK Postgres motorunda (PGlite, bellek içi).
 * Canlıdaki mevcut tablolar (User / Post / PostComment) önce eski sütunlarla kurulur + satır eklenir; migration yalnız
 * boş bırakılabilir sütun ekler (mevcut satırlar bozulmaz), yeni tablolarda RLS açık ve anon / authenticated yetkisi yok,
 * ikinci çalıştırma hata vermez.
 */
const SQL = readFileSync(
  path.join(process.cwd(), 'prisma', 'migrations', '20261016120000_gundem_moderation', 'migration.sql'),
  'utf8',
);
const NEW_TABLES = ['UserBlock', 'ContentReport', 'GundemMention', 'ModerationAction', 'ModerationTerm', 'ModerationStat'];
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    CREATE TABLE "User" (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE "Post" (id TEXT PRIMARY KEY, "authorId" TEXT NOT NULL REFERENCES "User"(id), body TEXT NOT NULL);
    CREATE TABLE "PostComment" (id TEXT PRIMARY KEY, "postId" TEXT NOT NULL REFERENCES "Post"(id), body TEXT NOT NULL);
    INSERT INTO "User" VALUES ('u1', 'a@x'), ('u2', 'b@x');
    INSERT INTO "Post" VALUES ('p1', 'u1', 'eski');
    INSERT INTO "PostComment" VALUES ('c1', 'p1', 'eski yorum');
  `);
  await db.exec(SQL);
});

const one = async <T>(q: string) => (await db.query<T>(q)).rows[0]!;

describe('gundem_moderation migration (gerçek SQL)', () => {
  it('mevcut tablolara yalnız boş bırakılabilir sütun; eski satırlar NULL ile kalır', async () => {
    const cols = (await db.query<{ table_name: string; column_name: string; is_nullable: string }>(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns
       WHERE table_name IN ('User','Post','PostComment') AND column_name IN ('gundemSuspendedUntil','hiddenAt','hiddenReason')`,
    )).rows;
    expect(cols).toHaveLength(5);
    expect(cols.every((c) => c.is_nullable === 'YES')).toBe(true);
    expect(await one(`SELECT "hiddenAt" FROM "Post" WHERE id = 'p1'`)).toEqual({ hiddenAt: null });
  });

  it('yeni tablolarda RLS açık; anon / authenticated tablo yetkisi yok', async () => {
    for (const t of NEW_TABLES) {
      expect(await one(`SELECT relrowsecurity FROM pg_class WHERE relname = '${t}'`), t).toEqual({ relrowsecurity: true });
      for (const role of ['anon', 'authenticated']) {
        expect(await one(`SELECT has_table_privilege('${role}', '"${t}"', 'SELECT') AS ok`), `${t}/${role}`).toEqual({ ok: false });
      }
    }
  });

  it('benzersizlik ve CASCADE / SET NULL kuralları; ikinci çalıştırma hata vermez', async () => {
    await db.exec(`INSERT INTO "UserBlock" (id, "blockerId", "blockedId") VALUES ('b1', 'u1', 'u2')`);
    await expect(db.exec(`INSERT INTO "UserBlock" (id, "blockerId", "blockedId") VALUES ('b2', 'u1', 'u2')`)).rejects.toThrow();
    await db.exec(`INSERT INTO "ContentReport" (id, "targetKey", "targetType", "postId", "reporterId", reason)
                   VALUES ('r1', 'post:p1', 'POST', 'p1', 'u2', 'SPAM')`);
    await expect(db.exec(`INSERT INTO "ContentReport" (id, "targetKey", "targetType", "postId", "reporterId", reason)
                   VALUES ('r2', 'post:p1', 'POST', 'p1', 'u2', 'HATE')`)).rejects.toThrow();
    await db.exec(`DELETE FROM "UserBlock"; DELETE FROM "User" WHERE id = 'u2'`);
    expect(await one(`SELECT "reporterId", status FROM "ContentReport" WHERE id = 'r1'`)).toEqual({ reporterId: null, status: 'OPEN' });
    await expect(db.exec(SQL)).resolves.toBeDefined();
  });
});

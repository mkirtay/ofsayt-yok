import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Mini Saha migration'ı (20261121120000_mini_saha_progress) gerçek Postgres motorunda (PGlite, bellek içi — üretim
 * DB'sine bağlanmaz): RLS açık, anon/authenticated yetkisiz, kullanıcı silinince satır silinir, iki kez çalışabilir.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261121120000_mini_saha_progress', 'migration.sql'), 'utf8');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY);
    INSERT INTO "User" (id) VALUES ('u1'), ('u2');
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await db.exec(SQL);
});

describe('mini_saha_progress migration (gerçek SQL)', () => {
  it('RLS açık, anon / authenticated yetkisiz', async () => {
    expect((await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'MiniSahaProgress'`)).rows[0]).toEqual({ relrowsecurity: true });
    for (const role of ['anon', 'authenticated']) {
      const r = (await db.query<{ ok: boolean }>(`SELECT has_table_privilege('${role}', '"MiniSahaProgress"', 'SELECT') AS ok`)).rows[0]!;
      expect(r.ok, role).toBe(false);
    }
  });

  it('kullanıcı başına tek satır, dizi varsayılanı boş; kullanıcı silinince satır silinir', async () => {
    await db.query(`INSERT INTO "MiniSahaProgress" ("userId", "updatedAt") VALUES ('u1', now())`);
    const row = (await db.query<{ matches: number; unlocked: string[] }>(`SELECT matches, unlocked FROM "MiniSahaProgress" WHERE "userId" = 'u1'`)).rows[0]!;
    expect(row).toEqual({ matches: 0, unlocked: [] });
    await expect(db.query(`INSERT INTO "MiniSahaProgress" ("userId", "updatedAt") VALUES ('u1', now())`)).rejects.toThrow(/MiniSahaProgress_pkey/);
    await db.query(`INSERT INTO "MiniSahaProgress" ("userId", unlocked, "updatedAt") VALUES ('u2', ARRAY['dengeli','bomba'], now())`);
    await db.exec(`DELETE FROM "User" WHERE id = 'u2'`);
    expect((await db.query(`SELECT 1 FROM "MiniSahaProgress" WHERE "userId" = 'u2'`)).rows).toHaveLength(0);
  });

  it('tekrar çalıştırılabilir (IF NOT EXISTS / duplicate_object)', async () => {
    await expect(db.exec(SQL)).resolves.toBeDefined();
  });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Hesap silme denetim kaydı migration'ı (20261015120000_account_deletion_log) GERÇEK Postgres motorunda (PGlite, bellek
 * içi). Supabase rolleri taklit edilir: RLS açık, anon / authenticated yetkisi yok; tekrar çalıştırılabilir (IF NOT EXISTS).
 */
const SQL = readFileSync(
  path.join(process.cwd(), 'prisma', 'migrations', '20261015120000_account_deletion_log', 'migration.sql'),
  'utf8',
);
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await db.exec(SQL);
});

const one = async <T>(q: string) => (await db.query<T>(q)).rows[0]!;

describe('account_deletion_log migration (gerçek SQL)', () => {
  it('RLS açık, anon / authenticated tablo yetkisi yok', async () => {
    expect(await one(`SELECT relrowsecurity FROM pg_class WHERE relname = 'AccountDeletionLog'`)).toEqual({ relrowsecurity: true });
    for (const role of ['anon', 'authenticated']) {
      expect(await one(`SELECT has_table_privilege('${role}', '"AccountDeletionLog"', 'SELECT') AS ok`)).toEqual({ ok: false });
    }
  });

  it('kullanıcı kimliği / e-posta sütunu yok; satır yazılır; ikinci çalıştırma hata vermez', async () => {
    const cols = (await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'AccountDeletionLog' ORDER BY column_name`,
    )).rows.map((r) => r.column_name);
    expect(cols).toEqual(['accountAgeDays', 'counts', 'createdAt', 'hadPassword', 'id', 'oauthProviders', 'source']);
    await db.exec(`INSERT INTO "AccountDeletionLog" (id, source, "hadPassword", "oauthProviders", "accountAgeDays", counts)
      VALUES ('l1', 'web', true, ARRAY['google'], 3, '{"postsAnonymized":1}')`);
    expect(await one(`SELECT source, counts->>'postsAnonymized' AS n FROM "AccountDeletionLog"`)).toEqual({ source: 'web', n: '1' });
    await expect(db.exec(SQL)).resolves.toBeDefined();
  });
});

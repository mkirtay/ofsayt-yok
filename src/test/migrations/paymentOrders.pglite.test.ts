import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Hikie ödeme migration'ı (20261005120000_payment_orders) GERÇEK Postgres motorunda (PGlite, bellek içi — üretim DB'sine
 * bağlanmaz). Supabase rolleri (anon / authenticated) ve onların varsayılan tablo yetkisi taklit edilir; migration
 * RLS'i açmalı ve bu yetkileri geri almalı.
 */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261005120000_payment_orders', 'migration.sql'), 'utf8');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE "User" (id TEXT PRIMARY KEY);
    INSERT INTO "User" (id) VALUES ('u1');
    CREATE ROLE anon; CREATE ROLE authenticated;
    -- Supabase: public şemadaki yeni tablolara varsayılan yetki
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
  `);
  await db.exec(SQL);
});

const one = async <T>(q: string) => (await db.query<T>(q)).rows[0]!;

describe('payment_orders migration (gerçek SQL)', () => {
  it('RLS açık, anon / authenticated tablo yetkisi yok', async () => {
    for (const t of ['PaymentOrder', 'PaymentWebhookEvent']) {
      expect(await one<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname = '${t}'`)).toEqual({ relrowsecurity: true });
      for (const role of ['anon', 'authenticated']) {
        const r = await one<{ ok: boolean }>(`SELECT has_table_privilege('${role}', '"${t}"', 'SELECT') AS ok`);
        expect(r.ok, `${role} ${t}`).toBe(false);
      }
    }
  });

  it('merchantOrderId ve hikieOrderId tekil (null serbest), varsayılan PENDING, kullanıcı silinince sipariş silinir', async () => {
    await db.exec(`INSERT INTO "PaymentOrder" (id, "merchantOrderId", "userId", "packageKey", "amountTRY") VALUES ('p1', 'm1', 'u1', 'credits_10', 39.99), ('p2', 'm2', 'u1', 'credits_10', 39.99)`);
    expect(await one(`SELECT status, "amountTRY"::text AS amount FROM "PaymentOrder" WHERE id = 'p1'`)).toEqual({ status: 'PENDING', amount: '39.99' });
    await expect(db.exec(`INSERT INTO "PaymentOrder" (id, "merchantOrderId", "userId", "packageKey", "amountTRY") VALUES ('p3', 'm1', 'u1', 'x', 1)`)).rejects.toThrow();
    await db.exec(`UPDATE "PaymentOrder" SET "hikieOrderId" = 'inv_1', status = 'PAID' WHERE id = 'p1'`);
    await expect(db.exec(`UPDATE "PaymentOrder" SET "hikieOrderId" = 'inv_1' WHERE id = 'p2'`)).rejects.toThrow();
    await expect(db.exec(`UPDATE "PaymentOrder" SET status = 'BOGUS' WHERE id = 'p2'`)).rejects.toThrow();
    await db.exec(`DELETE FROM "User" WHERE id = 'u1'`);
    expect(await one(`SELECT count(*)::int AS n FROM "PaymentOrder"`)).toEqual({ n: 0 });
  });

  it('webhook kimliği tekil', async () => {
    await db.exec(`INSERT INTO "PaymentWebhookEvent" (id, event) VALUES ('wh_1', 'order.paid')`);
    await expect(db.exec(`INSERT INTO "PaymentWebhookEvent" (id, event) VALUES ('wh_1', 'order.paid')`)).rejects.toThrow();
  });
});

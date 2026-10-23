import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/** Kupon migration'ı (20261023120000_coupons) gerçek Postgres motorunda (PGlite, bellek içi): kısıtlar ve tekrar çalıştırma. */
const SQL = readFileSync(path.join(process.cwd(), 'prisma', 'migrations', '20261023120000_coupons', 'migration.sql'), 'utf8');
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE TABLE "User" (id TEXT PRIMARY KEY); INSERT INTO "User" VALUES ('u1'), ('u2'); CREATE ROLE anon; CREATE ROLE authenticated;`);
  await db.exec(SQL);
  await db.exec(SQL); // idempotent: ikinci uygulama hata vermez
});

const insertCoupon = (code: string, credits: number, max: number | null = null, count = 0) =>
  db.query(`INSERT INTO "Coupon" (id, code, credits, "maxRedemptions", "redeemedCount") VALUES ($1, $1, $2, $3, $4)`, [code, credits, max, count]);

describe('coupons migration', () => {
  it('kod tekil ve büyük harf; kredi pozitif', async () => {
    await insertCoupon('FUTBOL10', 10);
    await expect(insertCoupon('FUTBOL10', 10)).rejects.toThrow();
    await expect(db.query(`INSERT INTO "Coupon" (id, code, credits) VALUES ('x', 'futbol', 5)`)).rejects.toThrow();
    await expect(insertCoupon('SIFIR', 0)).rejects.toThrow();
  });

  it('sayaç toplam sınırı aşamaz (CHECK)', async () => {
    await insertCoupon('SINIRLI', 10, 1);
    await db.query(`UPDATE "Coupon" SET "redeemedCount" = "redeemedCount" + 1 WHERE code = 'SINIRLI'`);
    await expect(db.query(`UPDATE "Coupon" SET "redeemedCount" = "redeemedCount" + 1 WHERE code = 'SINIRLI'`)).rejects.toThrow();
  });

  it('kullanıcı başına bir kullanım; kupon silinince kullanımlar da gider', async () => {
    const ins = (u: string) => db.query(`INSERT INTO "CouponRedemption" (id, "couponId", "userId", credits) VALUES ($1, 'FUTBOL10', $2, 10)`, [`r-${u}-${Math.random()}`, u]);
    await ins('u1');
    await expect(ins('u1')).rejects.toThrow();
    await ins('u2');
    await db.query(`DELETE FROM "Coupon" WHERE code = 'FUTBOL10'`);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM "CouponRedemption"`);
    expect(rows[0]).toEqual({ n: 0 });
  });
});

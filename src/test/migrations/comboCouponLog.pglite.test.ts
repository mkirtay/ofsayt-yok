import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { evaluateCoupon, saveCouponLog, summarizeCouponResults } from '@/server/combo/couponLog';
import type { DailyPayload } from '@/server/combo/dailyCoupons';
import type { Exec } from '@/server/combo/oddsSnapshot';

/** Bekleyen migration (docs/migrations-pending/…combo_coupon_log) + upsert SQL'i bellek içi PGlite'ta — hiçbir DB'ye bağlanmaz. */
const SQL = readFileSync(path.join(process.cwd(), 'docs', 'migrations-pending', '20261112120000_combo_coupon_log', 'migration.sql'), 'utf8');
let db: PGlite;
const exec: Exec = async (t, v) => void (await db.query(t, v as unknown[]));
const future = () => new Date(Date.now() + 5 * 3600_000).toISOString();

const payload = (over: Partial<DailyPayload> = {}, odds = 2.1): DailyPayload => ({
  date: '2026-11-12', generatedAt: new Date().toISOString(), status: 'ok', analysed: 4, testData: false, thresholdRelaxed: false,
  coupons: [{ kind: 'safe', legs: [{ matchId: '1', homeName: 'A', awayName: 'B', kickoffIso: future(), key: 'over15', pct: 80, odd: 1.4, national: false, source: 'db' }], probability: 0.8, odds, breakEven: 1 / odds, relaxed: false, targetReached: true, targetOdds: 1.7 }],
  ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;`);
  await db.exec(SQL);
});
beforeEach(async () => void (await db.exec(`DELETE FROM "ComboCouponLog"`)));
const rows = async () => (await db.query<Record<string, unknown>>(`SELECT * FROM "ComboCouponLog"`)).rows;

describe('ComboCouponLog', () => {
  it('migration iki kez çalışır; RLS açık; anon yetkisiz', async () => {
    await db.exec(SQL);
    expect((await db.query(`SELECT relrowsecurity FROM pg_class WHERE relname='ComboCouponLog'`)).rows[0]).toEqual({ relrowsecurity: true });
    expect((await db.query(`SELECT has_table_privilege('anon','"ComboCouponLog"','SELECT') AS ok`)).rows[0]).toEqual({ ok: false });
  });
  it('(gün, tür) başına tek satır; ilk maç başlamadan tekrar çalışırsa güncellenir', async () => {
    await saveCouponLog(exec, payload());
    await saveCouponLog(exec, payload({}, 3));
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'safe', odds: 3, hit: null });
  });
  it('sonuçlanmış kupon ezilmez', async () => {
    await saveCouponLog(exec, payload());
    await db.exec(`UPDATE "ComboCouponLog" SET "settledAt" = now(), hit = true`);
    await saveCouponLog(exec, payload({}, 9));
    expect((await rows())[0]).toMatchObject({ odds: 2.1, hit: true });
  });
  it('insufficient yazılmaz; tablo yok → atla; başka hata fırlatılır', async () => {
    expect(await saveCouponLog(exec, payload({ status: 'insufficient', coupons: [] }))).toEqual({ written: 0 });
    const missing: Exec = async () => { throw Object.assign(new Error('relation "ComboCouponLog" does not exist'), { code: '42P01' }); };
    expect(await saveCouponLog(missing, payload())).toEqual({ written: 0, skipped: 'no-table' });
    await expect(saveCouponLog(async () => { throw new Error('boom'); }, payload())).rejects.toThrow('boom');
  });
});

describe('evaluateCoupon', () => {
  const legs = [{ matchId: '1', key: 'over15' as const, pct: 80 }, { matchId: '2', key: 'btts' as const, pct: 70 }];
  it('hepsi tutarsa hit; tek ıska miss (kalanlar bekliyor olsa da); bilinmeyen ve ıska yoksa pending', () => {
    const o = (m: Record<string, string>) => new Map(Object.entries(m).map(([k, v]) => [k, { score: v }] as const));
    expect(evaluateCoupon(legs, o({ '1': '2-1', '2': '1-1' })).status).toBe('hit');
    expect(evaluateCoupon(legs, o({ '1': '0-0' })).status).toBe('miss');
    expect(evaluateCoupon(legs, o({ '1': '3-0' })).status).toBe('pending');
    expect(evaluateCoupon(legs, o({ '1': '2-1', '2': '2-0' }))).toMatchObject({ status: 'miss', legHits: [true, false] });
    expect(evaluateCoupon(legs, new Map()).status).toBe('pending');
  });
  it('özet: tutan / bekleyen, tutan kuponların oranıyla düz 1 birim kâr', () => {
    const s = summarizeCouponResults([
      { odds: 3, result: { status: 'hit', legHits: [] } },
      { odds: 2, result: { status: 'miss', legHits: [] } },
      { odds: 2, result: { status: 'pending', legHits: [] } },
    ]);
    expect(s).toMatchObject({ total: 3, pending: 1, settled: 2, hits: 1, hitRate: 0.5, profit: 1, profitCoupons: 2 });
  });
});

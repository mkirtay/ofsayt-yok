import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Kredi modeli v2 migration'ları (A: 20261003170000_credit_model_v2, B: 20261003170100_credit_default_zero) GERÇEK bir
 * Postgres motorunda (PGlite, bellek içi — üretim DB'sine bağlanmaz). Başlangıç: v2'den hemen önceki şemanın tam SQL'i
 * (fixtures/pre-credit-v2.sql — migration geçmişi tek başına kurmuyor, bkz. dosya başı) + credit_safety'nin CHECK kısıtı.
 * A'dan önce 2026-10 öncesi durumu temsil eden veri yazılır; geri doldurma (karar 9) ve B'nin varsayılanı doğrulanır.
 */
const DIR = path.join(process.cwd(), 'prisma', 'migrations');
const A = '20261003170000_credit_model_v2';
const B = '20261003170100_credit_default_zero';
const sql = (name: string) => readFileSync(path.join(DIR, name, 'migration.sql'), 'utf8');

let db: PGlite;

async function rows<T>(q: string): Promise<T[]> {
  return (await db.query<T>(q)).rows;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, 'fixtures', 'pre-credit-v2.sql'), 'utf8'));
  // Üretimde uygulanmış credit_safety kısıtı (Prisma şemasında görünmez → sabitte yok).
  const check = sql('20261002160000_credit_safety').match(/ALTER TABLE "User" ADD CONSTRAINT[^;]+;/)![0];
  await db.exec(check);

  // 2026-10 öncesi veri: u1 eski (5 kredilik) üretim SETTLED + status'suz eski satır, u2 ADMIN kredisiz üretim (ANALYSIS_FREE),
  // u3 iade edilen harcama (açık SAYILMAZ), u4 analizi hiç kaydedilmemiş harcama, u1 aynı analiz için iki satır (tek açma).
  await db.exec(`
    INSERT INTO "User" (id, email, credits, "updatedAt") VALUES
      ('u1', 'u1@x', 12, now()), ('u2', 'u2@x', 0, now()), ('u3', 'u3@x', 5, now()), ('u4', 'u4@x', 0, now());
    INSERT INTO "MatchAnalysis" (id, "matchId", "matchStatus", "modelVersion", "homeTeamName", "awayTeamName",
      "homeTeamNarrative", "awayTeamNarrative", "matchPrediction", "scorePrediction", "goalExpectation", "bettingTips",
      "teamAnalyses", "riskLevel", "riskReasoning", "confidenceScore")
    VALUES
      ('a1', '100', 'PRE', 'v', 'H', 'A', '', '', '{}', '{}', '{}', '[]', '{}', 'low', '', 50),
      ('a2', '200', 'PRE', 'v', 'H', 'A', '', '', '{}', '{}', '{}', '[]', '{}', 'low', '', 50),
      ('a3', '300', 'PRE', 'v', 'H', 'A', '', '', '{}', '{}', '{}', '[]', '{}', 'low', '', 50);
    INSERT INTO "CreditTransaction" (id, "userId", type, amount, "balanceAfter", "matchId", status, "createdAt") VALUES
      ('t1', 'u1', 'ANALYSIS_SPEND', -5, 7, '100', 'SETTLED', '2026-09-01'),
      ('t1b', 'u1', 'ANALYSIS_SPEND', -5, 2, '100', NULL, '2026-09-02'),
      ('t2', 'u1', 'ANALYSIS_SPEND', -5, 12, '200', NULL, '2026-08-01'),
      ('t3', 'u2', 'ANALYSIS_FREE', 0, 0, '100', NULL, '2026-09-03'),
      ('t4', 'u3', 'ANALYSIS_SPEND', -5, 0, '300', 'REFUNDED', '2026-09-04'),
      ('t5', 'u4', 'ANALYSIS_SPEND', -5, 0, '999', 'SETTLED', '2026-09-05'),
      ('t6', 'u1', 'SIGNUP_BONUS', 5, 5, NULL, NULL, '2026-07-01');
  `);
  await db.exec(sql(A));
});

describe('kredi modeli v2 migration A (gerçek SQL)', () => {
  it('karar 9: üretenlere LEGACY açma — iade edilen ve analizi olmayan harcama hariç, kullanıcı × analiz başına bir', async () => {
    const u = await rows<{ userId: string; matchAnalysisId: string; source: string; creditTransactionId: string }>(
      `SELECT "userId", "matchAnalysisId", source, "creditTransactionId" FROM "AnalysisUnlock" ORDER BY "userId", "matchAnalysisId"`,
    );
    expect(u).toEqual([
      { userId: 'u1', matchAnalysisId: 'a1', source: 'LEGACY', creditTransactionId: 't1' },
      { userId: 'u1', matchAnalysisId: 'a2', source: 'LEGACY', creditTransactionId: 't2' },
      { userId: 'u2', matchAnalysisId: 'a1', source: 'LEGACY', creditTransactionId: 't3' },
    ]);
  });

  it('bakiyeler aynen kalır; geri doldurma tekrar çalıştırılırsa çift satır yazmaz', async () => {
    expect(await rows(`SELECT id, credits FROM "User" ORDER BY id`)).toEqual([
      { id: 'u1', credits: 12 },
      { id: 'u2', credits: 0 },
      { id: 'u3', credits: 5 },
      { id: 'u4', credits: 0 },
    ]);
    const backfill = sql(A).slice(sql(A).indexOf('INSERT INTO "AnalysisUnlock"'));
    await db.exec(backfill);
    expect((await rows<{ n: number }>(`SELECT count(*)::int AS n FROM "AnalysisUnlock"`))[0]!.n).toBe(3);
  });

  it('yeni alanlar / tekil kısıtlar: aynı kullanıcı aynı analizi ikinci kez açamaz; referralCode tekil; CHECK credits >= 0 duruyor', async () => {
    await expect(
      db.exec(`INSERT INTO "AnalysisUnlock" (id, "userId", "matchAnalysisId", "matchId", source) VALUES ('x', 'u1', 'a1', '100', 'CREDIT')`),
    ).rejects.toThrow(/duplicate key/);
    await db.exec(`UPDATE "User" SET "referralCode" = 'ABC12345', "premiumUntil" = now() + interval '30 days' WHERE id = 'u1'`);
    await expect(db.exec(`UPDATE "User" SET "referralCode" = 'ABC12345' WHERE id = 'u2'`)).rejects.toThrow(/duplicate key/);
    await expect(db.exec(`UPDATE "User" SET credits = -1 WHERE id = 'u2'`)).rejects.toThrow(/User_credits_nonnegative/);
  });

  it('A sonrası (deploy arası) yeni kayıt hâlâ 5 ile başlar; B sonrası 0', async () => {
    await db.exec(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('n1', 'n1@x', now())`);
    expect((await rows<{ credits: number }>(`SELECT credits FROM "User" WHERE id = 'n1'`))[0]!.credits).toBe(5);
    await db.exec(sql(B));
    await db.exec(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('n2', 'n2@x', now())`);
    expect((await rows<{ credits: number }>(`SELECT credits FROM "User" WHERE id = 'n2'`))[0]!.credits).toBe(0);
  });

  it('geri alma SQL\'i (A + B) tabloları / alanları kaldırır, varsayılanı 5 yapar, bakiyeler ve defter kalır', async () => {
    // _prisma_migrations Prisma'nın tablosu; testte boş bir eşi yeterli.
    await db.exec(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (migration_name TEXT)`);
    await db.exec(readFileSync(path.join(process.cwd(), 'prisma', 'rollback', '20261003_credit_model_v2_down.sql'), 'utf8'));
    const tables = await rows<{ t: string }>(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_name IN ('AnalysisUnlock', 'PremiumGrant', 'Referral')`,
    );
    expect(tables).toEqual([]);
    const cols = await rows<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'User' AND column_name IN ('premiumUntil', 'referralCode', 'referredById')`,
    );
    expect(cols).toEqual([]);
    await db.exec(`INSERT INTO "User" (id, email, "updatedAt") VALUES ('n3', 'n3@x', now())`);
    expect((await rows<{ credits: number }>(`SELECT credits FROM "User" WHERE id = 'n3'`))[0]!.credits).toBe(5);
    expect((await rows<{ credits: number }>(`SELECT credits FROM "User" WHERE id = 'u1'`))[0]!.credits).toBe(12);
    expect((await rows<{ n: number }>(`SELECT count(*)::int AS n FROM "CreditTransaction"`))[0]!.n).toBe(7);
  });
});

# Kredi modeli v2 — migration uygulama talimatı

Plan: `docs/kredi-modeli-v2-plan.md`. Migration'lar:

| | Dosya | Ne zaman | İçerik |
|---|---|---|---|
| **A** | `prisma/migrations/20261003170000_credit_model_v2/migration.sql` | **Deploy ÖNCESİ** | Yalnız ekleme: `User.premiumUntil/referralCode/referredById`, `CreditTransaction.actorId`, `AnalysisUnlock`, `PremiumGrant`, `Referral` + eski üretimlerin açma kayıtları (karar 9). Bakiyelere dokunmaz. |
| **B** | `prisma/migrations/20261003170100_credit_default_zero/migration.sql` | **Deploy SONRASI** | `User.credits` varsayılanı 5 → 0 (yalnız yeni kayıtlar). |
| Geri alma | `prisma/rollback/20261003_credit_model_v2_down.sql` | Gerekirse, kod geri alındıktan sonra | A + B'yi kaldırır. |

A ve B (ve geri alma) gerçek bir Postgres motorunda (PGlite, bellek içi) test edildi:
`src/test/migrations/creditModelV2.pglite.test.ts`.

**Sıra zorunlu:** A → kod deploy → B. A'dan önce kod giderse analiz açma 500 verir (yeni tablolar yok). B, A ile deploy arasında
uygulanırsa o aradaki Google kayıtları 0 kredi + "bonus verildi" kaydıyla kalır (2 krediyi hiç almazlar).

## 1. Salt okunur ön kontrol (Supabase → SQL Editor)

```sql
SELECT count(*) AS negatif FROM "User" WHERE credits < 0;                       -- 0 olmalı
SELECT count(*) AS acilacak FROM "CreditTransaction" t
JOIN "MatchAnalysis" a ON a."matchId" = t."matchId" AND a."matchStatus" = 'PRE'
WHERE t.type IN ('ANALYSIS_SPEND', 'ANALYSIS_FREE') AND (t.status IS NULL OR t.status <> 'REFUNDED');
                                                                                 -- geri doldurmanın üst sınırı
SELECT column_name FROM information_schema.columns
WHERE table_name = 'User' AND column_name IN ('premiumUntil', 'referralCode', 'referredById');   -- boş olmalı
```

## 2. Migration A (deploy öncesi)

SQL Editor'e `20261003170000_credit_model_v2/migration.sql`'in **tamamını değiştirmeden** `BEGIN;` … `COMMIT;` arasına
yapıştırıp çalıştır. Hata olursa hiçbir şey kalmaz.

Doğrula:

```sql
SELECT source, count(*) FROM "AnalysisUnlock" GROUP BY 1;          -- yalnız LEGACY, sayı ≤ ön kontroldeki "acilacak"
SELECT conname FROM pg_constraint WHERE conname IN ('User_credits_nonnegative', 'AnalysisUnlock_userId_fkey');
```

Prisma geçmişine işle (yerelde, üretim `DIRECT_URL`'i `.env.local`'de):

```bash
npx dotenv -e .env.local -- npx prisma migrate resolve --applied 20261003170000_credit_model_v2
```

Yerelden bağlanmak istemezsen SQL Editor'den (checksum = dosyanın SHA-256'sı; dosya commit'ten sonra değişmemeli):

```sql
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '01a1d8391cef8785e9cd3c845742ac2b5c723083d7eb81030177217018dbb14e', now(),
        '20261003170000_credit_model_v2', NULL, NULL, now(), 1);
```

> `prisma migrate status` bu projede tam temiz çıkmayabilir: migration geçmişi `CreditTransaction`, `MatchCommentLike`,
> `MatchAnalysis.fullReport`, `PredictionRecord.extendedPredictions/extendedHits`'i oluşturmuyor (bunlar `db push` ile
> eklenmiş). Üretim DB'si doğru; yalnız geçmiş eksik. Ayrı iş olarak bir "baseline düzeltme" migration'ı önerilir.
> **`prisma migrate deploy` kullanma** — bekleyen başka bir şey varsa onu da çalıştırır; SQL Editor + `resolve` yeterli.

## 3. Kod deploy (push)

## 4. Migration B (deploy sonrası)

Aynı yol: `20261003170100_credit_default_zero/migration.sql`'i SQL Editor'de çalıştır, sonra

```bash
npx dotenv -e .env.local -- npx prisma migrate resolve --applied 20261003170100_credit_default_zero
```

ya da checksum `08633a6c9e21c0b8fc64b4fb80b3e7bfff969345940eac000a688388da2258a4` ile aynı INSERT.

Doğrula:

```sql
SELECT column_default FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'credits';   -- 0
```

## Geri alma

Önce kodu geri al (revert + deploy). Sonra `prisma/rollback/20261003_credit_model_v2_down.sql` (kendi `BEGIN/COMMIT`'i var).
Açma kayıtları, premium geçmişi ve davetler silinir; bakiyeler ve kredi defteri kalır.

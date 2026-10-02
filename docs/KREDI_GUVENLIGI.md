# Kredi güvenliği — migration uygulama talimatı

Kod: `src/lib/credits.ts` (atomik düşüm, `reserveCredits` → `settleCredits` / `refundCredits`, `refundStalePendingSpends`),
`src/pages/api/matches/[id]/analysis.ts`. Migration: `prisma/migrations/20261002160000_credit_safety/migration.sql`.

**Sıra zorunlu: önce migration, sonra push.** Yeni kod `CreditTransaction.idempotencyKey/status/refundOfId` sütunlarını
kullanır; migration'sız deploy edilirse analiz üretimi 500 verir. Migration yalnız ekleme yapar (boş bırakılabilir
sütunlar, indeksler, CHECK) — uygulandıktan sonra şu anki canlı kod etkilenmez.

## 1. Salt okunur ön kontrol (Supabase → SQL Editor)

```sql
SELECT count(*) AS negatif_bakiye FROM "User" WHERE credits < 0;
```

0 değilse dur: CHECK kısıtı eklenemez. Önce o hesapları incele.

İsteğe bağlı, geçmişte etkilenenler (salt okunur; migration'dan önce ya da sonra çalışır):

```sql
-- a) Bakiye ≠ defter toplamı. fark > 0: düşüm kaybolmuş (kullanıcı kazançlı, eşzamanlı istek);
--    fark < 0: ekleme kaybolmuş (kullanıcı zararda — admin tanımıyla yarış).
--    fark = +5 ve SIGNUP_BONUS satırı yok: defter öncesi açılmış hesap (yarış değil).
SELECT u.id, u.email, u.credits AS bakiye,
       COALESCE(SUM(t.amount), 0) AS defter_toplami,
       u.credits - COALESCE(SUM(t.amount), 0) AS fark
FROM "User" u
LEFT JOIN "CreditTransaction" t ON t."userId" = u.id
GROUP BY u.id, u.email, u.credits
HAVING u.credits <> COALESCE(SUM(t.amount), 0)
ORDER BY fark;

-- b) Analizi olmayan harcama (AI hatası / zaman aşımı / fonksiyon öldü → kredi gitti, analiz yok).
--    Yeni kod canlıya çıktıktan sonra çalıştırılırsa iade edilenleri ayıklamak için şu koşulu da ekle:
--    AND (t.status IS NULL OR t.status <> 'REFUNDED')
SELECT t.id, u.email, t."matchId", t.amount, t."balanceAfter", t."createdAt"
FROM "CreditTransaction" t
JOIN "User" u ON u.id = t."userId"
LEFT JOIN "MatchAnalysis" a ON a."matchId" = t."matchId" AND a."matchStatus" = 'PRE'
WHERE t.type = 'ANALYSIS_SPEND' AND a.id IS NULL
ORDER BY t."createdAt" DESC;
```

## 2. Migration'ı uygula — SQL Editor + `prisma migrate resolve`

Seçilen yol bu (gerekçe aşağıda). SQL Editor'e **migration.sql'in tamamını** `BEGIN;` … `COMMIT;` arasına alarak yapıştır
ve çalıştır:

```sql
BEGIN;
-- prisma/migrations/20261002160000_credit_safety/migration.sql içeriği (değiştirmeden)
COMMIT;
```

Hata olursa (ör. CHECK) işlem tümüyle geri alınır, veritabanında hiçbir şey kalmaz; sorunu çöz ve tekrar çalıştır.

Doğrula (salt okunur):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'CreditTransaction' AND column_name IN ('idempotencyKey', 'status', 'refundOfId');
SELECT indexname FROM pg_indexes WHERE tablename = 'CreditTransaction';
SELECT conname FROM pg_constraint WHERE conname = 'User_credits_nonnegative';
```

## 3. Prisma geçmişine işle

Yerelde (üretim `DIRECT_URL`'i `.env.local`'de):

```bash
npx dotenv -e .env.local -- npx prisma migrate status
npx dotenv -e .env.local -- npx prisma migrate resolve --applied 20261002160000_credit_safety
npx dotenv -e .env.local -- npx prisma migrate status
```

Önceki `status` yalnız `20261002160000_credit_safety`'yi bekleyen göstermeli; sonraki "Database schema is up to date".
`resolve --applied` SQL çalıştırmaz, yalnız `_prisma_migrations`'a dosyanın checksum'ıyla satır yazar.

Yerelden bağlanmak istemezsen aynı satırı SQL Editor'den de yazabilirsin (checksum = migration.sql'in SHA-256'sı;
dosya commit'ten sonra değişmemeli):

```sql
INSERT INTO "_prisma_migrations"
  (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES
  (gen_random_uuid()::text,
   '872670495ac919d158ee0503c789bec2b52b18f8204240e5d17c387f95a85de4',
   now(), '20261002160000_credit_safety', NULL, NULL, now(), 1);
```

### Neden `migrate deploy` değil?

- **Ön kontrol ve uygulama aynı yerde, aynı oturumda.** Sayım sorgusunu çalıştırıp sonucu görmeden migration başlamaz.
- **Hata durumu temiz.** SQL Editor'de `BEGIN/COMMIT` ile ya hepsi uygulanır ya hiçbiri. `migrate deploy` yarıda
  kalan migration'ı `_prisma_migrations`'a "başarısız" diye yazar; sonraki her `deploy` P3009 ile durur ve önce elle
  `migrate resolve --rolled-back` gerekir.
- **Ne çalıştığını görürsün.** `deploy` bekleyen TÜM migration'ları uygular; geçmiş üretimle uyumsuzsa (bu projede şema
  bir dönem `db push` ile yönetildi, bkz. MIGRATION_STRATEJISI.md) beklenmedik bir dosyayı da çalıştırabilir.
- `deploy` de güvenli bir seçenek, ama ancak `migrate status` yalnız bu migration'ı bekleyen gösteriyorsa ve `DIRECT_URL`
  havuzsuz bağlantıysa.

## 4. Push

Migration uygulanıp `migrate status` temiz olduktan sonra kredi commit'i push edilir. Deploy sonrası: bir analiz üret
(kredili hesapla) → `/profile` kredi geçmişinde tek −5; hata senaryosunda −5 ve +5 (İade).

## Geri alma

Önce kodu geri al (revert + deploy) — yeni kod sütunlar olmadan çalışmaz. Sonra:

```sql
BEGIN;
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_credits_nonnegative";
DROP INDEX IF EXISTS "CreditTransaction_userId_idempotencyKey_key";
DROP INDEX IF EXISTS "CreditTransaction_status_createdAt_idx";
DROP INDEX IF EXISTS "CreditTransaction_refundOfId_key";
ALTER TABLE "CreditTransaction"
  DROP COLUMN IF EXISTS "idempotencyKey",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "refundOfId";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261002160000_credit_safety';
COMMIT;
```

REFUND satırları defterde kalır (tutarlar doğru); yalnız harcama ↔ iade bağı ve harcama durumları silinir.

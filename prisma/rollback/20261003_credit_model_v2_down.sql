-- Kredi modeli v2 GERİ ALMA (A + B). ÖNCE kodu geri al (revert + deploy) — v2 kodu bu tablolar olmadan çalışmaz.
-- Açma kayıtları (AnalysisUnlock), premium geçmişi ve davetler SİLİNİR; kredi bakiyeleri ve defter satırları kalır.
BEGIN;
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 5;
DROP TABLE IF EXISTS "AnalysisUnlock";
DROP TABLE IF EXISTS "PremiumGrant";
DROP TABLE IF EXISTS "Referral";
DROP INDEX IF EXISTS "User_referralCode_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "premiumUntil", DROP COLUMN IF EXISTS "referralCode", DROP COLUMN IF EXISTS "referredById";
ALTER TABLE "CreditTransaction" DROP COLUMN IF EXISTS "actorId";
DELETE FROM "_prisma_migrations" WHERE migration_name IN ('20261003170000_credit_model_v2', '20261003170100_credit_default_zero');
COMMIT;

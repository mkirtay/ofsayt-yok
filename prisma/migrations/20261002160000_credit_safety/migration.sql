-- Kredi güvenliği: harcama tekrar anahtarı, harcama durumu, iade bağı (yalnız ekleme — eski kod etkilenmez).
-- Uygulamadan önce salt okunur kontrol 0 dönmeli: SELECT count(*) FROM "User" WHERE credits < 0;

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "refundOfId" TEXT,
ADD COLUMN     "status" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_refundOfId_key" ON "CreditTransaction"("refundOfId");

-- CreateIndex
CREATE INDEX "CreditTransaction_status_createdAt_idx" ON "CreditTransaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_userId_idempotencyKey_key" ON "CreditTransaction"("userId", "idempotencyKey");

-- Güvenlik ağı: bakiye hiçbir yoldan eksiye inemez (Prisma şemasında görünmez; migrate diff'i kaldırmaya çalışmaz).
ALTER TABLE "User" ADD CONSTRAINT "User_credits_nonnegative" CHECK ("credits" >= 0);

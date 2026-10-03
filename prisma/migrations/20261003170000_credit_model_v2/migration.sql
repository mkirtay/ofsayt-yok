-- Kredi modeli v2 — A (deploy ÖNCESİ): yalnız ekleme; bakiyelere dokunmaz. Uygulama: docs/KREDI_MODELI_V2_MIGRATION.md

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "premiumUntil" TIMESTAMP(3),
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT;

-- AlterTable
ALTER TABLE "CreditTransaction" ADD COLUMN     "actorId" TEXT;

-- CreateTable
CREATE TABLE "AnalysisUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchAnalysisId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "creditTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PremiumGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "until" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PremiumGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisUnlock_creditTransactionId_key" ON "AnalysisUnlock"("creditTransactionId");

-- CreateIndex
CREATE INDEX "AnalysisUnlock_matchAnalysisId_idx" ON "AnalysisUnlock"("matchAnalysisId");

-- CreateIndex
CREATE INDEX "AnalysisUnlock_userId_createdAt_idx" ON "AnalysisUnlock"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisUnlock_userId_matchAnalysisId_key" ON "AnalysisUnlock"("userId", "matchAnalysisId");

-- CreateIndex
CREATE INDEX "PremiumGrant_userId_createdAt_idx" ON "PremiumGrant"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeId_key" ON "Referral"("refereeId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_createdAt_idx" ON "Referral"("referrerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "AnalysisUnlock" ADD CONSTRAINT "AnalysisUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisUnlock" ADD CONSTRAINT "AnalysisUnlock_matchAnalysisId_fkey" FOREIGN KEY ("matchAnalysisId") REFERENCES "MatchAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PremiumGrant" ADD CONSTRAINT "PremiumGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Karar 9: 2026-10 öncesi üretilmiş / açılmış analizler, onları üreten kullanıcıya açık (iade edilenler hariç).
-- Harcama satırının matchId'si rota parametresi, analizinki Sportmonks fixture id'si (aynı değer). Kullanıcı × analiz
-- başına en eski satır; kimlik deterministik ('legacy_' || defter id) → tekrar çalıştırmaya karşı ON CONFLICT.
INSERT INTO "AnalysisUnlock" ("id", "userId", "matchAnalysisId", "matchId", "source", "creditTransactionId", "createdAt")
SELECT DISTINCT ON (t."userId", a."id")
       'legacy_' || t."id", t."userId", a."id", a."matchId", 'LEGACY', t."id", t."createdAt"
FROM "CreditTransaction" t
JOIN "MatchAnalysis" a ON a."matchId" = t."matchId" AND a."matchStatus" = 'PRE'
WHERE t."type" IN ('ANALYSIS_SPEND', 'ANALYSIS_FREE')
  AND (t."status" IS NULL OR t."status" <> 'REFUNDED')
ORDER BY t."userId", a."id", t."createdAt"
ON CONFLICT DO NOTHING;

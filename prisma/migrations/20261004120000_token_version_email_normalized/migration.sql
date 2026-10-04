-- Güvenlik denetimi (2026-10-04): oturum iptali + e-posta normalizasyonu. Deploy ÖNCESİ uygulanır (eski kod yeni
-- sütunları görmez; yeni kod sütunlar yoksa oturum kontrolünde hata verir).

-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailNormalized" TEXT,
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

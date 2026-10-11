-- Tahmin oyunu (ücretsiz, ödülsüz skor tahmini): hafta, haftanın maçı, tahmin, kullanıcı × hafta özeti. Yalnız YENİ tablolar
-- ve enum'lar; mevcut tablolara dokunmaz → deploy ÖNCESİ uygulanır (eski kod görmez). Zaman damgası payments dalındaki
-- 20261007120000 ve main'deki 20261008120000'dan sonra. RLS açık, politika yok; anon / authenticated yetkileri geri alınır
-- (mevcut desen: 20261008120000_frikik_daily_score). Plan: docs/TAHMIN_OYUNU_PLANI.md.

-- CreateEnum
CREATE TYPE "GameWeekStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SETTLED');

-- CreateEnum
CREATE TYPE "GameMatchStatus" AS ENUM ('SCHEDULED', 'FINISHED', 'VOID');

-- CreateTable
CREATE TABLE "GameWeek" (
    "id" TEXT NOT NULL,
    "weekKey" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "status" "GameWeekStatus" NOT NULL DEFAULT 'DRAFT',
    "scoringVersion" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameWeek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameMatch" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "fixtureId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" "GameMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "distribution" JSONB,
    "settledAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "checkedAt" TIMESTAMP(3),

    CONSTRAINT "GameMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GamePrediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gameMatchId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "home" INTEGER NOT NULL,
    "away" INTEGER NOT NULL,
    "revisions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points" INTEGER,
    "breakdown" JSONB,

    CONSTRAINT "GamePrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameWeekEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "jokerGameMatchId" TEXT,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "exactCount" INTEGER NOT NULL DEFAULT 0,
    "directionCount" INTEGER NOT NULL DEFAULT 0,
    "lastChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameWeekEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GameWeek_weekKey_key" ON "GameWeek"("weekKey");

-- CreateIndex
CREATE INDEX "GameWeek_season_startsAt_idx" ON "GameWeek"("season", "startsAt");

-- CreateIndex
CREATE INDEX "GameWeek_status_startsAt_idx" ON "GameWeek"("status", "startsAt");

-- CreateIndex
CREATE INDEX "GameMatch_status_kickoffAt_idx" ON "GameMatch"("status", "kickoffAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameMatch_weekId_fixtureId_key" ON "GameMatch"("weekId", "fixtureId");

-- CreateIndex
CREATE INDEX "GamePrediction_gameMatchId_idx" ON "GamePrediction"("gameMatchId");

-- CreateIndex
CREATE INDEX "GamePrediction_weekId_userId_idx" ON "GamePrediction"("weekId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GamePrediction_userId_gameMatchId_key" ON "GamePrediction"("userId", "gameMatchId");

-- CreateIndex
CREATE INDEX "GameWeekEntry_weekId_totalPoints_idx" ON "GameWeekEntry"("weekId", "totalPoints");

-- CreateIndex
CREATE INDEX "GameWeekEntry_season_userId_idx" ON "GameWeekEntry"("season", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameWeekEntry_userId_weekId_key" ON "GameWeekEntry"("userId", "weekId");

-- AddForeignKey
ALTER TABLE "GameMatch" ADD CONSTRAINT "GameMatch_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "GameWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePrediction" ADD CONSTRAINT "GamePrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GamePrediction" ADD CONSTRAINT "GamePrediction_gameMatchId_fkey" FOREIGN KEY ("gameMatchId") REFERENCES "GameMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeekEntry" ADD CONSTRAINT "GameWeekEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameWeekEntry" ADD CONSTRAINT "GameWeekEntry_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "GameWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: açık, politika yok → Supabase anon / authenticated rolleri satır göremez; tablo yetkileri de geri alınır.
-- Roller yoksa (yerel / test Postgres) atlanır.
ALTER TABLE "GameWeek" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameMatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GamePrediction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameWeekEntry" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      FOREACH t IN ARRAY ARRAY['GameWeek', 'GameMatch', 'GamePrediction', 'GameWeekEntry'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
      END LOOP;
    END IF;
  END LOOP;
END $$;

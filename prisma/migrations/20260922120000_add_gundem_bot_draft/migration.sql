-- CreateEnum
CREATE TYPE "BotDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'POSTED', 'STALE');

-- CreateTable
CREATE TABLE "GundemBotDraft" (
    "id" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fixtureId" INTEGER NOT NULL,
    "eventId" INTEGER,
    "body" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "warnings" TEXT[],
    "status" "BotDraftStatus" NOT NULL DEFAULT 'PENDING',
    "postId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GundemBotDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GundemBotDraft_externalKey_key" ON "GundemBotDraft"("externalKey");

-- CreateIndex
CREATE INDEX "GundemBotDraft_status_createdAt_idx" ON "GundemBotDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GundemBotDraft_fixtureId_idx" ON "GundemBotDraft"("fixtureId");

-- ÜRETİLDİ — kredi modeli v2'den hemen önceki şema (0b9d2ab'deki prisma/schema.prisma), boş DB'den tam SQL:
--   git show 0b9d2ab:prisma/schema.prisma > /tmp/s.prisma
--   npx prisma migrate diff --from-empty --to-schema-datamodel /tmp/s.prisma --script
-- Migration geçmişi tek başına bu şemayı kurmuyor (CreditTransaction, MatchCommentLike vb. db push ile eklenmiş),
-- bu yüzden migration testleri bu sabitten başlar. Üretim DB'si bu şemadadır + credit_safety'nin CHECK kısıtı.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PostAuthorType" AS ENUM ('USER', 'OFFICIAL_BOT');

-- CreateEnum
CREATE TYPE "BotDraftStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'POSTED', 'STALE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "username" TEXT,
    "bio" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "credits" INTEGER NOT NULL DEFAULT 5,
    "favoriteTeamIds" INTEGER[],
    "favoriteLeagueIds" INTEGER[],
    "signupUtmSource" TEXT,
    "signupUtmMedium" TEXT,
    "signupUtmCampaign" TEXT,
    "firstTouchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "matchId" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "status" TEXT,
    "refundOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchAnalysis" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "competitionId" TEXT,
    "competitionName" TEXT,
    "homeTeamNarrative" TEXT NOT NULL,
    "awayTeamNarrative" TEXT NOT NULL,
    "matchPrediction" JSONB NOT NULL,
    "scorePrediction" JSONB NOT NULL,
    "goalExpectation" JSONB NOT NULL,
    "bettingTips" JSONB NOT NULL,
    "teamAnalyses" JSONB NOT NULL,
    "fullReport" JSONB,
    "riskLevel" TEXT NOT NULL,
    "riskReasoning" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MatchAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredictionRecord" (
    "id" TEXT NOT NULL,
    "matchAnalysisId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchLabel" TEXT,
    "predictedHomePct" DOUBLE PRECISION NOT NULL,
    "predictedDrawPct" DOUBLE PRECISION NOT NULL,
    "predictedAwayPct" DOUBLE PRECISION NOT NULL,
    "predictedScore" TEXT NOT NULL,
    "predictedOver25" DOUBLE PRECISION NOT NULL,
    "predictedBtts" DOUBLE PRECISION NOT NULL,
    "actualResult" TEXT,
    "actualScore" TEXT,
    "actualOver25" BOOLEAN,
    "actualBtts" BOOLEAN,
    "result1x2Hit" BOOLEAN,
    "scoreExactHit" BOOLEAN,
    "extendedPredictions" JSONB,
    "extendedHits" JSONB,
    "modelVersion" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PredictionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPrediction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prediction" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchComment" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "MatchComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchCommentLike" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchCommentLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchTrivia" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL,
    "ertemFacts" JSONB NOT NULL,
    "contextual" TEXT NOT NULL,
    "rivalryContext" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "MatchTrivia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorType" "PostAuthorType" NOT NULL DEFAULT 'USER',
    "body" TEXT NOT NULL,
    "matchId" TEXT,
    "teamId" INTEGER,
    "externalKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchSnapshot" (
    "fixtureId" TEXT NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "homeName" TEXT NOT NULL,
    "homeShortName" TEXT,
    "homeLogo" TEXT,
    "awayTeamId" INTEGER NOT NULL,
    "awayName" TEXT NOT NULL,
    "awayShortName" TEXT,
    "awayLogo" TEXT,
    "startingAt" TIMESTAMP(3) NOT NULL,
    "leagueId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchSnapshot_pkey" PRIMARY KEY ("fixtureId")
);

-- CreateTable
CREATE TABLE "PostLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

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
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_refundOfId_key" ON "CreditTransaction"("refundOfId");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_idx" ON "CreditTransaction"("userId");

-- CreateIndex
CREATE INDEX "CreditTransaction_matchId_idx" ON "CreditTransaction"("matchId");

-- CreateIndex
CREATE INDEX "CreditTransaction_status_createdAt_idx" ON "CreditTransaction"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_userId_idempotencyKey_key" ON "CreditTransaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MatchAnalysis_matchId_idx" ON "MatchAnalysis"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchAnalysis_matchId_matchStatus_key" ON "MatchAnalysis"("matchId", "matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PredictionRecord_matchAnalysisId_key" ON "PredictionRecord"("matchAnalysisId");

-- CreateIndex
CREATE INDEX "PredictionRecord_matchId_idx" ON "PredictionRecord"("matchId");

-- CreateIndex
CREATE INDEX "PredictionRecord_modelVersion_result1x2Hit_idx" ON "PredictionRecord"("modelVersion", "result1x2Hit");

-- CreateIndex
CREATE INDEX "UserPrediction_matchId_idx" ON "UserPrediction"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPrediction_matchId_userId_key" ON "UserPrediction"("matchId", "userId");

-- CreateIndex
CREATE INDEX "MatchComment_matchId_createdAt_idx" ON "MatchComment"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchCommentLike_commentId_idx" ON "MatchCommentLike"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchCommentLike_commentId_userId_key" ON "MatchCommentLike"("commentId", "userId");

-- CreateIndex
CREATE INDEX "MatchTrivia_matchId_idx" ON "MatchTrivia"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchTrivia_matchId_matchStatus_key" ON "MatchTrivia"("matchId", "matchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Post_externalKey_key" ON "Post"("externalKey");

-- CreateIndex
CREATE INDEX "Post_createdAt_idx" ON "Post"("createdAt");

-- CreateIndex
CREATE INDEX "Post_authorType_createdAt_idx" ON "Post"("authorType", "createdAt");

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_matchId_createdAt_idx" ON "Post"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "PostLike_postId_idx" ON "PostLike"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "PostLike_postId_userId_key" ON "PostLike"("postId", "userId");

-- CreateIndex
CREATE INDEX "PostComment_postId_createdAt_idx" ON "PostComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "Follow_followingId_idx" ON "Follow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GundemBotDraft_externalKey_key" ON "GundemBotDraft"("externalKey");

-- CreateIndex
CREATE INDEX "GundemBotDraft_status_createdAt_idx" ON "GundemBotDraft"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GundemBotDraft_fixtureId_idx" ON "GundemBotDraft"("fixtureId");

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredictionRecord" ADD CONSTRAINT "PredictionRecord_matchAnalysisId_fkey" FOREIGN KEY ("matchAnalysisId") REFERENCES "MatchAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrediction" ADD CONSTRAINT "UserPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCommentLike" ADD CONSTRAINT "MatchCommentLike_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "MatchComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchCommentLike" ADD CONSTRAINT "MatchCommentLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostLike" ADD CONSTRAINT "PostLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostComment" ADD CONSTRAINT "PostComment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;


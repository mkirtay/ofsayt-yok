-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

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
    "premiumUntil" TIMESTAMP(3),
    "favoriteTeamIds" INTEGER[],
    "favoriteLeagueIds" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

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

-- AddForeignKey
ALTER TABLE "PredictionRecord" ADD CONSTRAINT "PredictionRecord_matchAnalysisId_fkey" FOREIGN KEY ("matchAnalysisId") REFERENCES "MatchAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPrediction" ADD CONSTRAINT "UserPrediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchComment" ADD CONSTRAINT "MatchComment_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


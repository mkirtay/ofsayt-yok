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


-- Deny-all RLS (politika yok): Supabase PostgREST/anon-key erişimini kapatır; Prisma bağlantısını etkilemez.
ALTER TABLE "MatchSnapshot" ENABLE ROW LEVEL SECURITY;

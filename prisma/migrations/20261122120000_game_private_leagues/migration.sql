-- Tahmin Ligi özel ligleri (büyüme raporu 2.2). Yalnız YENİ tablolar; mevcut veriye dokunmaz.
CREATE TABLE IF NOT EXISTS "GameLeague" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLeague_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GameLeagueMember" (
    "leagueId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameLeagueMember_pkey" PRIMARY KEY ("leagueId","userId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GameLeague_code_key" ON "GameLeague"("code");
CREATE INDEX IF NOT EXISTS "GameLeague_ownerId_idx" ON "GameLeague"("ownerId");
CREATE INDEX IF NOT EXISTS "GameLeagueMember_userId_idx" ON "GameLeagueMember"("userId");

DO $$ BEGIN
    ALTER TABLE "GameLeague" ADD CONSTRAINT "GameLeague_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "GameLeagueMember" ADD CONSTRAINT "GameLeagueMember_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "GameLeague"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE "GameLeagueMember" ADD CONSTRAINT "GameLeagueMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "GameLeague" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GameLeagueMember" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text; tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['GameLeague', 'GameLeagueMember'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', tbl, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- "Takımım" sezon paketi (büyüme raporu 2.8). Yalnız YENİ tablo; mevcut veriye dokunmaz.
CREATE TABLE IF NOT EXISTS "TeamPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "teamName" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "creditTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamPass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TeamPass_creditTransactionId_key" ON "TeamPass"("creditTransactionId");
CREATE UNIQUE INDEX IF NOT EXISTS "TeamPass_userId_teamId_season_key" ON "TeamPass"("userId", "teamId", "season");
CREATE INDEX IF NOT EXISTS "TeamPass_userId_season_idx" ON "TeamPass"("userId", "season");

DO $$ BEGIN
    ALTER TABLE "TeamPass" ADD CONSTRAINT "TeamPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TeamPass" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'TeamPass', r);
    END IF;
  END LOOP;
END $$;

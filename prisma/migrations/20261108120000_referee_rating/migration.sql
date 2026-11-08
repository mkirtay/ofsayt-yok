-- Hakem puanlama (maç sonrası taraftar puanı 1–10). Yalnız YENİ tablo: mevcut tablolara dokunulmaz, eski kod tabloyu
-- görmez → deploy ÖNCESİ uygulanır. RLS açık, politika yok; anon / authenticated yetkileri geri alınır
-- (desen: 20261019120000_pin_bid).

CREATE TABLE IF NOT EXISTS "RefereeRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "refereeId" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "homeName" TEXT NOT NULL,
    "awayName" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefereeRating_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RefereeRating_score_range" CHECK ("score" BETWEEN 1 AND 10)
);

-- Kullanıcı başına maç başına tek oy (güncelleme upsert ile).
CREATE UNIQUE INDEX IF NOT EXISTS "RefereeRating_userId_matchId_key" ON "RefereeRating"("userId", "matchId");
CREATE INDEX IF NOT EXISTS "RefereeRating_matchId_idx" ON "RefereeRating"("matchId");
CREATE INDEX IF NOT EXISTS "RefereeRating_refereeId_kickoffAt_idx" ON "RefereeRating"("refereeId", "kickoffAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RefereeRating_userId_fkey') THEN
    ALTER TABLE "RefereeRating" ADD CONSTRAINT "RefereeRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE r text;
BEGIN
  EXECUTE 'ALTER TABLE "RefereeRating" ENABLE ROW LEVEL SECURITY';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "RefereeRating" FROM %I', r);
    END IF;
  END LOOP;
END $$;

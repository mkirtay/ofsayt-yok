-- BEKLEYEN (prisma/migrations DIŞINDA — bilerek): Kombine aracı oran biriktirme (backtest).
-- Yalnız YENİ tablo; mevcut tablolara dokunulmaz. Test ortamına SQL Editor'den uygulanır; prod'a geçiş kullanıcı kararı.
-- Uygulanmadan da kod çalışır: yazma "tablo yok" hatasını (42P01) sessizce atlar (server/combo/oddsSnapshot.ts).
-- Maç + pazar başına TEK satır: ilk görülen oran (açılışa yakın) ve son görülen oran (kapanışa yakın) ayrı sütunlarda.

CREATE TABLE IF NOT EXISTS "ComboOddsSnapshot" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "pickKey" TEXT NOT NULL,
    "afFixtureId" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "pct" DOUBLE PRECISION,
    "bookmaker" TEXT NOT NULL,
    "firstOdd" DOUBLE PRECISION NOT NULL,
    "firstMedian" DOUBLE PRECISION NOT NULL,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOdd" DOUBLE PRECISION NOT NULL,
    "lastMedian" DOUBLE PRECISION NOT NULL,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshots" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ComboOddsSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComboOddsSnapshot_odds_valid" CHECK ("firstOdd" > 1 AND "lastOdd" > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComboOddsSnapshot_matchId_pickKey_key" ON "ComboOddsSnapshot"("matchId", "pickKey");
CREATE INDEX IF NOT EXISTS "ComboOddsSnapshot_day_idx" ON "ComboOddsSnapshot"("day");

DO $$
DECLARE r text;
BEGIN
  EXECUTE 'ALTER TABLE "ComboOddsSnapshot" ENABLE ROW LEVEL SECURITY';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "ComboOddsSnapshot" FROM %I', r);
    END IF;
  END LOOP;
END $$;

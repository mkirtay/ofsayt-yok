-- BEKLEYEN (prisma/migrations DIŞINDA — bilerek): günlük otomatik kuponların kaydı + maç bitince sonucu (takip).
-- Yalnız YENİ tablo. Test ortamına SQL Editor'den uygulanır; prod'a geçiş kullanıcı kararı. Uygulanmadan da kod çalışır:
-- yazma "tablo yok" hatasını (42P01) sessizce atlar (server/combo/couponLog.ts).
-- (gün, tür) başına TEK satır: cron aynı gün tekrar çalışırsa, ilk maç başlamadıkça ve sonuçlanmadıkça kupon güncellenir.

CREATE TABLE IF NOT EXISTS "ComboCouponLog" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "legs" JSONB NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "odds" DOUBLE PRECISION,
    "testData" BOOLEAN NOT NULL DEFAULT false,
    "firstKickoffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "hit" BOOLEAN,

    CONSTRAINT "ComboCouponLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComboCouponLog_kind_valid" CHECK ("kind" IN ('safe', 'balanced', 'bold'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComboCouponLog_day_kind_key" ON "ComboCouponLog"("day", "kind");

DO $$
DECLARE r text;
BEGIN
  EXECUTE 'ALTER TABLE "ComboCouponLog" ENABLE ROW LEVEL SECURITY';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "ComboCouponLog" FROM %I', r);
    END IF;
  END LOOP;
END $$;

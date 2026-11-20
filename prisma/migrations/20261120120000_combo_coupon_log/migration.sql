-- Günlük otomatik kuponların kaydı + maç bitince sonucu (takip). Yalnız YENİ tablo; mevcut veriye dokunmaz.
-- (gün, tür) başına TEK satır: cron aynı gün tekrar çalışırsa, ilk maç başlamadıkça ve sonuçlanmadıkça kupon güncellenir
-- (server/combo/couponLog.ts). Sonuç gece değerlendirme işinde yazılır (settleComboCoupons).
-- Eski taslak: docs/migrations-pending/20261112120000_combo_coupon_log (+ "legHits").

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
    "legHits" JSONB,

    CONSTRAINT "ComboCouponLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ComboCouponLog_kind_valid" CHECK ("kind" IN ('safe', 'balanced', 'bold'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComboCouponLog_day_kind_key" ON "ComboCouponLog"("day", "kind");
CREATE INDEX IF NOT EXISTS "ComboCouponLog_settledAt_firstKickoffAt_idx" ON "ComboCouponLog"("settledAt", "firstKickoffAt");

ALTER TABLE "ComboCouponLog" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'ComboCouponLog', r);
    END IF;
  END LOOP;
END $$;

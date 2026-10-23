-- Kupon kodları (ör. FUTBOL10 → +10 kredi). Bir kupon kullanıcı başına BİR kez kullanılır; isteğe bağlı toplam kullanım
-- sınırı ve son kullanma tarihi. Yalnız YENİ tablolar: mevcut tablolara dokunmaz, eski kod görmez → deploy ÖNCESİ uygulanır.
-- RLS açık, politika yok; anon / authenticated yetkileri geri alınır (desen: 20261019120000_pin_bid).

CREATE TABLE IF NOT EXISTS "Coupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Coupon_credits_positive" CHECK ("credits" > 0),
    CONSTRAINT "Coupon_max_positive" CHECK ("maxRedemptions" IS NULL OR "maxRedemptions" > 0),
    CONSTRAINT "Coupon_count_within_max" CHECK ("maxRedemptions" IS NULL OR "redeemedCount" <= "maxRedemptions")
);

-- Kodlar BÜYÜK harfle saklanır (uygulama normalleştirir; DB de zorlar).
CREATE UNIQUE INDEX IF NOT EXISTS "Coupon_code_key" ON "Coupon"("code");
ALTER TABLE "Coupon" DROP CONSTRAINT IF EXISTS "Coupon_code_upper";
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_code_upper" CHECK ("code" = upper("code"));

CREATE TABLE IF NOT EXISTS "CouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CouponRedemption_couponId_userId_key" ON "CouponRedemption"("couponId", "userId");
CREATE INDEX IF NOT EXISTS "CouponRedemption_userId_idx" ON "CouponRedemption"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CouponRedemption_couponId_fkey') THEN
    ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CouponRedemption_userId_fkey') THEN
    ALTER TABLE "CouponRedemption" ADD CONSTRAINT "CouponRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Coupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CouponRedemption" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['Coupon', 'CouponRedemption'] LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

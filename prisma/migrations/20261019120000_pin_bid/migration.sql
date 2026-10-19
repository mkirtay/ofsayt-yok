-- Gündem 1. sıra teklifi (haftalık açık artırma). Yalnız YENİ tablo: mevcut tablolara dokunulmaz, eski kod tabloyu
-- görmez → deploy ÖNCESİ uygulanır. RLS açık, politika yok; anon / authenticated yetkileri geri alınır
-- (desen: 20261016120000_gundem_moderation).

CREATE TABLE IF NOT EXISTS "PinBid" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "chargedAmount" INTEGER,
    "refundedAmount" INTEGER,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinBid_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PinBid_amount_positive" CHECK ("amount" > 0)
);

CREATE INDEX IF NOT EXISTS "PinBid_weekStart_status_idx" ON "PinBid"("weekStart", "status");
CREATE INDEX IF NOT EXISTS "PinBid_userId_idx" ON "PinBid"("userId");
-- Haftada tek lider: eşzamanlı iki teklif ikisi de ACTIVE kalamaz (uygulamadaki işlem kilidine ek savunma).
CREATE UNIQUE INDEX IF NOT EXISTS "PinBid_one_active_per_week" ON "PinBid"("weekStart") WHERE "status" = 'ACTIVE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PinBid_userId_fkey') THEN
    ALTER TABLE "PinBid" ADD CONSTRAINT "PinBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE r text;
BEGIN
  EXECUTE 'ALTER TABLE "PinBid" ENABLE ROW LEVEL SECURITY';
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "PinBid" FROM %I', r);
    END IF;
  END LOOP;
END $$;

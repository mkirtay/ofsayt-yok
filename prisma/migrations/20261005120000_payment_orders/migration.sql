-- Hikie ödeme entegrasyonu v1: sipariş kaydı + işlenmiş webhook kimlikleri. Deploy ÖNCESİ uygulanır (yeni kod bu
-- tabloları kullanır; eski kod görmez). Yeni tablolarda RLS açık ve anon / authenticated rollerine yetki yok: erişim
-- yalnız sunucudaki Prisma rolüyle (tablo sahibi).

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "merchantOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageKey" TEXT NOT NULL,
    "amountTRY" DECIMAL(10,2) NOT NULL,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "hikieOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_merchantOrderId_key" ON "PaymentOrder"("merchantOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_hikieOrderId_key" ON "PaymentOrder"("hikieOrderId");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: açık, politika yok → Supabase anon / authenticated rolleri satır göremez; ayrıca tablo yetkileri geri alınır
-- (Supabase yeni tablolara varsayılan olarak verir). Roller yoksa (yerel / test Postgres) atlanır.
ALTER TABLE "PaymentOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentWebhookEvent" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "PaymentOrder" FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE "PaymentWebhookEvent" FROM %I', r);
    END IF;
  END LOOP;
END $$;

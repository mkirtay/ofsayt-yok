-- Frikik günlük skor tablosu (kullanıcı + gün başına tek kayıt; sunucuda yeniden oynatılmış skor). Deploy ÖNCESİ
-- uygulanır (yeni kod tabloyu kullanır; eski kod görmez). RLS açık, politika yok; anon / authenticated yetkileri geri
-- alınır (mevcut desen: 20261005120000_payment_orders). Çalıştırma: docs/FRIKIK_SKOR_TABLOSU.md.

-- CreateTable
CREATE TABLE "FrikikDailyScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "cleared" INTEGER NOT NULL,
    "simVersion" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "shots" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrikikDailyScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FrikikDailyScore_userId_day_key" ON "FrikikDailyScore"("userId", "day");

-- CreateIndex
CREATE INDEX "FrikikDailyScore_day_level_score_idx" ON "FrikikDailyScore"("day", "level", "score");

-- CreateIndex
CREATE INDEX "FrikikDailyScore_month_userId_idx" ON "FrikikDailyScore"("month", "userId");

-- AddForeignKey
ALTER TABLE "FrikikDailyScore" ADD CONSTRAINT "FrikikDailyScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: açık, politika yok → Supabase anon / authenticated rolleri satır göremez; tablo yetkileri de geri alınır
-- (Supabase yeni tablolara varsayılan olarak verir). Roller yoksa (yerel / test Postgres) atlanır.
ALTER TABLE "FrikikDailyScore" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "FrikikDailyScore" FROM %I', r);
    END IF;
  END LOOP;
END $$;

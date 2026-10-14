-- Hesap silme denetim kaydı (kişisel veri YOK: kullanıcı kimliği / e-posta / ad / IP tutulmaz). Yalnız yeni tablo —
-- mevcut tablolara dokunulmaz, eski kod tabloyu görmez → deploy ÖNCESİ uygulanır. RLS açık, politika yok; anon /
-- authenticated yetkileri geri alınır (mevcut desen: 20261008120000_frikik_daily_score).

-- CreateTable
CREATE TABLE IF NOT EXISTS "AccountDeletionLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "hadPassword" BOOLEAN NOT NULL,
    "oauthProviders" TEXT[],
    "accountAgeDays" INTEGER NOT NULL,
    "counts" JSONB NOT NULL,

    CONSTRAINT "AccountDeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AccountDeletionLog_createdAt_idx" ON "AccountDeletionLog"("createdAt");

-- RLS: açık, politika yok → Supabase anon / authenticated rolleri satır göremez; tablo yetkileri de geri alınır.
-- Roller yoksa (yerel / test Postgres) atlanır.
ALTER TABLE "AccountDeletionLog" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE "AccountDeletionLog" FROM %I', r);
    END IF;
  END LOOP;
END $$;

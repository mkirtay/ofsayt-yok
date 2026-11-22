-- Haftalık e-posta özeti açık izni (büyüme raporu 3.3). Yalnız YENİ tablo; mevcut veriye dokunmaz.
CREATE TABLE IF NOT EXISTS "EmailDigestSubscription" (
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDigestSubscription_pkey" PRIMARY KEY ("userId")
);

DO $$ BEGIN
    ALTER TABLE "EmailDigestSubscription" ADD CONSTRAINT "EmailDigestSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "EmailDigestSubscription" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'EmailDigestSubscription', r);
    END IF;
  END LOOP;
END $$;

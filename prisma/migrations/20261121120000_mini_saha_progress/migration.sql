-- Mini Saha ilerlemesi (oynayarak açılan karakterler). Yalnız YENİ tablo; mevcut veriye dokunmaz.
CREATE TABLE IF NOT EXISTS "MiniSahaProgress" (
    "userId" TEXT NOT NULL,
    "matches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "unlocked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiniSahaProgress_pkey" PRIMARY KEY ("userId")
);

DO $$ BEGIN
    ALTER TABLE "MiniSahaProgress" ADD CONSTRAINT "MiniSahaProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "MiniSahaProgress" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'MiniSahaProgress', r);
    END IF;
  END LOOP;
END $$;

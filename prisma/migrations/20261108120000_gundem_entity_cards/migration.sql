-- Gündem varlık kartları: gönderiye oyuncu / takım / maç eklenir (gönderi başına en çok 1).
-- Yalnız EKLEME: Post'a iki boş bırakılabilir sütun + yeni enum + yeni tablo. Eski kod yeni sütunları seçmez → deploy
-- ÖNCESİ uygulanır (yeni kod sütunları seçtiği için önce migration, sonra deploy).
-- RLS açık, politika yok; anon / authenticated yetkileri geri alınır (desen: 20261023120000_coupons).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PostEntityType') THEN
    CREATE TYPE "PostEntityType" AS ENUM ('PLAYER', 'TEAM', 'MATCH');
  END IF;
END $$;

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "entityType" "PostEntityType";
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "entityId" TEXT;
-- Tür ve id birlikte dolu ya da birlikte boş.
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_entity_pair";
ALTER TABLE "Post" ADD CONSTRAINT "Post_entity_pair" CHECK (("entityType" IS NULL) = ("entityId" IS NULL));

CREATE TABLE IF NOT EXISTS "GundemEntitySnapshot" (
    "entityType" "PostEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GundemEntitySnapshot_pkey" PRIMARY KEY ("entityType", "entityId")
);

ALTER TABLE "GundemEntitySnapshot" ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', 'GundemEntitySnapshot', r);
    END IF;
  END LOOP;
END $$;

-- Gündem moderasyonu: engelleme, şikâyet, @etiket, yönetici işlem kaydı, filtre sözlüğü ekleri, reddedilen içerik
-- sayaçları + mevcut tablolara yalnız BOŞ BIRAKILABİLİR alanlar (User.gundemSuspendedUntil, Post/PostComment.hiddenAt /
-- hiddenReason). Eski kod yeni sütunları / tabloları görmez → deploy ÖNCESİ uygulanır. Tekrar çalıştırılabilir.
-- Yeni tablolarda RLS açık, politika yok; anon / authenticated yetkileri geri alınır (desen: 20261015120000).

-- AlterTable (boş bırakılabilir alanlar)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "gundemSuspendedUntil" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "hiddenReason" TEXT;
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
ALTER TABLE "PostComment" ADD COLUMN IF NOT EXISTS "hiddenReason" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ContentReport" (
    "id" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "targetUserId" TEXT,
    "reporterId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "GundemMention" (
    "id" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "postId" TEXT,
    "commentId" TEXT,
    "mentionedUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GundemMention_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ModerationAction" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT,
    "action" TEXT NOT NULL,
    "targetKey" TEXT,
    "targetUserId" TEXT,
    "reportCount" INTEGER,
    "note" TEXT,
    "meta" JSONB,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ModerationTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "match" TEXT NOT NULL DEFAULT 'prefix',
    "category" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationTerm_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ModerationStat" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "surface" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModerationStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX IF NOT EXISTS "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ContentReport_targetKey_status_idx" ON "ContentReport"("targetKey", "status");
CREATE INDEX IF NOT EXISTS "ContentReport_reporterId_createdAt_idx" ON "ContentReport"("reporterId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "ContentReport_targetKey_reporterId_key" ON "ContentReport"("targetKey", "reporterId");
CREATE INDEX IF NOT EXISTS "GundemMention_postId_idx" ON "GundemMention"("postId");
CREATE INDEX IF NOT EXISTS "GundemMention_commentId_idx" ON "GundemMention"("commentId");
CREATE INDEX IF NOT EXISTS "GundemMention_mentionedUserId_idx" ON "GundemMention"("mentionedUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "GundemMention_targetKey_mentionedUserId_key" ON "GundemMention"("targetKey", "mentionedUserId");
CREATE INDEX IF NOT EXISTS "ModerationAction_createdAt_idx" ON "ModerationAction"("createdAt");
CREATE INDEX IF NOT EXISTS "ModerationAction_targetUserId_idx" ON "ModerationAction"("targetUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "ModerationTerm_term_key" ON "ModerationTerm"("term");
CREATE UNIQUE INDEX IF NOT EXISTS "ModerationStat_day_surface_category_outcome_key" ON "ModerationStat"("day", "surface", "category", "outcome");

-- AddForeignKey (varsa atla → tekrar çalıştırılabilir)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserBlock_blockerId_fkey') THEN
    ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserBlock_blockedId_fkey') THEN
    ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentReport_postId_fkey') THEN
    ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentReport_commentId_fkey') THEN
    ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentReport_reporterId_fkey') THEN
    ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ContentReport_resolvedById_fkey') THEN
    ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GundemMention_postId_fkey') THEN
    ALTER TABLE "GundemMention" ADD CONSTRAINT "GundemMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GundemMention_commentId_fkey') THEN
    ALTER TABLE "GundemMention" ADD CONSTRAINT "GundemMention_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "PostComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GundemMention_mentionedUserId_fkey') THEN
    ALTER TABLE "GundemMention" ADD CONSTRAINT "GundemMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ModerationAction_adminId_fkey') THEN
    ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ModerationAction_targetUserId_fkey') THEN
    ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- RLS: açık, politika yok → Supabase anon / authenticated rolleri satır göremez; tablo yetkileri de geri alınır.
-- Roller yoksa (yerel / test Postgres) atlanır. Mevcut tablolara (User, Post, PostComment) dokunulmaz.
DO $$
DECLARE r text; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['UserBlock', 'ContentReport', 'GundemMention', 'ModerationAction', 'ModerationTerm', 'ModerationStat'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', t, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

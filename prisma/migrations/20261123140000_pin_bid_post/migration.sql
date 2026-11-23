-- Gündem 1. sıraya kendi gönderisini sabitleme (2026-11-23). Yalnız YENİ, boş bırakılabilir sütun; mevcut satırlar NULL.
ALTER TABLE "PinBid" ADD COLUMN IF NOT EXISTS "postId" TEXT;

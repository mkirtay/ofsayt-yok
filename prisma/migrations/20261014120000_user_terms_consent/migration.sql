-- Kayıt onayı (Kullanım Koşulları + Gizlilik Politikası): zaman ve metin sürümü. İkisi de nullable — mevcut
-- kullanıcılar etkilenmez, varsayılan yok (tablo yeniden yazılmaz, yalnız katalog değişikliği).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;

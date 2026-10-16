-- Ödeme hazırlığı (WEB-ODEME): satın alma onay kaydı + sipariş onay e-postası tekilliği + e-posta dili.
-- Yalnız mevcut "PaymentOrder" tablosuna NULL kabul eden kolon ekleme: veri değişmez, eski kod kolonları görmez →
-- deploy ÖNCESİ uygulanır. Yeni tablo YOK → RLS / yetki değişmez ("PaymentOrder" 20261005120000'den beri RLS açık,
-- anon / authenticated REVOKE).

ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "termsVersion" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "locale" TEXT;
ALTER TABLE "PaymentOrder" ADD COLUMN IF NOT EXISTS "confirmationEmailSentAt" TIMESTAMP(3);

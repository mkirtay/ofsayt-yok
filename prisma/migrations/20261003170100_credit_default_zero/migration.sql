-- Kredi modeli v2 — B (deploy SONRASI): yeni kayıtların başlangıç bakiyesi 0 (bonus e-posta doğrulanınca 2).
-- A ile deploy arasında eski kod çalışırken uygulanırsa Google kayıtları 0 kredi + "bonus verildi" kaydıyla kalırdı.

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 0;

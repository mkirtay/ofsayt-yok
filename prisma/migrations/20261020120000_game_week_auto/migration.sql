-- Tahmin oyunu: haftalık liste de otomatik (game-settle cron'u seçer ve yayınlar). Admin elle değiştirirse `lockedByAdmin`
-- → otomatik seçim o haftaya dokunmaz. `autoCheckedAt`: boş yer doldurma denemesinin zamanı (saatte en çok bir).
-- Yalnız sütun ekler (varsayılanlı / boş) → deploy ÖNCESİ uygulanabilir, eski kod etkilenmez.

ALTER TABLE "GameWeek" ADD COLUMN "lockedByAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GameWeek" ADD COLUMN "autoCheckedAt" TIMESTAMP(3);

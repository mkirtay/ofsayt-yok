-- İmzasız Hikie callback işareti (tanılama). Nullable ekleme: eski kod görmez, deploy öncesi / sonrası güvenli.
ALTER TABLE "PaymentOrder" ADD COLUMN "callbackAt" TIMESTAMP(3);

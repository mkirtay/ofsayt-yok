# Prisma Migration Stratejisi

Bu projede şimdiye kadar şema değişiklikleri `prisma db push` ile uygulanmıştı ve
`prisma/migrations/` klasörü yoktu. Bu durum prod'da **schema drift** riski yaratıyordu.
Artık versiyonlanan bir migration geçmişi var.

## Baseline (ilk kurulum — yalnızca bir kez)

`prisma/migrations/00000000000000_init/migration.sql` dosyası, mevcut `schema.prisma`
durumunun tamamını içeren **baseline** migration'dır. Offline üretildi:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_init/migration.sql
```

### Mevcut (üretim/şeması zaten var olan) veritabanları için

Veritabanı zaten `db push` ile oluşturulduğundan, bu migration'ı **uygulamadan**
"uygulanmış" olarak işaretleyin (aksi halde tablolar zaten var hatası alırsınız):

```bash
dotenv -e .env.local -- npx prisma migrate resolve --applied 00000000000000_init
```

### Sıfırdan kurulan (boş) veritabanları için

```bash
dotenv -e .env.local -- npx prisma migrate deploy
```

## Bundan sonra (her şema değişikliğinde)

`db push` yerine migration üretin:

```bash
npm run db:migrate -- --name aciklayici_isim   # geliştirme ortamı (migrate dev)
```

Prod deploy adımında:

```bash
npx prisma migrate deploy
```

> Not: `npm run db:push` yalnızca hızlı yerel prototipleme için kalsın; paylaşılan/üretim
> veritabanlarında migration akışını kullanın.

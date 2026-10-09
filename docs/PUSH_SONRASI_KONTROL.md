# Push sonrası kısa kontrol listesi

Her main push'unun deploy'u "Ready" olduktan sonra, canlıda (birkaç dakika):

1. **Gerçek bir logo URL'si 200 dönüyor mu?**
   ```bash
   curl -s -o /dev/null -w "%{http_code} %{content_type}\n" "https://www.<alan-adı>/api/img/logo?src=soccer/teams/24/3224.png&w=32"
   ```
   Beklenen: `200 image/webp`. Uç yalnız GET kabul eder: `curl -I` (HEAD) her zaman 405 döner, kullanma. Çıplak alan
   adı `www`'ye 307 ile yönlenir; ya `www` kullan ya da `-L` ekle. Önbellek durumunu görmek için `-D -` ile başlıkları
   da yazdır (`x-vercel-cache`). `302` (orijinale yedek) sharp çalışmıyor demektir; Vercel
   Functions log'unda `[imgLogo] sharp yüklenemedi` ara. `x-vercel-cache: HIT` ise önbellek yanıtıdır, yeni
   fonksiyonu sınamak için `w`'yi değiştir (32/48/64/96/128) ya da başka bir takım id'si dene.
2. **OG görseli çiziliyor mu?** `/api/og/team/<id>` ve `/api/og/match/<id>` 200 `image/png` dönmeli.
3. **Vercel Functions log'u:** deploy sonrası ilk dakikalarda `Error`/`500` var mı (özellikle `ERR_DLOPEN_FAILED`,
   `Cannot find module`).
4. **Sentry:** yeni deploy'la açılan issue var mı.

## Neden 1. madde

2026-10-07'de sharp 0.34 → 0.35.5 yükseltmesinden sonra `/api/img/logo` canlıda her istekte 500 verdi:
`libvips-cpp.so.8.18.7: cannot open shared object file`. sharp 0.35'in girişi `dist/index.cjs` oldu; `@vercel/nft`'nin
sharp özel durumu hâlâ `sharp/lib/index.js` aradığı için libvips paylaşımlı kütüphanesi fonksiyon paketine girmedi.
Yerel (macOS) build ve testler bunu yakalamaz. Önlemler:

- `next.config.ts` → `outputFileTracingIncludes`: sharp kullanan fonksiyonlara (`/api/img/logo`, `/api/og/**`)
  libvips-cpp açıkça eklenir.
- `npm run build` sonrası `postbuild` → `scripts/check-sharp-trace.mjs`: sharp bağlaması olup libvips'i olmayan
  `.nft.json` varsa build (Vercel'de de) düşer.
- `server/imgLogo.ts` sharp'ı ilk istekte yükler; yüklenemezse 500 yerine orijinal logoya 302. İstemcide `TeamLogo`
  ve top logoları (`pitch3d/pitchKit.ts`) hata verince doğrudan Sportmonks CDN adresine düşer.

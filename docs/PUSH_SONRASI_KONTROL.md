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

## Tur 7 (2026-10-11) ek canlı doğrulama

`B=https://www.ofsaytyok.app`. Hepsi okuma; hiçbiri DB'ye yazmaz.

1. **Canlı dakikada tek kesme (3f54055).** Canlı bir maçın sayfasında başlık rozeti `51'` olmalı (`51''` değil).
   Ana sayfa listesi ve ticker'da da tek kesme; devre arasında da dakika tek kesmeyle görünür.
2. **Isı haritası maç içi göreli ölçek (96fdd00, ff0b469).**
   - Liverpool–Manchester City analiz sekmesi: iki takımın en yoğun bölgesi koyu, en zayıfı açık; ızgara tek tonda
     "soluk" görünmüyor. Yeni üretilen analizlerde `modelVersion` `v6-2026-10-…` ile başlar.
   - Eski bir analiz (v5 ya da öncesi, ör. 1–2 hafta önceki bir maç): pay dağılımı gibi düşük değerler de
     görünür kontrastla çizilir, sayfa hata vermez. Sürüm etiketi değişikliği eski analizleri yeniden üretmez.
3. **Takım formu TTL (5afc43e).** Bugün maçı olmayan bir takımın form isteği (son 89 gün):
   ```bash
   curl -s -D - -o /dev/null "$B/api/sportmonks/football/fixtures/between/$(date -v-89d +%F)/$(date +%F)/<takımId>" | grep -iE "^HTTP|^age|x-vercel-cache|x-cache"
   ```
   Not: Vercel yanıttaki `Cache-Control`'den `s-maxage`'ı siler (dışarıda yalnız `public` görünür); süre `age` ile
   okunur. İlk istekte `x-cache: MISS`; 10 dakikadan sonra tekrarla: `x-vercel-cache: HIT` ve `age` > 600 ise CDN süresi
   eskisinden (10 dk) uzun demektir (beklenen: son maç 5 sa'ten eskiyse 6 sa, 5 sa içindeyse 1 sa). Bugün başlamamış/
   canlı maçı olan takımda kısa TTL sürer (doğru).
4. **Havuz baskısında maç sayfası SSR'ı (9fd49d9).** Normal havuzda bitmiş bir maç:
   ```bash
   curl -s -D /tmp/h.txt "$B/matches/<slug>" -o /tmp/m.html; grep -iE "^age|x-vercel-cache" /tmp/h.txt; grep -c '"initialH2h"' /tmp/m.html
   ```
   Beklenen (normal havuz): `initialH2h` sayısı ≥ 1 ve bitmiş maçta tam önbellek (CDN'de `age` saatlere çıkabilir).
   Havuz baskı altındaysa (kalan < %10 ya da 429 soğuması) `initialH2h` YOK, CDN kopyası kısa (`age` ≤ 60 sn: s-maxage 30
   + swr 30); H2H/form, istatistik ve kadro tarayıcıda yüklenir (sayfada iskelet → dolu). Baskı durumu:
   `GET /api/admin/sportmonks-usage` (admin).
5. **Rota adı sayacı (40ab913).** `GET /api/admin/sportmonks-usage?hours=2` (admin) rotalarında maç sayfaları tek satır
   `/matches/[slug]`, Next verisi `/_next/data/*/…` olarak gruplanır; maç başına ayrı satır açılmaz. Kota uyarısı
   (Sentry) o saatin en çok tüketen 3 rotasını taşır.
6. **Dünya Kupası sekmesi polling (bb2e0ad).** `/world-cup` Maçlar sekmesi açıkken tarayıcı sekmesini arka plana al:
   ağ panelinde periyodik istek durur; öne gelince veri bayatsa tek istek atılır. (Sayfa `WORLD_CUP_PAGE_ENABLED`
   kapalıysa ana sayfaya 302 — bu adım atlanır.)
7. **evaluate-predictions imleci (441a64d).** GitHub Actions "Evaluate Predictions" koşusunun yanıt özetinde
   `deferred` alanı var; tur başına en çok 25 maç değerlendirilir, `deferred > 0` ise sonraki turlarda kalanlar
   sırayla işlenir (imleç Redis'te `…eval-predictions:cursor`). Ardışık koşularda `deferred` azalmalı, hata yok.

## Tur 8 (2026-10-11) ek canlı doğrulama

Yalnız arayüz; hiçbir adım veri yazmaz.

1. **Masaüstü lig seçici kendi içinde kayar (7016c21).** ≥ masaüstü genişlikte ana sayfada sol paneldeki lig seçiciyi
   ("Süper Lig ▾") aç. Açmadan önce ve açtıktan sonra `document.documentElement.scrollHeight` aynı kalmalı (sayfa
   uzamaz). Listeyi fareyle sonuna kadar kaydır: kaydırma panelin içinde kalır, sayfa kaymaz (`overscroll-behavior:
   contain`); arama kutusu üstte sabit. `/standings` sayfasındaki aynı liste tam boy kalır (orada sınır yok).
2. **Mobil lig sheet'i (7016c21).** ~375 px'te aynı seçiciyi aç: tam ekran sheet; başlık satırı ve arama kutusu sabit,
   yalnız liste kayar.
3. **UEFA fikstür modunda çipler (fe3f465).** Sol panel seçicisinde Şampiyonlar Ligi / UEFA Avrupa Ligi / Konferans
   Ligi seç (orta sütun kupa fikstürüne geçer, "Günlük maçlara dön" düğmesi görünür). Üstteki lig çiplerinden
   (Tümü / Süper Lig / 5 Büyük Lig) hiçbiri seçili görünmemeli (`aria-pressed="false"`). "5 Büyük Lig"e bas:
   fikstür modundan çıkılır, günlük maç listesi 5 büyük lig filtresiyle gelir ve çip seçili görünür. "+ Ligler" → Uygula
   da aynı şekilde fikstür modundan çıkar.

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

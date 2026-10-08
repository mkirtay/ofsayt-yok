# Frikik — günlük skor tablosu

Dal: `feat/frikik-leaderboard`. Bu belge: karar özeti, deploy adımları (migration, env), işleyiş ve riskler.

## Kararlar

| Konu | Karar | Neden |
| --- | --- | --- |
| Gün sınırı | **Europe/Istanbul** (`lib/frikik/daily.ts`: UTC+3 sabit ofset; Türkiye'de 2016'dan beri yaz saati yok) | Oyuncuların tamamı TR'de; "gece yarısı" sezgisi yerel saat. Sunucu ve istemci aynı `turkeyDay` ile aynı tohumu üretir. |
| Gece yarısı toleransı | Önceki güne başlanmış koşu, gece yarısından sonraki ilk **10 dk** içinde o güne yazılır (`DAY_GRACE_MS`) | Koşu 23:58'de başlayıp 00:02'de bitebilir. |
| Sıralama anahtarı | **seviye DESC, puan DESC, kayıt zamanı ASC** | Kurallar metniyle tutarlı ("önce ulaşılan seviye, sonra puan"). |
| Aylık tablo | Kullanıcı başına ay içindeki **tek en iyi günlük kayıt** (`DISTINCT ON`), toplam değil | İstek. |
| Günde tek kayıt | `@@unique([userId, day])`; ikinci gönderim mevcut kaydı döner (`recorded=false`) | Tekrar oynamak serbest, tablo ilk bitmiş koşu. |
| Takma ad | Mevcut **`User.username`** (yeni sütun yok). Boşsa skor yazılmadan önce oyun içinde sorulur (`PATCH /api/user/me`). Uygunsuz içerik + ayrılmış ad filtresi (`lib/frikik/nickname.ts`) `PATCH /api/user/me`'ye de bağlandı | Kullanıcı adı zaten benzersiz ve Gündem'de herkese açık; ikinci bir kimlik alanı kafa karıştırırdı. E-posta ve gerçek ad tabloda hiç yer almaz (API yalnız `username` seçer). |
| Sunucu doğrulaması | İstemci **skor göndermez**; `{ day, seed, simVersion, shots }` gönderir. Sunucu `parseDayKey` + `isAcceptedDay` + `dailySeed` + `SIM_VERSION` denetler, `scoreLevelRun` ile yeniden oynatır. Can bitmemiş koşu ve fazladan vuruş reddedilir | Manipülasyon imkânsız: sonuç sunucunun hesabı. `sim.ts`'e dokunulmadı (Node'da düz import; `Date`/`Math.random` yok). |
| Sürüm uyuşmazlığı | **409 `SIM_VERSION`**, `console.warn` ile kullanıcı kimliği + sürüm çifti loglanır | Eski paketle oynanmış koşu farklı sonuç verirdi. |
| Önbellek | Herkese açık tablo: Redis **30 sn** (`livescoreCache` + `cacheKeyPrefix`) + CDN `s-maxage=30, swr=60`. Kişisel durum (`/api/frikik/me`, `score`) `private, no-store` | Günün tablosu sık değişir ama 30 sn gecikme kabul edilebilir; kişisel yanıt asla paylaşımlı önbelleğe girmez. |
| Hız sınırı | Upstash fixed window (fail-open): `score` kullanıcı 6/dk + IP 20/dk; `leaderboard` IP 60/dk | Mevcut `lib/rateLimit.ts`. |
| Ana sayfa kartı | SSR'da oynanmamış kabuk; veri kart görünür alana girip tarayıcı boşa çıkınca (`useInViewOnce`). Görsel: her iki temada koyu yeşil degrade (marka yeşilinin koyu tonları), altın "Oyna" (kredi rozeti tonu), satır içi SVG saha süsü (yazı yok, ~0,8 KB, istek yok; kırpılmış WebP ≥ 20 KB + istek olurdu). Metin kontrastı: beyaz/zemin ≥ 8:1, altın/zemin ≥ 4,5:1, koyu/altın ≈ 10:1 | LCP / ilk yük etkilenmez (yerel mobil Lighthouse önce/sonra medyan 91/91, CLS 0). Oynanmış ve oynanmamış durum aynı yükseklikte (masaüstü 140, mobil 144 px) → kayma yok. |
| Girişsiz oyuncu | Bitişte "Giriş yap ve skoru yaz"; koşu `localStorage`'da bekler (`oy_frikik_pending`), Google girişinden `/frikik`'e dönünce kendiliğinden gönderilir | Giriş oynamayı engellemez. |
| Analitik | `@vercel/analytics` `track()`; alanlar yalnız sayısal / sabit listeli (`lib/frikik/analytics.ts`). Kimlik, e-posta, takma ad gönderilmez | Kişisel veri yok. |
| Reklam iletişim adresi | `NEXT_PUBLIC_FRIKIK_AD_CONTACT`; tanımsızsa satır çizilmez. Pano metni `{{BRAND}}` → `config/brand.ts` | Yer tutucu canlıya çıkmaz; marka geçişi tek yerden. |

## Deploy adımları (sen)

1. **Migration (deploy ÖNCESİ)** — dosya: `prisma/migrations/20261008120000_frikik_daily_score/migration.sql`.
   ```bash
   dotenv -e .env.local -- npx prisma migrate deploy
   ```
   Yalnız bu migration bekliyorsa yukarıdaki yeter. Sonra kontrol:
   ```bash
   dotenv -e .env.local -- npx prisma migrate status
   ```
   Migration RLS'i açar ve `anon` / `authenticated` rollerinden tablo yetkisini geri alır (PGlite testi: `src/test/migrations/frikikDailyScore.pglite.test.ts`). Geri alma: `DROP TABLE "FrikikDailyScore";` (prisma/rollback deseni).
2. **Env (Vercel, Production + Preview):** `NEXT_PUBLIC_FRIKIK_AD_CONTACT` — gerçek reklam iletişim adresi hazır olunca ekle; yoksa /frikik'te satır görünmez (ek bir şey gerekmez).
3. Push sonrası canlıda: `/frikik` sonunda girişli hesapla bir koşu bitir → tabloya düşmeli; ikinci koşu tabloyu değiştirmemeli. `/api/frikik/leaderboard` yanıtında `Cache-Control: public, s-maxage=30` olmalı.

## Uçlar

- `POST /api/frikik/score` — gövde `{ day, seed, simVersion, shots }`; 200 `{ recorded, standing }`, 400 (`BAD_BODY`/`BAD_DAY`/`DAY_CLOSED`/`BAD_SEED`/`BAD_SHOTS`/`RUN_NOT_FINISHED`), 401, 403 `NICKNAME_REQUIRED`, 409 `SIM_VERSION`, 429.
- `GET /api/frikik/leaderboard[?day=YYYY-MM-DD]` — `{ day, month, daily[20], monthly[20] }`; satır `{ rank, nickname, level, score, day }`.
- `GET /api/frikik/me` — `{ day, month, nickname, today: { level, score, cleared, rank } | null, month_best: { level, score, day, rank } | null }`.

## Olaylar (Vercel Analytics → Custom Events)

`frikik_started{entry, again}`, `frikik_finished{level, score, signedIn}`, `frikik_shared{level, method}`,
`frikik_login_prompt_shown{level}`, `frikik_login_from_game{level}`, `frikik_card_click{entry}`; `entry` ∈ home_card | menu | match_cta | share_link | direct (`/frikik?src=…`).

## Motorlar arası determinizm (tarayıcı ↔ sunucu)

Sunucu istemcinin skorunu **karşılaştırmaz**; girdiyi yeniden oynatır ve kendi sonucunu yazar. Tarayıcı ile Node farklı
sonuç üretse kullanıcı reddedilmez ama (a) tabloya ekranda gördüğünden farklı bir skor yazılır, (b) can sayımı kayarsa
koşu `RUN_NOT_FINISHED` / `BAD_SHOTS` ile reddedilir. Bu yüzden sim.ts yalnız IEEE 754'te kesin tanımlı işlemler
(+ − × ÷, `Math.sqrt`, `abs/min/max`, tam sayı) kullanır; `sin/cos/exp/pow/hypot/random` yasak (sim.test.ts kaynak taraması).

Doğrulama (2026-10-08, macOS arm64): 36 koşu / 254 vuruş (gol 146, kurtarış 59, baraj 32, direk 9, dışarı 8; seviye 13'e
kadar) Node 22 (V8), Chromium 145 (V8), Firefox 146 (SpiderMonkey) ve WebKit 26 (JavaScriptCore) üzerinde **bit düzeyinde
aynı** iz üretti (vuruş sonucu, puan, karar tick'i, top konum/hız, kaleci yeri/hedefi, vuruş parametreleri).

- Altın dosya: `src/lib/frikik/__fixtures__/crossEngine.golden.json` (Node çıktısı). `src/lib/frikik/crossEngine.test.ts`
  her CI koşusunda Node çıktısının altınla bit düzeyinde aynı olduğunu ve `simVersion === SIM_VERSION` olduğunu doğrular.
  **sim.ts değişirse:** `SIM_VERSION` artır + `npx tsx scripts/frikik-cross-engine/run.mts --write-golden` + motor
  karşılaştırmasını yeniden koş.
- Motor karşılaştırması (ağır, CI dışı): `npm run test:frikik-engines`. Playwright gerekir: `npm i -D playwright &&
  npx playwright install chromium firefox webkit` ya da ayrı kurulum için `FRIKIK_PW_DIR=<klasör>` (içinde
  `node_modules/playwright`). Karar farkı çıkarsa çıkış kodu 1; ilk fark koşu/vuruş/alan/Δ ile yazılır.
- **Gerçek telefon testi:** telefonda `/frikik?debug=1` aç, bir koşu bitir, bitiş kartındaki "Koşuyu kopyala (test)"
  düğmesine bas (JSON: gün, tohum, SIM_VERSION, vuruş girdileri, cihazın vuruş sonuçları, UA). JSON'u Mac'e geçir
  (Notlar / AirDrop / mesaj) ve:
  ```bash
  pbpaste | npx tsx scripts/frikik-cross-engine/verify.mts -
  ```
  Çıktı vuruş vuruş "aynı / FARK" tablosu ve toplam skor karşılaştırmasıdır. En az 3 koşu (biri yüksek seviyeli, biri
  çok falsolu) önerilir; iPhone Safari (JSC/arm64) ve bir Android Chrome yeterli. Tarayıcıda çalışan kod ile sunucu aynı
  `sim.ts`; ekranda görünen sonuç = tabloya yazılan sonuç olmalı.

## Riskler / açık noktalar

- **Tekrar koşu ipucu:** Tekrar koşular tabloya girmez ama skor sunucuya gönderilmez de (istemci bugünkü kaydı biliyorsa). Kullanıcı yerel depolamayı silip tekrar gönderirse tekil anahtar yine korur.
- **`username` paylaşımı:** Takma ad = Gündem kullanıcı adı. Kullanıcı Gündem'de ad değiştirirse tablo adı da değişir (kayıt `userId`'ye bağlı, ad her sorguda `User`'dan okunur).
- **Takma ad filtresi** kısa bir listedir; yanlış pozitif/negatif olabilir. Yöneticiye bildirim yok.
- **CDN 30 sn:** Yeni kayıt tabloda en geç ~30–90 sn (s-maxage + swr) içinde görünür; oyuncunun kendi sırası (`/api/frikik/me`) anında.
- **Ay sonu:** Aylık tablo takvim ayına göre; ayın son günü 23:59'da biten koşu o aya yazılır (gün = TR günü).
- **`sharp` sürümü:** origin/main `sharp ^0.35.5` istiyor, `node_modules`'da 0.34.5 var (paralel oturumlar ortak `node_modules` kullandığı için `npm install` çalıştırılmadı). Push öncesi tek oturumda `npm install`.

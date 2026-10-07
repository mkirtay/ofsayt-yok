# Ofsayt Yok (web) — Güvenlik Denetimi Raporu

- **Tarih:** 2026-10-07
- **İncelenen sürüm:** `83321cc` (main). Görev `c6d4a90` üzerinde başladı; aradaki tek commit yalnız frikik dosyalarına dokunuyor.
- **Yöntem:** salt okuma, statik analiz.
  - Prod'a istek atılmadı, dev sunucu çalıştırılmadı (yerel env üretim servislerine bağlı), `.env*` dosyaları açılmadı.
  - İlgili mevcut vitest testleri çalıştırıldı; hepsi geçti.
  - Bazı iddialar yalnız scratchpad'deki betiklerle sınandı: regex süresi, Sentry scrub'ı sahte olayla, `next-auth` `encode` boş sırla. Bu betiklerde gerçek veri ya da sır kullanılmadı.
  - Ağ erişimi yalnız `npm audit` ve `gh repo view` (repo görünürlüğü) içindi.
- **Kapsam:** 9 alan. Ayrıntılar §3–§5'te.
  1. Kimlik/oturum/NextAuth, admin yetkilendirme, CRON_SECRET'lı uçlar
  2. IDOR
  3. Rate limit ve kötüye kullanım
  4. AI limitleri ve kredi yarışı
  5. Ödeme/webhook
  6. XSS/CSRF/başlıklar
  7. NEXT_PUBLIC_ ve istemci paketi
  8. Bağımlılıklar
  9. Log/Sentry'de kişisel veri
- **Durum etiketleri:**
  - **DOĞRULANDI:** Kod yolu baştan sona izlendi.
  - **VARSAYIM:** Koddan görülemeyen bir koşula dayanıyor (prod env, Vercel/Sentry/Upstash/Hikie davranışı, panel ayarı). Neyin kontrol edilmesi gerektiği yanında yazılı.

---

## 0. Düzeltme durumu (güncelleme 2026-10-07 gece)

Düzeltmeler dört ayrı dalda, `83321cc` tabanı üzerine. **Push yok, main'e alınmadı.**
- Her dal kendi worktree'sinde doğrulandı: tsc 0 hata, tam vitest seti geçti, `next build` exit 0.
- `npm run lint` her dalda ve main'de aynı önceden var olan 11 hata / 4 uyarıyı veriyor. Hiçbiri bu dalların dosyalarında değil.
- Dört dal geçici bir worktree'de sırayla deneme birleştirildi: **çakışma yok**. Birleşik sonuçta tsc temiz, 2053 test geçti, build geçti, nft koruma testi build çıktısı üzerinde geçti.

| Dal | Commit'ler | Kapatılan bulgular |
|---|---|---|
| `security/a-sentry-scrub` | `ca9f510` | **Y1, Y2** · D36 |
| `security/b-google-linking` | `f49c3fa` | **Y3** |
| `security/c-input-og` | `01c3a4b`, `3ead641` | **Y5, Y6** · D33 (OG logo fetch) |
| `security/d-signup-proxy` | `f311d49`, `b620b45`, `135b432`, `46adbab` | **O2, O10** · D33 (imgLogo) · O7'nin proxy kısmı (kısmen) |
| `security/docs-report` | bu rapor | — |

**Durum değişiklikleri:**

- **Y1 — DÜZELTİLDİ (`ca9f510`).**
  - Sportmonks v3 `Authorization: <token>` başlığını (Bearer'sız) kabul ediyor. Bu belgeyle ve canlı karşılaştırmayla doğrulandı: sorgu parametresiyle 200, başlıkla 200, kimliksiz 401.
  - `cachedFetch` ve `httpClient` artık token'ı başlıkla gönderiyor, URL'de token yok. Önbellek anahtarları değişmedi.
  - Kullanılmayan `sportmonksRequestByUrl` silindi.
  - **Yapılması gereken:** deploy sonrası anahtar rotasyonu (`docs/SPORTMONKS_ANAHTAR_ROTASYONU.md`); ardından Sentry'de eski olayların silinmesi ve `api_token=[^&]+` kuralı.
- **Y2 — DÜZELTİLDİ (`ca9f510`).**
  - `scrubSentryEvent` ve yeni `scrubSentryBreadcrumb` olayın tamamını derin dolaşıyor: request url, query_string, data, headers, cookies; extra, contexts, tags, exception; breadcrumb'ta `http.query`, `url`, `to`, `from` ve console `arguments`.
  - Temizlenen anahtarlar: api_token, token, access_token, refresh_token, resetToken, password, newPassword, currentPassword, authorization, cookie, set-cookie, secret, CRON_SECRET.
  - Sunucu ve istemcide `sendDefaultPii: false` açıkça yazıldı; ikisinde de `beforeBreadcrumb` var.
  - Sunucu gelen istek gövdesini hiç yakalamıyor: `httpIntegration({ maxIncomingRequestBodySize: 'none' })`, çift entegrasyon yok.
  - 45 sahte olay testi ve gerçek `@sentry/core` zinciri testi eklendi.
  - Sentry panelindeki scrubber ayarlarını kullanıcı açıyor.
- **Y3 — DÜZELTİLDİ (`f49c3fa`).** Google girişi prod'da açık (artık VARSAYIM değil).
  - Google hesabı henüz bağlı değilse ve aynı e-postalı hesap şifreliyse ya da doğrulanmamışsa, `signIn` callback'inde tek transaction'da `password = null`, `tokenVersion + 1` ve `emailVerified ??= now` yazılıyor; ardından oturum önbelleği siliniyor. Bu adım NextAuth'un `callbackHandler`'ı kullanıcıyı e-postayla bulup bağlamadan önce çalışıyor (`node_modules/next-auth/core/routes/callback.js:78` → `:104`).
  - Sonuç: saldırganın web oturumu ve mobil belirteci düşüyor, kurbanın yeni Google oturumu geçerli kalıyor.
  - Bu sırada bulunan ek hata da düzeltildi: `onOAuthUserCreated`, bağlanan mevcut hesabın kredisini 0'layabiliyordu.
  - Bedel: şifreli meşru kullanıcının şifresi silinir. Mobilde Google girişi olmadığı için böyle bir kullanıcı mobilde "şifremi unuttum" akışına muhtaç kalır; ürün bilgilendirmesi önerilir.
  - Testler: 10 PGlite entegrasyon testi (gerçek PrismaAdapter + NextAuth `callbackHandler`) ve 4 birim testi.
- **Y4 — AÇIK.** AI chat'ine devredildi.
- **Y5 — DÜZELTİLDİ (`01c3a4b`).**
  - `sanitizePlainText` elle tarama ile doğrusal hale getirildi. Eski regex ile birebir eşdeğer: 19 elle seçilmiş ve 5.000 rastgele örnekle karşılaştırıldı. 100 bin `<` girdisinde süre 3.669 ms'den 0,1 ms'ye düştü.
  - İşlemeden önce ham uzunluk tavanı: name 400, bio 8.000, image 4.096; gündem gönderi/yorum 2.000.
  - `PATCH /api/user/me` için kullanıcı başına 20 / 10 dk hız sınırı.
  - Me, gündem gönderi/yorum ve 6 kimlik ucunda `bodyParser.sizeLimit: '16kb'`; aşan gövde yerel üretimde 413 aldı.
- **Y6 — DÜZELTİLDİ (`3ead641`).**
  - OG uçlarında izinli sorgu anahtarları: frikik `l`, `s`; maç ve takım `v`. Karşılaştırma ham URL ile yapılıyor (`initURL`).
  - Fazla ya da tekrarlanan anahtar, baştaki sıfır ve farklı kodlama çizim yapılmadan 308 ile kanonik adrese yönleniyor (1 gün cache).
  - IP başına 30/dk ve global 300 / 10 dk çizim bütçesi; aşılınca varsayılan görsele 307 (`private, max-age=60`).
  - Yerel ölçüm: çizim 38–58 ms CPU, kanonik yönlendirme ~0,7 ms. Vercel'de 2–3 kat yavaş olması beklenir.
  - **`@vercel/og/index.node.js` Sentry hatası:** bugünkü kodda oluşmuyor. Üç OG ucunun nft dosyasında `index.node.js`, `resvg.wasm` ve `yoga.wasm` var; Lambda benzeri ortamda 200 dönüyor. Dosya silinince hatanın birebir aynısı çıkıyor. Hata, a5fcba9 (2026-10-02 20:25, origin/main'de) öncesi deploy'lardaki dinamik import tuzağı. Sentry olaylarının zamanı ya da release'i a5fcba9'dan önceyse sorun kapanmış demektir. Koruma testi build çıktısı üzerinde çalışıyor.
  - Deploy sonrası tek kontrol: `curl -sI 'https://www.ofsaytyok.app/api/og/match/<id>?v=<güncel>'` 200 dönmeli, 308 dönmemeli.
- **O2 — DÜZELTİLDİ (`f311d49`, `46adbab`).**
  - `canonicalEmail`: `+etiket` her alan adında atılıyor; gmail/googlemail'de noktalar da atılıyor; IDN alan adları punycode'a çevriliyor. Yahoo `-` takma adı atılmıyor, gerekçesi kodda.
  - `grantVerifiedSignupBonus`: e-posta doğrulanmamışsa bonus yok. Aynı kanonik posta kutusundaki başka bir hesap bonusu almışsa da yok; buna eski kuralla açılmış `ali+1@…` hesapları da dahil. Eşzamanlı doğrulamalar `pg_advisory_xact_lock` ile sıraya giriyor. Bu davranış PGlite üzerinde gerçek SQL ile test edildi.
  - Geçici e-posta kontrolü doğrusal hale geldi, alt alan adlarını yakalıyor, liste 20 alanla genişletildi.
  - Mevcut satırlar için `scripts/backfill-email-normalized.mjs` hazır (varsayılan dry-run, `--apply` yazar). **Çalıştırılmadı**; kullanım `docs/DB_ARACLARI.md`'de, sıra "önce deploy, sonra betik".
- **O7 (proxy kısmı) — KISMEN.**
  - Yol normalizasyonu her modda 400: `..`, `%2E%2E`, `%252E%252E`, `%2F`, ters bölü, NUL ve Unicode nokta/bölü benzerleri.
  - Takım aramasında meşru noktalama (`&`, `(`, `)`, `,`, `’`) ve birleşik aksanlar kabul ediliyor.
  - 200 dışı proxy yanıtları `no-store`.
  - IP başına 100/dk sınırı zaten vardı, değişmedi.
  - Sportmonks havuz koruması ve SSR/OG/compare yolları Sportmonks kota chat'inde.
  - Sentry'deki dört olay türünün kararları ve enforce geçiş adımları `docs/SPORTMONKS_PROXY_IZIN_LISTESI.md`'de: odds/bookmakers meşru değil; `%2E%2E` saldırı; `teams/search` meşru; `teams/{id}?include=` için Sentry'deki `violations` ekine bakılmalı.
  - Kod varsayılanı zaten enforce (env tanımsızsa).
- **O10 — DÜZELTİLDİ (`135b432`).**
  - sharp 0.35.5'e çıktı (libvips 8.18.7); lock farkı yalnız sharp ağacında.
  - `imgLogo`'da `redirect: 'error'`; sharp yükleyicileri PNG/JPEG/WebP/GIF ile sınırlandı (`sharp.block`/`unblock`). OG logo dönüşümü testle doğrulandı; AVIF logo artık baş harflere düşüyor.
  - Kalan: next 16.1.6'nın kendi `sharp@0.34.5` kopyası `npm audit`'te görünmeye devam ediyor. Bu kopyayı Vercel'de görsel servisi kullanmıyor (D27); next yükseltmesiyle ya da `overrides` ile kapatılır.
- **Supabase RLS (§6) — KAPATILDI.** Kullanıcı doğruladı: Security Advisor 0 hata; tüm tablolarda RLS açık ve politika yok, bu istenen durum. Kural notu `docs/DB_ARACLARI.md`'de: Prisma ile eklenen her yeni tablonun migration'ına `ENABLE ROW LEVEL SECURITY` eklenecek ve Advisor'da doğrulanacak.

**Bu turda kapsam dışı (başka chat'ler ya da sonraki iş):**
- Y4, O3, O4, O5, O6 (AI kota/bütçe).
- O1 (Hikie iade; `feature/payments-refund-terms` dalında çalışılıyor).
- O7'nin havuz kısmı, teknik-direktor, bot-tick (Sportmonks kota chat'i).
- O8, O9, O11–O14 ve §4'teki diğer Düşük bulgular açık.

**Yeni bulgu — Orta:** `npm run test:db` (`vitest.db.config.ts` → `src/test/db/setup.ts`) `.env.local` dosyasını yüklüyor; `DATABASE_URL` uzak Supabase'i gösteriyor. Bu komut çalıştırılırsa testler büyük olasılıkla prod DB'ye yazar. Bu turda hiçbir ajan çalıştırmadı. Öneri: DB testlerini `src/test/pglite/pgliteServer.ts` yardımcısına taşımak ve setup'ta uzak host'a bağlanmayı reddetmek.

**Birleştirme notu:** `security/b-google-linking` ve `security/d-signup-proxy` dalları `src/test/pglite/pgliteServer.ts` dosyasını birebir aynı içerikle ekliyor; çakışma yok. A ve D dalları `src/test/api/sportmonksProxy.test.ts`'in farklı kısımlarını değiştiriyor; deneme birleştirmede çakışma çıkmadı.

---

## 1. Özet

| Önem | Adet | Başlıca konular |
|---|---|---|
| Kritik | 0 | — |
| Yüksek | 6 | Sentry'ye Sportmonks anahtarı ve istek gövdesi (şifre) gidiyor; Google bağlamasıyla hesabı önceden açma; asistanın zaman aşımı yolunda kota/bütçe yazılmıyor; kuadratik metin temizleme (CPU); OG görsellerinde sınırsız kimliksiz çizim |
| Orta | 14 | İadede kredi geri alınmıyor; çoklu hesapla bonus; asistan kotası TOCTOU; Redis kesintisinde sınırsız LLM; trivia; Sportmonks havuzunu tüketme; kayıtta sınırsız `name`; IP'ye bağlı kimlik limitleri; sharp açıkları; Sentry başlıkları; URL'de e-posta; Redis anahtarlarında kişisel veri; OAuth belirteç saklama |
| Düşük | 30+ | Savunma derinliği (CSRF tek katman, CSP, başlıklar, enumerasyon, eski uçlar, bağımlılık güncellemeleri…) |

**Kritik bulgu yok:**
- Ödeme yapmadan kredi alınamıyor.
- Kilitli analiz kredi harcamadan açılamıyor.
- Çift harcama yok.
- Admin yetkisi atlatılamıyor.
- Herkese açık bir sır sızıntısı yok (istemci paketi, `__NEXT_DATA__`, `public/` ve git geçmişi temiz; repo PUBLIC olarak doğrulandı).
- XSS vektörü bulunamadı.

Alt ajanlardan biri "Sportmonks anahtarı Sentry'ye gidiyor" bulgusunu Kritik önerdi. Bu raporda Yüksek: sır kamuya değil, Sentry erişimi olanlara açılıyor (§2.1).

**Önce yapılması önerilenler (etki × efor):**
1. `src/lib/sentryScrub.ts`: breadcrumb `data` içindeki tüm string değerleri temizle; `request.data`'yı sil. Ardından **Sportmonks anahtarını yenile** ve eski Sentry olaylarını sil (Y1, Y2).
2. `src/lib/oauth.ts` `onOAuthAccountLinked`: şifreli ya da doğrulanmamış hesaba bağlarken `tokenVersion` artır ve oturum önbelleğini sil (Y3).
3. Asistan: kotayı ve bütçeyi çalıştırmadan önce atomik ayır; `finally` içinde gerçek maliyetle düzelt; araç çağrısı sayısına tavan koy (Y4, O3).
4. Metin girdilerinde ham uzunluk tavanı ve bodyParser `sizeLimit` (Y5, O8).
5. OG, `img/logo` ve sitemap: kanonik olmayan sorguyu yönlendir; IP limiti ve global çizim bütçesi ekle (Y6).
6. Hikie iade ve iptal olaylarını `refundOrder`'a bağla (O1).

---

## 2. Yüksek bulgular — adım adım sömürü

### Y1. [Yüksek] Sportmonks `api_token`, sunucu Sentry olaylarına fetch breadcrumb'ının `http.query` alanında gidiyor

- **Konum:**
  - `src/server/sportmonks/cachedFetch.ts:270` (`qs.set('api_token', apiToken)`) ve `:280-282` (global `fetch`, token sorguda)
  - `src/lib/sentryScrub.ts:62-67`: breadcrumb'ta yalnız `message`, `data.url`, `data.to`, `data.from` temizleniyor.
  - SDK: `node_modules/@sentry/node-core/build/cjs/utils/outgoingFetchRequest.js` (`getBreadcrumbData`): `url` sorgusuz yazılıyor, sorgu ayrıca `data["http.query"]`'ye konuyor.
  - `node_modules/@sentry/node/build/cjs/sdk/index.js:12`: `nativeNodeFetchIntegration` varsayılan olarak açık.
  - `sentry.server.config.ts:11-19`: entegrasyon değiştirilmemiş.
- **Durum:** DOĞRULANDI.
  - Sahte olay denemesi: `scrubSentryEvent({breadcrumbs:[{data:{'http.query':'?include=x&api_token=SECRETVALUE'}}]})` sonrası değer korunuyor.
  - `src/lib/sentryScrub.test.ts:28` gerçekte oluşmayan bir şekli (sorgu `data.url` içinde) test ediyor.
  - VARSAYIM: Sentry projesinin sunucu tarafı Data Scrubber'ının bu değeri silmediği. Kontrol: Sentry'de herhangi bir sunucu olayında Breadcrumbs › http satırı.
- **Sömürü:**
  1. Herhangi bir sunucu işi Sportmonks'a gider. Örnekler: `GET /matches/<slug>` SSR, `POST /api/matches/<id>/analysis`, cron, gündem botu. SDK breadcrumb'a `http.query: "?include=…&api_token=<anahtar>"` yazar.
  2. Aynı istekte ya da breadcrumb tamponu (≤100) içinde bir Sentry olayı oluşur. Örnekler: `reportSportmonksQuota` kota uyarısı (`cachedFetch.ts:294`, fetch'in hemen ardından), herhangi bir `captureError` ya da `onRequestError`.
  3. Olay `beforeSend` → `scrubSentryEvent`'ten geçer, `http.query` dokunulmadan Sentry'ye gider.
  4. Sentry projesine erişen biri (org üyesi, entegrasyon, ele geçirilmiş Sentry hesabı) ücretli Sportmonks anahtarını okur. Anahtarla planı kendi işi için kullanabilir ya da saatlik havuzu tüketip sitenin canlı verisini düşürebilir.
- **Neden Kritik değil:** Sır herkese değil, Sentry erişimi olanlara açılıyor; Vercel loglarına yazılmıyor.
- **Düzeltme:**
  - `scrubSentryEvent` breadcrumb `data` içindeki tüm string değerlere `scrubSecretParams` uygulasın (en az `http.query` ve `http.fragment`).
  - Ek: `beforeBreadcrumb` ya da `nativeNodeFetchIntegration({ ignoreOutgoingRequests: u => u.startsWith('https://api.sportmonks.com') })`.
  - Mümkünse token'ı başlıkla gönder (VARSAYIM: Sportmonks v3 destekliyor).
  - Yayından sonra **anahtarı yenile**. Sentry'ye Advanced Data Scrubbing kuralı ekle (`api_token=[^&]+`) ve eski olayları sil.
  - Testi gerçek alan adıyla güncelle.

### Y2. [Yüksek] Sunucu Sentry olaylarına ham istek gövdesi ekleniyor; `request.data` temizlenmiyor (düz şifre, sıfırlama belirteci, sohbet metni)

- **Konum:**
  - `src/lib/sentryScrub.ts:46-58`: `request.data`'ya dokunulmuyor.
  - SDK varsayılanları: `@sentry/core` requestData `include.data: true`; http entegrasyonu gövdeyi `maxRequestBodySize: "medium"` (≤10 KB) ile yakalıyor, `sendDefaultPii:false` iken bile.
  - Etkilenen uçlar (yakalanmamış hata `onRequestError`'a gider ya da istek içinde `captureError` çağrılır):
    - `src/pages/api/mobile/auth/login.ts` (try yok)
    - `src/pages/api/auth/register.ts` + `src/lib/accounts.ts` (P2002 dışı hatalar yeniden fırlatılıyor)
    - `src/pages/api/mobile/auth/register.ts`
    - `src/pages/api/auth/reset-password.ts:37-49` (try yok)
    - `src/pages/api/user/password.ts`
    - `src/pages/api/auth/forgot-password.ts`
    - `src/pages/api/assistant/chat.ts:138`
    - `src/pages/api/push/register.ts:54`
- **Durum:**
  - Scrub boşluğu DOĞRULANDI: sahte olayda `request.data: {"password":"p"}` olduğu gibi kaldı.
  - SDK'nın Pages API isteklerinde gövdeyi gerçekten doldurması VARSAYIM. Kontrol: Sentry'de POST uçlu bir sunucu olayında "Request › Body" var mı?
  - Sentry'de Default Data Scrubbers açıksa `password` ve `token` adlı alanlar sunucuda `[Filtered]` olur. E-posta, ad ve sohbet metni yine kalır.
- **Sömürü:**
  1. Kimlik uçlarında beklenmeyen bir hata olur. Örnekler: DB bağlantı havuzunun dolması, Prisma/Redis kesintisi, `reset-password`'ta aynı belirtecin çift gönderimi (ikinci istek `verificationToken.delete`'te P2025).
  2. İstek `POST /api/mobile/auth/login {"emailOrUsername":"ali@…","password":"…"}` ya da `POST /api/auth/reset-password {"token":"<geçerli>","password":"…"}`; yanıt 500.
  3. Sentry olayı `request.data` içinde düz şifreyi, e-postayı ve (sıfırlamada henüz tüketilmemişse) geçerli belirteci taşır.
  4. Sentry erişimi olan biri şifreyle hesaba girer; şifre başka sitelerde de kullanılıyorsa oralarda da. Data Scrubber kapalıysa bu fiilen Kritik.
  5. Ayrıca bu davranış gizlilik metniyle çelişiyor: `public/locales/tr/legal.json:27` Sentry'ye ad/e-posta gitmediğini söylüyor.
- **Düzeltme:**
  - `scrubSentryEvent` içinde `delete e.request.data`. Ek olarak `Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' })`.
  - Kimlik uçlarında DB çağrılarını try/catch ile sar: kontrollü 503 + gövdesiz `captureError`.
  - Sentry panelinde Data Scrubber'ın açık olduğunu doğrula.

### Y3. [Yüksek] Hesabı önceden açma: Google ile e-postaya göre bağlama, saldırganın açık oturumlarını düşürmüyor

- **Konum:**
  - `src/lib/oauth.ts:44` (`allowDangerousEmailAccountLinking: true`)
  - `src/lib/oauth.ts:71-78` (`onOAuthAccountLinked`: yalnız `emailVerified` ve `password: null`; `tokenVersion` değişmiyor). Çağıran: `src/lib/auth-options.ts:184` (`events.linkAccount`).
  - `src/lib/auth-options.ts:81-84`: Credentials girişi `emailVerified`'a bakmıyor.
  - `src/pages/api/mobile/auth/register.ts:58-72`: kayıttan hemen sonra 30 günlük belirteç ("email doğrulaması girişi engellemiyor").
  - İptal yalnız `tokenVersion`'a bağlı: `src/lib/auth-options.ts:129-130`, `src/lib/mobileAuth.ts:89-90`. `tokenVersion` yalnız iki yerde artıyor: `src/pages/api/user/password.ts:74` ve `src/pages/api/auth/reset-password.ts:46`.
  - NextAuth bağlama akışı: `node_modules/next-auth/core/lib/callback-handler.js:152-185`.
- **Durum:** DOĞRULANDI. Google girişinin prod'da açık olması (`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` tanımlı) VARSAYIM.
- **Sömürü:**
  1. Oturumsuz saldırgan, kurbanın henüz kayıtlı olmayan Gmail adresiyle kayıt olur: `POST /api/mobile/auth/register {"email":"kurban@gmail.com","password":"<saldırganın>","username":"…","turnstileToken":"<elle çözülmüş>"}`. Yanıt: **201** `{token, user}`. Belirteç 30 gün geçerli, `tokenVersion = 0`. Web'de de şifreyle girip oturum çerezi alabilir.
  2. Kurban daha sonra "Google ile giriş" yapar. `/api/auth/callback/google` çalışır, `signIn` callback geçer (Google e-postası doğrulanmış). NextAuth `getUserByEmail` ile saldırganın açtığı satırı bulur, Google hesabını ona bağlar.
  3. `events.linkAccount` → `onOAuthAccountLinked`: `emailVerified = now`, `password = null`, +2 kredi bonusu. `tokenVersion` değişmez, Redis sürüm önbelleği silinmez.
  4. Saldırgan `GET /api/user/me` (`Authorization: Bearer <1. adımdaki belirteç>`) gönderir. `getRequestAuth` (`mobileAuth.ts:78-100`) sürümü karşılaştırır, 0 = 0 olduğu için **200** döner ve kurbanın profili, e-postası, kredisi ve premium bilgisi gelir.
  5. Aynı belirteçle saldırgan şunları yapabilir:
     - kurbanın satın aldığı kredilerle `POST /api/matches/<id>/analysis` (kredi harcar);
     - `GET /api/credits/history`, `GET /api/payments/order`;
     - Gündem'de kurban adına gönderi/yorum;
     - `PATCH /api/user/me`;
     - `POST /api/push/register`.
     Web çerezi her kullanımda uzadığı için erişim süresiz sürebilir. Kurban ancak "şifremi unuttum" akışını kullanırsa saldırgan düşer.
  6. Varyant: kurban kayıttan sonra gelen doğrulama e-postasındaki bağlantıya tıklarsa `emailVerified` dolar. Bu durumda Google bağlamasında `count = 0` olur, şifre de silinmez ve saldırgan şifreyle girmeye devam eder.
- **Düzeltme:**
  - Şifresi olan ya da e-postası doğrulanmamış bir hesaba e-postayla bağlarken `password: null, tokenVersion: { increment: 1 }` yaz ve `invalidateSessionVersion(userId)` çağır.
  - Dikkat: jwt callback'e verilen `user` nesnesi bu güncellemeden önce okunuyor. Bu yüzden ya işi `signIn` callback'ine taşı (callbackHandler kullanıcıyı sonra okur), ya da jwt'de `account?.type === 'oauth'` iken `tokenVersion`'ı DB'den yeniden oku. Aksi halde kurbanın yeni oturumu da ilk istekte düşer.
  - Daha sıkı alternatif: şifreli mevcut hesaba otomatik bağlamayı kapat, kullanıcıyı "şifremi unuttum" akışına yönlendir.
  - Kullanıcıya "Google hesabı bağlandı" e-postası gönder.
  - DB testi: bağlamadan önce verilmiş web ve mobil belirteç, bağlamadan sonra 401 almalı.

### Y4. [Yüksek] AI Asistan: zaman aşımı ya da hata yolunda ne kota ne günlük bütçe yazılıyor; araç çağrısı sayısının tavanı yok

- **Konum:**
  - `src/pages/api/assistant/chat.ts:29` (`RUN_TIMEOUT_MS = 25_000`), `:109-111`.
  - `:135`: `recordAssistantUsage`, tek kayıt yeri, `try` içinde.
  - `:137-139`: `catch` yalnız `TIMEOUT`/`ERROR` olayı yazıyor; kota ve bütçe yazılmıyor.
  - `src/server/assistant/chat.ts:153-173`: `toolCalls` adet sınırsız, sırayla `await runAssistantTool(...)`, araçlara `signal` geçmiyor.
  - `src/server/assistant/quota.ts:82-87`.
- **Durum:** Kodda kayıt atlanması ve araç tavanının olmaması DOĞRULANDI. VARSAYIM: saldırganın istekleri güvenilir biçimde 25 sn'nin üstüne itebilmesi. Bunun için model tek turda çok sayıda araç çağrısı üretmeli ve soğuk önbellekte Sportmonks yavaş yanıt vermeli; araç başına 5 sn zaman aşımı var. Kontrol: prod loglarında `{"event":"assistant-chat","outcome":"error",…,"ms":≥25000}` satırları.
- **Sömürü:**
  1. Kimliksiz saldırgan şunu gönderir: `POST /api/assistant/chat {"messages":[{"role":"user","content":"Şu 20 takımın sıradaki maçı ve yayın kanalı: Galatasaray, Fenerbahçe, … (≤300 karakter)"}]}`.
  2. `checkAssistantQuota` (`:95`) geçer (misafirin 3 hakkı var). Yanıt **200** `text/event-stream`.
  3. Model 0. turda çok sayıda `find_team` / `get_fixtures` çağrısı üretir; çağrılar sırayla Sportmonks'a gider.
  4. 25 sn'de `abort` olur, `runAssistantChat` fırlatır. Akışın son olayı `event: error` / `data: {"code":"TIMEOUT"}`. `recordAssistantUsage` çalışmaz: `ip:` ve `c:` sayaçları ile günlük bütçe değişmez. Log satırı da `tokens: {input:0…}` yazar, maliyet izlemede görünmez.
  5. Saldırgan aynı isteği tekrarlar. Tek sınır hız limiti: /24 başına 6/dk, günde ~8.600 koşu. Her koşu ≤4 LLM çağrısı ve onlarca Sportmonks isteği harcar.
  6. Sonuç: misafir kotası (3/gün) ve 5 USD/gün sigortası tetiklenmeden, IP sayısıyla doğrusal artan LLM maliyeti ve Sportmonks havuzu tüketimi. Girişli kullanıcı da aynı yolla 15/gün kotasını aşar.
- **Düzeltme:**
  - Kotayı ve bütçeyi istek başında atomik ayır (Lua: INCR + sınır kontrolü + gerekirse DECR).
  - `runAssistantChat` her turun `usage`'ını dışarı aktarsın; rota `finally` içinde (zaman aşımı dahil) gerçek ya da üst sınır maliyeti bütçeye yazsın.
  - Araç tavanı: tur başına ≤4, istek başına ≤6 çağrı; ayrıca `parallel_tool_calls: false` değerlendirilmeli.
  - Araçlara `signal` geçir.
  - `req.on('close')` yerine `res.on('close')`. Ancak yalnız kota önceden ayrıldıktan sonra; aksi halde bağlantıyı kesmek yeni bir atlatma yolu olur.

### Y5. [Yüksek] Kullanıcı metninde kuadratik regex, uzunluk kontrolünden önce çalışıyor (tek istekle uzun süreli CPU tüketimi)

- **Konum:**
  - `src/lib/security.ts:217` (`input.replace(/<[^>]*>/g, '')`, `"<<<…"` girdisinde O(n²)) ve `:224` (`/ *\n */g`, uzun boşlukta O(n²)).
  - Çağrı yerleri, uzunluk kontrolü işlemeden SONRA:
    - `src/pages/api/user/me.ts:71-74` (name), `:86-89` (image), `:122-125` (bio). **Bu uçta hız sınırı yok.**
    - `src/pages/api/gundem/posts/index.ts:114-115` ve `src/pages/api/gundem/posts/[postId]/comments.ts:53-54` (5/dk).
  - `src/lib/disposableEmail.ts:14-17`: e-posta alan adında benzer O(n²); kayıtta, Turnstile'dan sonra.
  - Gövde sınırı Next varsayılanı 1 MB.
- **Durum:** DOĞRULANDI. Yerel ölçüm (Node 22, aynı regex):

  | Girdi | Süre |
  |---|---|
  | 25.000 `<` | 221 ms |
  | 50.000 `<` | 881 ms |
  | 100.000 `<` | 3,55 sn |

  Uzunluk iki katına çıkınca süre ~4 katına çıkıyor; 1 MB'ta yüzlerce saniye eder. VARSAYIM: Vercel'in fonksiyonu `maxDuration`'da kesmesi ve bunun Hobby Active CPU kotasına ve aynı instance'taki diğer isteklere etkisi.
- **Sömürü:**
  1. Saldırgan ücretsiz bir hesap açar (e-posta doğrulaması gerekmez) ve oturum çerezi alır.
  2. `PATCH /api/user/me`, `Content-Type: application/json`, gövde `{"bio":"<<<<…(~1.000.000 karakter)"}`.
  3. Handler `sanitizePlainText`'i çalıştırır, fonksiyon süre sınırına kadar %100 CPU harcar. Yanıt ya geç bir **400** ("Hakkımda en fazla … karakter") ya da platform zaman aşımı.
  4. İstek paralel ve sürekli tekrarlanır (hız sınırı yok). Hobby'de CPU kotası biter ya da fonksiyonlar yavaşlar; site geneli kullanılabilirlik düşer.
- **Düzeltme:**
  - İşlemeden önce ham uzunluk tavanı koy, aşarsa 400: name 400, bio 8.000, image 4.096, post/yorum 2.000, e-posta 254.
  - Bu uçlara `export const config = { api: { bodyParser: { sizeLimit: '16kb' } } }` ekle.
  - Regex'i doğrusal yap (`/<[^<>]*>/g`); satır kırpmayı `split('\n')` ile yap.
  - `isDisposableEmail`'de alan adı parça sayısını sınırla.
  - `PATCH /api/user/me`'ye kullanıcı başına hız limiti ekle.

### Y6. [Yüksek] OG görsel uçları kimliksiz ve hız sınırsız; fazladan sorgu parametresi CDN önbelleğini atlatıp her istekte PNG çizdiriyor

- **Konum:**
  - `src/pages/api/og/frikik.ts:19-23`: `s` ve `l` yoksa `info = null` olur ve parametre kontrolü yapılmadan varsayılan kart çizilir.
  - `src/pages/api/og/match/[id].ts:35-38`: yalnız `v` doğrulanıyor; diğer parametreler serbest.
  - `src/pages/api/og/team/[id].ts`.
  - `src/pages/api/og/**` içinde `hitFixedWindowRateLimit` yok.
  - `src/server/og/ogCache.ts:2-3`: kodun kendi notu, "Görsel çizimi (~100–300 ms CPU) Hobby'nin en dar kaynağı (Active CPU)".
  - Aynı desen: `src/pages/sitemap.xml.tsx`, `src/pages/api/img/logo.ts` (300/dk/IP).
- **Durum:** Limit yokluğu ve parametre kabulü DOĞRULANDI. VARSAYIM: Vercel CDN önbellek anahtarının tüm sorgu dizesini içermesi (varsayılan davranış) ve Hobby CPU kotasının etkisi.
- **Sömürü:**
  1. Kimliksiz bot `GET /api/og/frikik?r=1`, `?r=2`, … isteklerini saniyede ~10 kez gönderir.
  2. Her benzersiz adres CDN'de ıska verir. Fonksiyon satori ile 1200×630 PNG çizer; yanıt **200** `image/png`, `Cache-Control: public, … s-maxage=31536000, immutable`. Yeni anahtar her seferinde yeniden çizdirir.
  3. `og/match` için: önce `/api/og/match/<id>` çağrılır, 307 `Location`'dan `v` alınır, sonra `?v=<v>&r=$i`. Her çizimde ayrıca 2 logo indirilir ve sharp çalışır.
  4. Saniyede 1–3 CPU-sn harcanır; Hobby Active CPU kotası saatler içinde biter ve tüm fonksiyonlar etkilenir (VARSAYIM).
- **Düzeltme:**
  - Beklenen anahtarlar dışında sorgu varsa çizmeden kanonik adrese 308 dön (og/*, img/logo, sitemap).
  - Çizim yoluna IP başına limit (ör. 30/dk) ve Redis'te global çizim bütçesi ekle; bütçe aşılınca varsayılan görsele 307.
  - Frikik seviye kartında skor uzayını daralt: kodun "adres uzayı sınırlı" yorumuna rağmen geçerli `(l, s)` çifti ~36,7 milyon.

---

## 3. Orta bulgular

| # | Bulgu | Konum | Durum | Sömürü (kısa) | Düzeltme |
|---|---|---|---|---|---|
| O1 | Hikie iade/iptal ya da ters ibrazda kredi ve premium geri alınmıyor; `refundOrder` hiçbir uçtan çağrılmıyor | `src/server/payments/paymentOrders.ts:392-395`, `:190-234` | DOĞRULANDI. Hikie'nin dispute olayı VARSAYIM | credits_100 al, 100 krediyle analiz aç (kalıcı), sonra bankadan ters ibraz iste. Kredi ve açılmış analizler kalır | REFUNDED/CANCELLED olayını `refundOrder`'a bağla. Siparişi imzalı `hikieOrderId` ile bul, merchantOrderId ile değil. Bilinmeyen olayları logla. Yönetici iade ucu ekle |
| O2 | Kayıt bonusu ve haftalık ücretsiz açma çoklu hesapla toplanabiliyor; `+etiket` kanonikleştirmesi yalnız Gmail'de | `src/lib/emailNormalize.ts:8-17`, `src/lib/accounts.ts:79-86`, `src/lib/credits.ts:200-230`, `src/lib/analysisUnlock.ts:151-181` | DOĞRULANDI | `ali+1@outlook.com`, `ali+2@…` (ya da catch-all alan adı) ile N hesap aç (5 kayıt/15 dk/IP, Turnstile). Her hesap +2 kredi ve haftada +1 ücretsiz açma alır. 2026-10-04 öncesi satırlarda `emailNormalized` boş | Outlook/iCloud/Proton/Yandex için `+` kanonikleştir. Eski satırları geri doldur. IP /24 başına günlük bonus tavanı koy |
| O3 | Asistan kota ve bütçesi "oku → çalıştır → sonra artır" düzeninde (TOCTOU) | `src/server/assistant/quota.ts:43-46,63-87`, `src/pages/api/assistant/chat.ts:95,135` | DOĞRULANDI | 14/15 hakkı kullanılmış kullanıcı hız penceresi sınırında 6+6 eşzamanlı istek atar; hepsi `used=14` görür, gün ~26 mesajla kapanır. Bütçe de uçuştaki istekler kadar aşılır | Lua ile atomik ayırma (INCR → aşarsa DECR + red); `empty` sonuçta iade |
| O4 | Redis kesintisinde ya da devre kesici açıkken girişli kullanıcı için LLM uçları fiilen sınırsız; bütçe kontrolü atlanıyor | `src/server/assistant/quota.ts:44-55,65-76`; `src/lib/rateLimit.ts:93-100` (varsayılan fail-open); `trivia.ts:31`; `analysis.ts:200`; `src/lib/analysisGenerationLock.ts:23` | DOĞRULANDI. Kesintinin saldırganca tetiklenmesi VARSAYIM | Kesinti sırasında tek hesap yüzlerce eşzamanlı asistan/trivia isteği gönderir (sayaç yalnız instance belleğinde). Premium hesap aynı maça N eşzamanlı üretim tetikler (kilit "alınmış" sayılır) | Bütçe okunamazsa tüm kademelerde LLM'i kapat; LLM uçlarında `failClosed` ya da Postgres yedek sayacı; üretim kilidine `pg_try_advisory_xact_lock` yedeği |
| O5 | Trivia: önbellek ham rota id'siyle çalışıyor; kilit, faz/kapsam sınırı ve global bütçe yok | `src/pages/api/matches/[id]/trivia.ts:31,47,52,75,108-117`; `src/services/sportmonks/fixtureIdRange.ts:19-23` | DOĞRULANDI. Baştaki sıfır varyantını Sportmonks'un kabul etmesi VARSAYIM | Doğrulanmamış hesap saatte 20 farklı fixture id ister (günde 480 LLM çağrısı/hesap, global tavan yok). Trivia'sı olmayan maça N eşzamanlı istek: N LLM çağrısı, N-1'i P2002 ile 500 | Id'yi kanonikleştir; maç başına kilit; PRE ve ±7 gün sınırı; günlük global bütçe (fail-closed); başarısız üretime negatif önbellek; uç POST olsun |
| O6 | Asistan bütçesi tek ve kademesiz; misafir IPv6 anahtarı sıkıştırılmış adreste yanlış ayrıştırılıyor | `src/server/assistant/quota.ts:22-26,65-66` | Ayrıştırma hatası DOĞRULANDI (`2001:db8::1` ve `2001:db8::2` farklı anahtar). Vercel'in IPv6 iletimi VARSAYIM | Birçok /64 ya da ücretsiz /48 tünelle her kimlikten 3 mesaj: birkaç bin mesajla 5 USD dolar ve TSİ gece yarısına kadar premium dahil herkese `BUDGET` döner | Misafir alt bütçesi ve premium payı; IPv6'yı `net.isIP` ile /64'e indir, IPv4-mapped adresi /24'e çevir; misafirin ilk mesajında Turnstile |
| O7 | Sportmonks saatlik havuzu kimliksiz tüketilebilir; önbellek anahtarı çeşitlenebiliyor ve bazı SSR/OG/compare yollarında limit yok | `src/server/sportmonks/proxyAllowlist.ts:82-90,147-159`, `cachedFetch.ts:186-188`, `src/pages/api/matches/[id]/live.ts:26`, `src/pages/api/compare/[slug].ts:26-32`, `src/pages/matches/[slug].tsx:72-90` | DOĞRULANDI. 404 yanıtının havuzdan düşmesi VARSAYIM | Tek IP `/api/matches/<rastgele 8 hane>/live` ile 120/dk çağrı yapar, her biri 2 upstream; havuz ~10 dakikada biter. Saatin geri kalanında site geneli 429 alır, canlı veri bayatlar | IP başına upstream ıska bütçesi; `rate_limit.remaining` düşükken yeni anahtarları reddet; include'u sırala ve tekilleştir; id aralığı sınırla; compare/OG/SSR ıska yoluna IP limiti |
| O8 | Kayıtta `name` sınırsız ve temizlenmiyor (PATCH'teki 80 karakter kuralı kayıtta yok) | `src/lib/accounts.ts:94`; `src/pages/api/auth/register.ts`; `src/pages/api/mobile/auth/register.ts:46-48`; `src/lib/gundem/posts.ts:7,36` | DOĞRULANDI. Vercel 4,5 MB yanıt sınırı VARSAYIM | ~1 MB `name` ile kayıt ol, 5 gönderi at: `GET /api/gundem/posts?scope=all` ilk sayfası >4,5 MB olur ve akış herkese hata verir | Kayıtta ham uzunluk + `sanitizePlainText` + ≤80; mevcut uzun adları kırpan tek seferlik betik; serileştiricide `slice` |
| O9 | Kimlik uçlarında limitler yalnız IP'ye bağlı; hesap ya da e-posta başına global sayaç yok | `src/lib/loginRateLimit.ts:18-24`; `src/pages/api/mobile/auth/login.ts:32`; `src/pages/api/auth/forgot-password.ts:16,30-37` | DOĞRULANDI. Resend günlük kotası VARSAYIM | Proxy havuzuyla tek hesaba IP başına 15 dk'da 20 şifre denemesi (web + mobil). Forgot-password ile kurbana e-posta yağmuru ya da Resend kotasının tüketilmesi; o gün kimseye doğrulama/sıfırlama e-postası gitmez | IP'den bağımsız `login:acct:{id}` sayacı (aşılınca Turnstile); forgot için e-posta başına 3/sa + günlük global tavan |
| O10 | `sharp@0.34.5`: libheif / librsvg / libvips açıkları (GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w, GHSA-f88m-g3jw-g9cj) | `package.json:55`; `src/server/imgLogo.ts:40,52`; `src/server/og/ogAssets.ts:48,75-76`; `src/utils/logoUrl.ts:20` (`.svg`/`.gif` izinli) | Sürüm ve kod yolu DOĞRULANDI. Ulaşılabilirlik VARSAYIM: girdi yalnız `cdn.sportmonks.com`'dan geliyor | Sportmonks CDN kötü amaçlı AVIF/SVG/GIF döndürürse (ele geçirilme ya da açık yönlendirme; `fetch` yönlendirmeyi takip ediyor) `GET /api/img/logo?src=…` fonksiyon içinde çözülür: olası RCE ya da çökme | `npm i sharp@^0.35.5` (semver-major) + testler; upstream fetch'lerde `redirect: 'error'`; `sharp.block` ile SVG/HEIF/TIFF yükleyicilerini kapat; `PATH_RE`'den `svg` çıkar |
| O11 | Sunucu Sentry olaylarında başlıklar yalnız kara listeyle süzülüyor: Referer, `x-vercel-ip-*` konum başlıkları, olası `x-vercel-oidc-token`; `contexts.nextjs.request_path` scrub dışı | `src/lib/sentryScrub.ts:9,52-56` | DOĞRULANDI (statik). Vercel'in eklediği başlıklar VARSAYIM | Her sunucu hata olayı kullanıcının yaklaşık konumunu ve UA'sını Sentry'ye taşır; Referer sayfa sorgusundaki veriyi taşır. Gizlilik metniyle çelişiyor | Başlık izin listesi (`user-agent`, `accept-language`, `content-type`, `host`, `x-vercel-id`); `request_path`'e de `scrubSecretParams` |
| O12 | Kayıt sonrası e-posta URL sorgusuna yazılıyor | `src/pages/auth/signup.tsx:119` → `/auth/verify-email-sent?email=`; `src/pages/_app.tsx:91` (`<Analytics />` `beforeSend`'siz) | DOĞRULANDI. Vercel Analytics/log'un sorguyu saklaması VARSAYIM | E-posta tarayıcı geçmişine, istemci Sentry olaylarına (`request.url`, navigation `to`) ve same-origin Referer'a girer | E-postayı sessionStorage ya da router state ile taşı; scrubber'a `email` ve `q` ekle |
| O13 | Redis hız sınırı anahtarlarında ham IP ve giriş tanımlayıcısı (e-posta/kullanıcı adı) | `src/lib/loginRateLimit.ts:18,22`; ~20 uçta `…:${ip}` | DOĞRULANDI. TTL ≤15 dk | Upstash konsoluna ya da REST belirtecine erişen biri son 15 dakikadaki IP ↔ hesap eşleşmelerini görür | HMAC(`AUTH_SECRET`, ip[+id]) anahtarları kullan (`guestIpKey` örneği gibi) |
| O14 | Gereksiz ya da süresiz kişisel veri: Google `access/refresh/id_token` düz metin DB'de (JWT oturumda gereksiz); kullanılmamış `VerificationToken` satırları temizlenmiyor | `prisma/schema.prisma:333-349`; `@next-auth/prisma-adapter` `linkAccount`; `src/lib/security.ts:117-123,173-175` | DOĞRULANDI | DB sızıntısında ek kimlik verisi ve OAuth belirteçleri; doğrulama satırları (e-posta + özet) birikir | `linkAccount`'ı sarıp belirteçleri `null` yaz, mevcutları NULL'la; cron'da süresi geçmiş doğrulama satırlarını sil |

---

## 4. Düşük bulgular (savunma derinliği)

**Kimlik / oturum / admin**
- **D1. CSRF tek katmanlı:** Koruma yalnız NextAuth varsayılanı SameSite=Lax. `readJsonBody` (`src/lib/gundem/validation.ts:11-23`) `text/plain` gövdeyi `JSON.parse` ediyor. Admin kredi/premium uçları form-urlencoded string kabul ediyor (`src/lib/adminUsers.ts:71-95`, `src/pages/api/admin/grant-credits.ts:19-20`). Gövdesiz `POST /api/matches/<id>/analysis` varsayılan olarak kredi harcıyor (`analysis.ts:206-207`). Origin / Sec-Fetch-Site kontrolü yok. Bugün yalnız ele geçirilmiş bir alt alan adı ya da SameSite desteklemeyen eski bir istemciyle sömürülebilir (VARSAYIM: `*.ofsaytyok.app` altında sahipsiz alt alan adı yok).
  - Düzeltme: `getRequestAuth` içinde çerezli ve GET olmayan isteklerde Origin ya da `Sec-Fetch-Site` kontrolü; çerezli mutasyonda `application/json` zorunlu olsun; kredi harcamada `method` alanı açık olsun.
- **D2.** `/api/ai-stats` oturumlu istekte `getServerSession` çağırıyor; NextAuth yanıta oturum çerezini yeniden yazıyor ve aynı yanıt `Cache-Control: public, s-maxage=300` dönüyor (`src/pages/api/ai-stats.ts:97-99,139-144`).
  - VARSAYIM: Vercel CDN `Set-Cookie` içeren yanıtı önbelleğe almıyor. Bu varsayım yanlışsa oturum çerezi başkasına sunulur ve sorun Kritik olur. Kontrol: oturumlu iki istekte `x-vercel-cache` başlığı.
  - Düzeltme: oturumu yalnız `history=1` iken oku, o yanıtı `private, no-store` dön.
- **D3.** Push belirteci kaydı, başka kullanıcıya ait belirteci istekte bulunan hesaba devrediyor (`src/pages/api/push/register.ts:46-51`). Bildirim gönderimi henüz yok (Faz B); o fazdan önce sahiplik kanıtı ekle.
- **D4.** Kullanıcı adı büyük/küçük harfe duyarlı tekil (`prisma/migrations/00000000000000_init/migration.sql:159`, `src/pages/api/user/me.ts:137-145`). `@OfsaytYokMedia` gibi resmi hesap taklidi mümkün; ayrılmış ad listesi yok; görünen adda bidi ve sıfır genişlikli karakterler temizlenmiyor (`src/lib/security.ts:216-227`). `isOfficialUser` `emailVerified` kontrolü yapmıyor (`src/lib/gundem/official.ts:14-28`).
- **D5. Hesap varlığı sızıyor:**
  - kullanıcı yoksa bcrypt çalışmıyor (`src/lib/auth-options.ts:81`);
  - mobil girişte `OAUTH_ACCOUNT_GOOGLE` kodu dönüyor (`src/pages/api/mobile/auth/login.ts:64-70`);
  - kayıtta 409 mesajları e-posta/kullanıcı adı varlığını gösteriyor (`src/lib/accounts.ts:84-86`);
  - forgot-password'da zamanlama farkı var.
- **D6. CRON_SECRET kapsamı geniş:** `bot-post`, `sentry-test` ve `bot-goal-draft` cron sırrıyla da çağrılabiliyor (`src/lib/gundem/botAuth.ts:11-15`). Sır sızarsa resmi hesaptan gönderi atılabilir. Kredi, kullanıcı ve ödeme uçları cron sırrıyla erişilemiyor (doğrulandı). Düzeltme: bu üç ucu yalnız `requireAdmin`'e bağla; her tüketiciye ayrı sır.
- **D7. Oturum iptali yalnız şifre değişikliğine bağlı:** "Tüm cihazlardan çık" yok, yönetici bir hesabın oturumlarını düşüremiyor, mobil belirteç 30 gün geçerli, web JWT'nin mutlak bir üst ömrü yok.
- **D8.** Kayıtta e-posta biçimi doğrulanmıyor (`src/lib/accounts.ts:46-49`), `reset:kurban@x.com` gibi bir "e-posta" kabul ediliyor. Doğrulama ve sıfırlama belirteçleri yalnız `identifier` önekiyle ayrılıyor (`src/lib/security.ts:138-160,190-205`). Ham belirteç saldırgana ulaşmadığı için pratik sömürü yok. Düzeltme: e-posta regex'i ve belirteç tablosuna tür alanı.
- **D9.** Gmail varyantıyla (`kurban+x@gmail.com`) posta kutusu işgal edilebiliyor. Gerçek sahip Google girişinde `EmailAlreadyRegistered` alıyor; forgot-password tam eşleşme aradığı için onu kurtarmıyor (`src/lib/oauth.ts:114-134`).
- **D10.** Eski `/api/admin/grant-credits` yeni korkulukları atlıyor: tamsayı kontrolü, ±10.000 sınırı, gerekçe ve tekrar anahtarı yok (`src/pages/api/admin/grant-credits.ts:19-42`). Yalnız ADMIN erişebiliyor; ucu kaldır ya da `adminAdjustCredits`'e yönlendir.
- **D11. GitHub Actions sertleştirmesi** (repo public): `permissions:` tanımlı değil, eylemler SHA yerine `@v4` etiketine sabitlenmiş, `npm install` kullanılıyor (`.github/workflows/ci.yml`).
- **D12.** Turnstile yanıtında `hostname` ve `action` doğrulanmıyor; fetch'te zaman aşımı yok (`src/lib/security.ts:11-35`).
- **D13.** `@upstash/ratelimit` kendi zaman aşımında `{success:true, reason:'timeout'}` dönüyor ve `reason` kontrol edilmiyor (`src/lib/rateLimit.ts:61-67,96-101`). Yavaş Redis'te `failClosed` uçları o istek için açık geçebilir.
- **D14.** `getToken()` bozuk bir `Bearer` başlığında middleware'de `URIError` atıyor ve 500 dönüyor (`src/middleware.ts:30,42,60`; GHSA-xmf8-cvqr-rfgj). Yetki atlatma yok. Düzeltme: next-auth@4.24.15 ve try/catch.

**AI / kredi**
- **D15.** Üretim kilidinin bırakılması atomik değil: GET + DEL (`src/lib/analysisGenerationLock.ts:28-34`). Lua ile karşılaştır-ve-sil.
- **D16.** Settle ve `analysisUnlock.create` ayrı ifadeler (`src/pages/api/matches/[id]/analysis.ts:311-333`). DB hatasında tutarsızlık doğabiliyor: kullanıcı ödemiş ama 409 alıyor.
- **D17.** Kullanıcı üretiminde zaman penceresi yok. Haftalar önce üretilen bayat analiz, ön üretimi engelliyor (`analysis.ts:238-243`, `src/server/analysisPregen.ts:118`). Premium/yönetici üretimine günlük tavan yok.
- **D18.** Sahte kredi DB'si (`src/test/fakeCreditDb.testutil.ts`) kirli okuma modelliyor ve bazı yarışları gizliyor. Örnek: davet aylık tavanı (`src/lib/referral.ts:97-106`). Davet ödülü henüz hiçbir yerden çağrılmıyor.

**Ödeme**
- **D19.** Ödeme ile hesap arasındaki tek bağ, alıcının değiştirebildiği `merchantOrderId`. Saldırgan kendi checkout linkini kurbana öder gibi gösterirse kredi saldırgana yazılır (sosyal mühendislik; VARSAYIM: Hikie değeri doğrulamadan taşıyor).
- **D20.** Webhook ödemenin hangi linkten ya da üründen geldiğini (`linkId`, test/canlı) doğrulamıyor (`paymentOrders.ts:300-336`). Bugün fiyatlar farklı olduğu için kazanç yok.
- **D21.** Aynı siparişe gelen ikinci ödeme ve `missing` sonucu sessizce yutuluyor (`paymentOrders.ts:131-142,380`); para alınıp kredi verilmeyen durumlar izsiz kalıyor.
- **D22.** Webhook'ta `merchantOrderId` biçimi doğrulanmıyor ve değer ham olarak loga yazılıyor (log satırı enjeksiyonu; `paymentOrders.ts:310,386-394`). `MERCHANT_ORDER_RE` uygula.
- **D23.** Olay tipi ve teslimat kimliği başlıklarda, imzanın dışında; gövde ayrıştırma gevşek (`[body.data, body.order].find(isObj) ?? body`). Gerçek payload örneğiyle tek biçim kesinleştirilmeli (VARSAYIM).
- **D24.** Checkout hız sınırı Redis kesintisinde açık kalıyor; PENDING siparişlere süre ve temizlik yok (`src/pages/api/payments/checkout.ts:22`).

**Başlıklar / istemci / bağımlılık**
- **D25.** CSP yalnız `frame-ancestors 'none'` içeriyor (`next.config.ts:11-19`). XSS vektörü bulunmadığı için Düşük. Öneri: production'da önce `Report-Only` ile denenen hash tabanlı `script-src` (4 sabit satır içi betik), `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`; ayrıca COOP `same-origin`.
- **D26.** `X-Powered-By: Next.js` kapalı değil; `poweredByHeader: false` ekle.
- **D27.** `next@16.1.6` için 30 advisory var, ama bu yapıda ulaşılamıyor: Pages Router, rewrites/i18n yok, Linux, Vercel görsel servisi. ≥16.3.3'e (npm önerisi 16.4.0) `eslint-config-next` ile birlikte yükselt.
- **D28.** axios@1.16.1, cheerio, twitter-api-v2 ve node-cron runtime bağımlılığı olarak tanımlı ama yalnız yerel araçlarda kullanılıyor; `devDependencies`'e taşı ve `npm audit fix` uygula. Build/dev zincirindeki açıklar (postcss, nanoid, tar, js-yaml…) runtime'da ulaşılamaz. npm'in `--force` ile önerdiği sürüm düşürmeleri **uygulanmamalı**.
- **D29.** İstemci import grafiğinde sunucu modülleri var, ama hiçbir sır değeri sızmıyor:
  - `src/services/sportmonksRuntimeClient.ts:31` → `cachedFetch` ve `redis`;
  - `src/components/Profile/InfoTab.tsx:3` → `@prisma/client` değer importu;
  - `src/pages/credits.tsx:11` → `paymentPackages`.
  ESLint `no-restricted-imports` kuralı öneriliyor.
- **D30.** `NEXT_PUBLIC_SENTRY_DSN` tasarım gereği açık. Sentry'de Allowed Domains ve spike protection açılmalı.

**Kötüye kullanım / log**
- **D31.** `/api/ai-stats/dashboard` limitsiz tam tablo taraması yapıyor; `/api/news` listesinde CDN başlığı, limit ve tek-uçuş yok.
- **D32.** Proxy izin listesi ihlal logu, saldırganın kontrol ettiği imzalar üretiyor; Sentry olay kotası tüketilebilir (`src/server/sportmonks/proxyAllowlist.ts:211-222`).
- **D33.** `imgLogo` ve `ogAssets` fetch'lerinde yönlendirme takibi açık (SSRF savunma derinliği); `redirect: 'error'` kullan.
- **D34.** next/image dönüşüm kotası: 5 haber host'unda `pathname: '/**'` ve 13 genişlik.
- **D35.** DB satır şişirme: checkout PENDING, anket `matchId` doğrulamasız (`poll.ts:62-83`), kullanıcı başına push token sınırı yok.
- **D36.** Console breadcrumb'larında `data.arguments` temizlenmiyor. Bugünkü log satırlarında sır yok.
- **D37.** Tek kullanımlık belirteçler URL sorgusunda (`?token=`, `src/lib/security.ts:125,177`). VARSAYIM: Vercel log/Analytics sorguyu saklıyor. Sıfırlama bağlantısı için `#token=` önerilir.
- **D38.** 500 yanıtlarında ham `error.message` dönüyor (`src/pages/api/sportmonks/[...path].ts:71-73`, `news/index.ts:14`, `news/[id].ts:35`, `matches/[id]/archived-status.ts:40`). Görülen içerik en fazla env adı.

---

## 5. Kontrol edildi, sorun yok (özet)

- **Admin yetkisi:**
  - 16 admin handler'ının hepsi kendi içinde `requireAdmin` (DB rolü) ya da cron/admin kontrolü yapıyor; yalnız middleware'e güvenen yok.
  - Cron Bearer'ı middleware'i geçse bile `requireAdmin` uçlarında 401 alıyor (JWE çözülemiyor).
  - `/admin` sayfaları ADMIN değilse `notFound` dönüyor.
  - Rol atayan uygulama kodu yok.
  - `session.update()` yalnız name, image ve username yazabiliyor; bunlar yetki kararında kullanılmıyor.
- **Mobil belirteç:** JWE (dir + A256GCM), `exp` zorunlu, her istekte sürüm ve rol kontrol ediliyor. **Sır boşken `encode` hata veriyor** (yerelde denendi: `"ikm" must be at least one byte`), yani sahte belirteç üretilemiyor.
- **Şifre sıfırlama ve e-posta doğrulama:**
  - 32 bayt rastgele belirteç, SHA-256 ile saklanıyor, süreli ve tek kullanımlık.
  - Sıfırlama `tokenVersion++` yapıyor.
  - Bağlantı `AUTH_URL`'den üretiliyor (Host başlığı enjeksiyonu yok); bağlantılar loglanmıyor.
  - Kayıt bonusu eşzamanlı doğrulamada bile bir kez veriliyor (`@@unique([userId, idempotencyKey])`).
- **Kredi bütünlüğü:**
  - 1 kredilik açma tek interaktif transaction'da yapılıyor (`src/lib/analysisUnlock.ts:105-148`): koşullu düşüm, tekil defter satırı, tekil açma kaydı.
  - Aynı maça 10 eşzamanlı istek → 1 kredi, 1 açma, 500 yok.
  - Tüm düşüm yolları koşullu, bakiye eksiye inmiyor. `CHECK (credits >= 0)` migration'da var; prod'da uygulanmış olması VARSAYIM, `pg_constraint` ile kontrol edilmeli.
- **Kilitli içerik:** Tam analiz yalnız açma kaydı varsa ya da maç bitmişse dönüyor (sunucu tarafı faz).
  - SSR, asistan aracı, `analysis-card`, OG, ai-stats, sitemap: yalnız önizleme ya da bitmiş maç.
  - Kullanıcıya özel API yanıtları `private, no-store`.
  - Anonim akış önbelleği oturumdan bağımsız.
- **IDOR:**
  - Kredi, sipariş, bildirim, favori, gönderi/yorum silme, beğeni ve takip sorgularının hepsi oturum kullanıcısına bağlı.
  - Yorum silme `id + postId` birlikte arıyor.
  - Kamuya açık Gündem yanıtları e-posta, rol, kredi ya da şifre alanı döndürmüyor.
- **Ödeme:**
  - HMAC-SHA256 ham gövde üzerinden, bodyParser kapalı, sabit zamanlı karşılaştırma, zaman damgası ±5 dk.
  - Sır yoksa 503.
  - Olay kimliği tekrar kaydı tutuluyor; PENDING → PAID koşullu; `hikieOrderId` ve `(userId, hikie:{id})` tekil, yani çift kredi yok.
  - Tutar katalogdan ve kuruş olarak birebir karşılaştırılıyor; ayrıştırma yalnız `^\d{1,9}(\.\d{1,2})?$` kabul ediyor. Para birimi TRY.
  - Callback kredi vermiyor; yönlendirme sabit (open redirect yok).
  - Sipariş ucu IDOR'suz.
  - `PaymentOrder` ve `PaymentWebhookEvent` tablolarında RLS açık. Ödeme testleri 56/56 geçti.
- **XSS:**
  - Beş `dangerouslySetInnerHTML` noktasının hepsi sabit kod ya da kaçışlı JSON-LD.
  - Kullanıcı, LLM, RSS ve Sportmonks içeriği metin düğümü olarak çiziliyor; linkify ya da markdown yok.
  - Asistan linkleri hem sunucuda hem istemcide izin listesinden geçiyor.
  - React 19.2.3 `javascript:` URL'lerini engelliyor.
  - CORS başlığı yok; NextAuth çerezleri HttpOnly, Lax, Secure.
- **Sırlar:**
  - Repo PUBLIC (doğrulandı). `.env*` hiçbir ref'te commit edilmemiş.
  - Takip edilen dosyalarda ve tüm git geçmişinde gerçek sır kalıbı yok.
  - `__NEXT_DATA__`'da gizli veri yok; NEXT_PUBLIC_ değişkenlerinin hepsi tasarım gereği açık.
  - Sentry kaynak haritaları yüklemeden sonra siliniyor.
- **Log:**
  - Session Replay yok, tracing yok, `setUser` yok, `sendDefaultPii:false`.
  - Çerez ve Authorization scrub'da siliniyor.
  - Asistan logu anonim; sohbet DB'de saklanmıyor.
  - Hikie webhook gövdesi Sentry'ye gitmiyor (bodyParser kapalı).

---

## 6. Doğrulanamayanlar — panelden ya da canlıda bakılacaklar

| Konu | İlgili bulgu | Nasıl doğrulanır |
|---|---|---|
| Sentry sunucu olaylarında `http.query` breadcrumb'ı ve "Request › Body" | Y1, Y2 | Sentry'de bir sunucu olayı aç; Data Scrubber / Default Scrubbers ayarına bak |
| Asistan koşularının 25 sn'yi aşması | Y4 | Vercel Logs: `event:"assistant-chat"`, `outcome:"error"`, `ms≥25000` |
| Vercel CDN anahtarı tüm sorguyu içeriyor mu; `Set-Cookie` olan yanıt önbelleğe alınıyor mu | Y6, D2 | Prod dışı ortamda `x-vercel-cache` başlığı |
| Google girişinin prod'da açık olması | Y3 | Vercel env adları (`GOOGLE_CLIENT_ID`) |
| `CHECK (credits >= 0)` ve tekil indeksler prod DB'de var mı | Kredi | `pg_constraint`, `pg_indexes` (migration geçmişi kayık; `CreditTransaction` `db push` ile oluşmuş) |
| `User`, `CreditTransaction`, `AnalysisUnlock`, `PremiumGrant` tablolarında Supabase RLS/REVOKE | Alan dışı | Supabase panelinde Data API açık mı ve bu tablolarda RLS var mı (migration'larda yalnız ödeme tablolarına uygulanmış) |
| Vercel'in `x-forwarded-for` başlığını ezmesi ve IPv6 iletimi | O6, O9, rate limit | Vercel belgeleri ve prod log örneği |
| Hikie: `merchantOrderId`'nin linkte değiştirilebilirliği, dispute olayı, test/canlı ayrımı | O1, D19–D23 | Hikie belgeleri ya da gerçek bir webhook örneği |
| Sportmonks token'ı başlıkla kabul ediyor mu | Y1 düzeltmesi | Sportmonks v3 belgeleri |
| Preview dağıtımları prod DB/Redis'e bağlı mı, Deployment Protection açık mı | Genel | Vercel proje ayarları |

## 7. Alan dışı ek notlar

- `.gitignore` `.next-anim/` (~450 MB, şu an untracked), `.next-night/` ve `.next-ref2/` klasörlerini kapsamıyor. Repo public olduğu için yanlışlıkla commit riski var; `/.next*/` kalıbı öneriliyor.
- Gizlilik metni (`public/locales/{tr,en}/legal.json`) üç noktada kodla çelişiyor:
  - Sentry'ye giden veri (Y2, O11);
  - OpenAI ve Cloudflare alıcı olarak sayılmıyor (yurt dışı aktarım);
  - metin "hesap silme"den söz ediyor, ama böyle bir özellik yok.
  KVKK aydınlatma metni güncellenmeli.
- `docs/KULLANICI_TAKIBI.md` `Sentry.setUser({ id, email })`'i öneriyor. Uygulanacaksa yalnız `id` kullanılmalı.
- Resmi/bot hesabın e-posta adresi public repoda sabit (`src/lib/gundem/official.ts:3,10`); mevcut `OFFICIAL_ACCOUNT_EMAILS` env'ine taşınmalı.
- Avatar alanı herhangi bir http(s) URL'yi kabul ediyor. Görüntüleyenlerin IP ve UA bilgisi üçüncü taraf sunucuya gidiyor (izleme pikseli).
- NextAuth `authorize` istisnasının mesajı `?error=` ile URL'ye konuyor ve `authorize`'da try/catch yok. DB kesintisinde Prisma mesajı (DB host'u) URL'ye düşebilir.
- `src/services/sportmonks/httpClient.ts:132-158` `sportmonksRequestByUrl` kullanılmıyor ve yorumu yanıltıcı; silinmeli.

# Scor3 — UI · Performans · SEO/GEO denetimi (2026-11-20)

Kapsam: kod tabanı (main `6a0877a`), yerel üretim derlemesi (Turbopack, `.next-audit`), canlı site
(www.getscor3.com) HTML'i ve canlıda mobil Lighthouse 13.6 (simülasyon, sayfa başı 3 koşu, medyan).

## 1. Özet

| Sayfa | Perf | A11y | En iyi uyg. | SEO | LCP | TBT | CLS | İlk yük JS (gz) |
|---|---|---|---|---|---|---|---|---|
| Ana sayfa `/` | 100 | 100 | 100 | 100 | 0,95 sn | 48 ms | 0 | 286 KB |
| Maç `/matches/…galatasaray-samsunspor` | 99 | 96 | 100 | 100 | 0,87 sn | 121 ms | 0 | 312 KB |
| Takım `/teams/34-galatasaray` | 96 | 96 | 100 | 100 | 2,77 sn | 47 ms | 0 | 279 KB |
| Lig `/lig/super-lig` | 100 | 100 | 100 | 100 | 0,81 sn | 10 ms | 0 | 218 KB |

Not: Önceki ölçümler (ana 93, maç 91) daha eski Lighthouse sürümüyle alınmıştı; sürüm farkı yüzünden doğrudan
karşılaştırılamaz. Gerçek kullanıcı verisi (CrUX/RUM) yok — trafik düşük ve sitede web-vitals toplanmıyor.

**Genel değerlendirme:** Teknik temel güçlü (ISR + CDN, CLS 0, canonical/sitemap/yapılandırılmış veri, 542 test
dosyası, tsc temiz). Asıl açıklar: (1) robots.txt'nin paylaşım görsellerini ve logoları engellemesi, (2) maç
yapılandırılmış verisinde saat eksikliği ve İngilizce lig/ülke adları, (3) tasarım sisteminin kodda
uygulanmaması (22 farklı yazı boyutu, 900+ ham renk), (4) mobil ilk ekranda ürünün kendisinin (maç listesi) geriye
itilmesi.

## 2. İyi olanlar (korunmalı)

- **Önbellek mimarisi:** ana sayfa/lig/takım ISR, deterministik props, maç sayfası CDN önbelleği, bot UA'larına hafif
  sayfa + Sportmonks kota koruması. Tüm ölçülen sayfalarda CLS = 0.
- **Font:** Inter iki alt kümeye bölünmüş, yalnız Latin parçası preload; fallback metrikleri ayarlı.
- **JS disiplini:** Sentry istemcide tembel, İngilizce sözlük tembel (`import('./i18nEnglish')`), RewardNudge /
  Kural Köşesi dinamik.
- **SEO tabanı:** her indekslenen sayfada canonical, 4 parçalı sitemap dizini (~1.870 URL), IndexNow cron'u,
  BreadcrumbList, kural sayfalarında Article + FAQPage, hakemlerde Dataset, lig sayfasında SportsOrganization +
  SportsTeam, `/standings` noindex (lig sayfalarıyla çakışmasın diye).
- **GEO tabanı:** `/llms.txt` derli toplu; AI arama ve eğitim botları sayfalara erişebiliyor (API'ye değil);
  Hakkımızda / Yöntem / AI isabet sayfaları "kaynak gösterilebilir" içerik sağlıyor; lig açıklamalarında sayısal
  özet cümlesi var ("11 maç sonunda lider Galatasaray (28 puan)").
- **Kod sağlığı:** tsc temiz, yalnız 3 `any`, 542 test dosyası, kontrast testi (`a11yContrast.test.ts`), 37 ayrı
  `prefers-reduced-motion` kuralı, güvenlik başlıkları.

## 3. Bulgular

Önem: **Y** yüksek · **O** orta · **D** düşük.

### 3.1 SEO / GEO

| # | Önem | Bulgu | Kanıt |
|---|---|---|---|
| S1 | **Y** | `robots.txt` `Disallow: /api/` → paylaşım görselleri (`/api/og/match/*`, `/api/og/team/*`, `/api/og/frikik`) ve tüm takım/lig logoları (`/api/img/logo`) tarayıcılara kapalı. Twitterbot robots.txt'ye uyar → X'te paylaşılan maç/takım linklerinde kart görseli gelmeyebilir. Google da SportsEvent `image` alanını ve logoları çekemez (görsel arama, zengin sonuç). | `src/pages/robots.txt.tsx`; canlı maç sayfası `og:image = /api/og/match/19746549?v=S` |
| S2 | **Y** | Maç `SportsEvent.startDate` yalnız tarih (`"2026-11-21"`), saat ve saat dilimi yok. Google etkinlik sonuçları tam ISO tarih-saat ister. Takımlarda `url` (takım sayfası) yok, `location.address` düz metin. | `src/pages/matches/[slug].tsx:408` |
| S3 | **O** | Lig adı ham Sportmonks adıyla basılıyor: başlıkta, H1'de, açıklamada, og:image:alt'ta ve `organizer` alanında "Super Lig"; aynı sayfanın breadcrumb'ı "Süper Lig". `leagueNameById` var ama SEO tarafında kullanılmıyor. | `src/pages/matches/[slug].tsx:307`, `utils/matchSeo.ts` |
| S4 | **O** | `/news/[id]` istemci tarafında çiziliyor: her id için 200 dönüyor, başlık yalnız "Scor3", canonical/H1 yok → soft 404. Hiçbir sayfa bu URL'lere link vermiyor (yetim). | canlı `/news/1`; `src/pages/news/[id].tsx` |
| S5 | **O** | Meta açıklamalar uzun, Google ~155 karakterde kesiyor: `/hakemler` 364, maç 213, lig 187, tahmin 174 karakter. | canlı HTML |
| S6 | **O** | İnce içerik: oyuncu sayfası ~750, takım sayfası ~1.270 karakter metin. Takım logosu SSR HTML'inde yok. Emekli oyuncuda "orta saha oyuncusu olarak oynuyor (47 yaşında)" gibi hatalı cümle. | `/players/1`, `/teams/34-galatasaray` |
| S7 | **D** | Yapılandırılmış veri olmayan sayfalar: `/ai-istatistikleri` (Dataset uygun), `/lig` (ItemList), `/bugun` (SportsEvent listesi), `/frikik`, `/gundem`. Organization açıklamasında "spor haberleri" geçiyor ama haber bölümü yok. | canlı HTML |
| S8 | **D** | GEO tazelik sinyali: lig / hakem / AI isabet sayfalarında görünür "son güncelleme" ve JSON-LD `dateModified` yok. AI motorları güncel veri sorularında tarihli kaynağı tercih ediyor. | — |

### 3.2 Yazılım performansı

| # | Önem | Bulgu | Kanıt |
|---|---|---|---|
| P1 | **O** | Gerçek kullanıcı ölçümü yok. Lab skorları yüksek ama mobil gerçek LCP/INP bilinmiyor (CrUX için trafik az). | `_app.tsx`'te yalnız Vercel Analytics |
| P2 | **O** | `_app` tabanı 186 KB gz — yasal metin sayfası bile 213 KB JS indiriyor. Header; HeaderSearch, AiMenu, AccountMenu, MyAnalysesDropdown, NotificationBell ve 3 prefetch kancasını statik içe aktarıyor. Maç sayfasında Lighthouse "kullanılmayan JS" 137 KiB. | `src/components/Header/index.tsx:6-21`; build-manifest |
| P3 | **O** | Lighthouse "eski JavaScript" tahmini 72–102 KiB: `Array.prototype.at/flat/flatMap`, `Object.fromEntries`, `Object.hasOwn` için polyfill gönderiliyor. `browserslist` tanımı yok. | LH `legacy-javascript-insight` |
| P4 | **O** | Global CSS parçası 118 KB (ham) her sayfada render'ı engelliyor; içinde Gündem gönderi formu, postCard, compareTeamPicker, matchChatPanel gibi yalnız birkaç sayfada gereken stiller var. Maç sayfası 7 ayrı CSS dosyası (~360 KB ham / ~54 KB gz) bekliyor; LH render engelleme tahmini 280 ms (maç, takım). | `.next-audit/static/chunks/f8353bbd….css` |
| P5 | **O** | İlk ekrandaki logolar tembel: maç sayfası başlığındaki iki takım logosu `loading="lazy"` (geç beliriyor). Takım sayfasında logo SSR'da yok → tek LCP'si yüksek sayfa (2,77 sn). | canlı maç HTML'i, `TeamLogo` `priority` verilmiyor |
| P6 | **D** | Maç sayfasında form/H2H istemcide yükleniyor; mobil denemede 3 sn sonra hâlâ iskelet görünüyordu. Hidrasyondan sonra tarih etiketi "21 Kasım Cumartesi" → "Yarın" diye değişiyor (metin sıçraması). | tarayıcı gözlemi |
| P7 | **D** | Ana sayfa gün şeridi 61 günü DOM'a basıyor; mobilde gizli masaüstü puan tablosu da DOM'da. Ekran okuyucu 61 gün düğmesini okuyor. | canlı sayfa metni |
| P8 | **D** | Turbopack üretimde uzun CSS modül sınıf adları üretiyor (`matchList-module-scss-module__6w5stq__virtualMatchRow`); ana sayfa HTML'i 154 KB (gzip'le 15,7 KB — etkisi küçük). | canlı HTML |
| P9 | **D** | Derleme uyarıları: Sentry `disableLogger` / `automaticVercelMonitors` kullanımdan kalkıyor; `Lineup/lineup.module.scss:368,374` Sass deprecation. | build log |

### 3.3 UI / erişilebilirlik

| # | Önem | Bulgu | Kanıt |
|---|---|---|---|
| U1 | **Y** | Mobil ilk ziyarette ilk ekran: header + gün şeridi + filtreler + hoş geldin kartı + **tek maç satırı** + Frikik tanıtımı + çerez bandı. Canlı skor sitesinin asıl ürünü (maç listesi) ilk ekranda neredeyse görünmüyor. | 375 px ekran görüntüsü |
| U2 | **O** | Dil karışıklığı: maç listesi başlıkları İngilizce ülke adı ("Spain - La Liga", "Germany - Bundesliga", "Saudi Arabia - Suudi Pro Ligi", "Brazil - Brezilya Serie A" — ülke iki kez). Maç sayfasında "Türkiye - Süper Lig" doğru — eşleme yalnız bazı liglerde var. | canlı ana sayfa |
| U3 | **O** | Tasarım sistemi kodda uygulanmıyor: belge 5 yazı seviyesi tanımlıyor, SCSS'te **22 farklı px font-size** var (12 px ×317, 13 px ×298, 11 px ×140, 10 px ×59, 8–9 px ×12, 10.5/12.5 px…), tipografi token'ı hiç kullanılmıyor. Token dışında **475 hex + 452 rgba** sabit renk (açık temada tutarsızlık riski). z-index 1'den 1100'e rastgele; kırılımlar token (`$bp-sm`) ile ham 479/480/720/767 px karışık. | `src/**/*.scss` sayımı, `docs/DESIGN_SYSTEM.md §2` |
| U4 | **O** | Lighthouse a11y hataları: erişilebilir ad görünen metni içermiyor (takvim düğmesi, kadro oyuncu linkleri, "10 maç daha göster", sıradaki maç linki, harita linki); başlık sırası atlıyor (takım `h3.cardTitle`, maç anketi `h4`); dokunma hedefi küçük (teknik direktör linki 45×15 px); takım başlık rozeti kontrastı 3,1:1. | LH maç/takım raporu |
| U5 | **D** | 375 px'te H2H tablosunun son sütunu kesiliyor ("Deplasma…"), kaydırma ipucu yok. | ekran görüntüsü |
| U6 | **D** | İkon dili karışık: kartlarda emoji (👋 ⚽ 🏆) ile SVG ikonlar yan yana (11-17 taramasındaki "kart başlığı tutarsızlığı" maddesiyle aynı aile). | ana sayfa |
| U7 | **D** | ESLint 12 hata (hepsi `react/no-unescaped-entities`, ör. `yontem.tsx`) — CI'da lint kapısı yok gibi. | `npx eslint src` |

## 4. Düzeltme planı

Her faz ayrı dal/commit; CLAUDE.md'ye göre her commit'te ilgili testler + tsc, push öncesi temiz worktree'de tam
set; Lighthouse yalnız sayfa yüküne dokunan adımlarda (yerelde 3 koşu medyan, deploy sonrası canlıda mobil 3 koşu).

### Faz 1 — Hızlı kazanımlar (≈1 gün, risk düşük)

| Adım | İş | Doğrulama |
|---|---|---|
| 1.1 (S1) | robots.txt'ye `Allow: /api/og/` ve `Allow: /api/img/` (Google en uzun eşleşme kuralı; `/api/` geri kalanı kapalı kalır). Firewall'daki AI bot kuralı `/api/` için zaten 403 — dokunulmaz. | `buildRobotsTxt` testi; canlıda X paylaşım önizlemesi, Search Console URL denetimi |
| 1.2 (S2) | `startDate`'i TSİ ofsetli ISO tarih-saat yap (`2026-11-21T16:00:00+03:00`); takımlara `url`; `location.address` → PostalAddress. | birim test + Google Rich Results Test |
| 1.3 (S3, U2) | Maç SEO'sunda (başlık/H1/açıklama/alt/organizer) `leagueNameById` kullan; maç listesi grup başlığında ülke adını Türkçeleştir ve "Brazil - Brezilya Serie A" gibi tekrarı kaldır. | `matchSeo` testleri, ekran görüntüsü |
| 1.4 (S4) | `/news/[id]`: özellik kullanılmıyorsa rotayı kaldır (404) — kullanılacaksa `noindex`. **Karar sizde.** | canlıda `/news/1` → 404 veya noindex |
| 1.5 (S5) | Açıklama üreticilerinde 155 karakter sınırı, önemli bilgi başta. | birim test |
| 1.6 (U4) | a11y: `aria-label`'lara görünen metni dahil et, başlık seviyelerini düzelt, teknik direktör linkine 24 px dokunma alanı, rozet kontrastı ≥ 4,5:1. | LH a11y 100 (maç, takım) |
| 1.7 (P5) | Maç başlığı logolarına `priority`; takım sayfası logosunu ISR kabuğunda SSR et. | yerel LH 3 koşu (takım LCP) |
| 1.8 (U7, P9) | 12 lint hatası, Sentry kullanımdan kalkan seçenekler, Sass uyarısı. | `npx eslint src` temiz |

### Faz 2 — Ölçüm (≈yarım gün)

- 2.1 (P1) Gerçek kullanıcı Web Vitals: Vercel Speed Insights (Hobby kotasına bakılarak) **veya** `web-vitals` →
  GA4 (yalnız çerez onayı varsa). Hedef: mobil p75 LCP < 2,5 sn, INP < 200 ms.
- 2.2 Search Console: Faz 1 sonrası "Etkinlik" zengin sonuç raporu, soft 404 ve kapsam raporlarını izle.

### Faz 3 — JS/CSS diyeti (≈2 gün, her adım önce/sonra ölçümlü)

- 3.1 (P2) Header'daki menüleri (AiMenu, AccountMenu, MyAnalysesDropdown, NotificationBell, HeaderSearch) etkileşimde
  yüklenen `next/dynamic` parçalarına böl; prefetch kancalarını hover/idle anına taşı. Hedef: `_app` tabanı −25 KB gz.
- 3.2 (P4) postComposer / postCard / compareTeamPicker / matchChatPanel stillerinin neden global parçaya girdiğini
  bul (hangi `_app`/Layout yolu çekiyor) ve o içe aktarmayı sayfa düzeyine indir. Hedef: global CSS 118 → < 60 KB.
- 3.3 (P3) Polyfill kaynağını bul (bağımlılık mı, Next hedefi mi); `browserslist` ile modern hedef dene.
  Hedef: LH "eski JS" < 20 KiB.
- 3.4 (P7) Gün şeridini ±7 güne indir, kenara gelince genişlet; mobilde gizli yan paneli DOM'a basma.

### Faz 4 — UI tutarlılığı (≈3–4 gün, görsel değişiklik → ekran görüntüsü)

- 4.1 (U1) Mobil ilk ekran sırası: maç listesi önce; hoş geldin kartı tek satıra küçülsün veya ilk maç grubundan sonra
  gelsin; Frikik/Tahmin tanıtımları ilk 5–8 maçtan sonra. Çerez bandı mobilde daha alçak. **Tasarım kararı sizde** —
  2–3 seçenek ekran görüntüsüyle sunulur.
- 4.2 (U3) `_tokens.scss`'e tipografi merdiveni (`$text-micro 11`, `$text-meta 13`, `$text-body 14`,
  `$text-title 16`, `$text-score`) + z-index ölçeği; modül modül geçiş. Yeni ham `font-size: Npx`, token dışı hex ve
  ham kırılımı yakalayan bir test (mevcut `a11yContrast.test.ts` tarzında) eklenir.
- 4.3 (U5) Dar ekranda H2H tablosu: sabit ilk sütun + kaydırma gölgesi (hakem tablolarındaki desen).
- 4.4 (U6) Kart başlıklarında emoji yerine mevcut SVG ikon seti.
- 4.5 (P6) Maç sayfasında tarih etiketini sunucu ile istemcide aynı üret (TSİ sabit) — "Yarın" sıçraması bitsin.

### Faz 5 — İçerik ve GEO derinliği (≈2 gün)

- 5.1 (S6) Takım ve oyuncu sayfasına veriyle üretilen 2–3 cümlelik özet (ek Sportmonks isteği olmadan, mevcut
  kabuk verisinden); emekli/kulüpsüz oyuncu için doğru fiil. Hakem sayfalarındaki "en çok/en az" yasağı korunur.
- 5.2 (S7) JSON-LD: `/ai-istatistikleri` Dataset, `/lig` ItemList, `/bugun` SportsEvent listesi, `/frikik`
  VideoGame; Organization açıklamasından "haberler" çıkar.
- 5.3 (S8) Lig / hakem / AI isabet sayfalarına görünür "Son güncelleme" + `dateModified`; `llms.txt`'ye hakem ve
  kural sayfaları bölümü.

### Sıra ve öncelik

Faz 1 → Faz 2 (ölçüm açık olsun ki Faz 3–4'ün etkisi gerçek kullanıcıda görülsün) → Faz 3 → Faz 4 → Faz 5.
Faz 4.1 ve 1.4 sizin kararınızı bekliyor; diğerleri doğrudan uygulanabilir.

## 5. Yöntem notları

- Canlı ölçüm: `npx lighthouse@13.6.0`, mobil simülasyon (412 px, 4× CPU, 1,6 Mbps), 3 koşu medyan; ham JSON'lar
  oturum karalama klasöründe.
- JS boyutları: yerel `next build` (Turbopack) build-manifest'inden `_app` + sayfa parçalarının gzip toplamı.
- Ekran gözlemleri 375 px uygulama içi tarayıcıda, çerezsiz ilk ziyaret.
- Ölçülmeyen: masaüstü Lighthouse, açık tema görsel taraması, gerçek cihaz, INP (etkileşim gerektirir).

## 6. Uygulama durumu (2026-11-20, yerel commit'ler — push yok)

| Madde | Durum | Commit / not |
|---|---|---|
| S1 robots `/api/og/`, `/api/img/` | ✅ | 6657b55 — çizim/veri okuma ogGuard bütçesiyle sınırlı (bütçe aşılırsa varsayılan görsel) |
| S2 SportsEvent tam saat, takım url, PostalAddress | ✅ | 6657b55 — `startDate: 2026-11-21T16:00:00+03:00` yerelde doğrulandı |
| S3 + U2 Türkçe lig / ülke adları | ✅ | 6657b55 — maç başlık/H1/açıklama "Süper Lig"; liste "İspanya - La Liga", "Brezilya Serie A" (ülke tekrarı yok) |
| S4 `/news/[id]` | ⏸ | Kullanıcı kararı: haber bölümü genişletilecek, en sona bırakıldı |
| S5 açıklama ≤ 160 | ✅ | 6657b55 — 11 sayfa `clampDescription`; tahmin metni kısaltıldı |
| S6 oyuncu özeti | ✅ | 6130818 — kulüpsüzde "oynuyor" yok; uyruk (Nijerya) ve lig (Süper Lig) Türkçe |
| S7 JSON-LD eksikleri | ✅ | a296235 — /lig ItemList, /bugun SportsEvent listesi, AI isabet Dataset (dateModified), Frikik VideoGame. Organization açıklamasındaki "haberler" haber bölümüyle birlikte ele alınacak |
| S8 görünür "son güncelleme" | ◻ | Yalnız AI isabet Dataset'inde (veriden). Lig/hakem sayfalarında ISR props'u deterministik tutacak veri kaynaklı bir tarih gerekiyor — ayrı iş |
| P1 gerçek kullanıcı ölçümü | ✅ | 5824b50 — Web Vitals → GA4 (onaylı ziyaretçi). GA4'te `metric_rating` olay boyutu tanımlanmalı (kullanıcıda) |
| P2 Header menüleri tembel | ✗ | Ölçüldü: Header + alt menüler ~32 KB ham (~8 KB gz) — kazanç küçük, yapılmadı |
| P3 eski JS polyfill | ✗ | Kaynak Next.js'in yerleşik polyfill modülü (`trimStart`, `Object.hasOwn`, `URL.canParse`…), uygulamadan kapatılamıyor |
| P4 global CSS 118 KB | ✗ | `_app` içe aktarma grafiğinde bu modüller yok (dinamik dahil) → Turbopack'in paylaşılan CSS birleştirmesi; önceki denemeler (dynamic, cssChunking) etkisizdi |
| P5 ilk ekran logoları | ✅ | 7cbae42 + 4d6737a — maç başlığı ve takım kartı logosu eager. Takım preload'u kaldırıldı: takım sayfasında LCP öğesi marka logosu, preload etkisizdi |
| P6 tarih "Yarın" sıçraması | ✗ | Bilinçli: ISR/CDN HTML'i gün sınırını geçebilir, göreli tarih yalnız istemcide doğru |
| P7 61 günlük şerit | ✗ | Kullanıcı deneyimi değişikliği (geçmiş günlere kaydırma) — ayrı karar |
| P9 derleme uyarıları | ✅ | 7cbae42 — Sentry eski seçenekler, Sass `if()` |
| U1 mobil ilk ekran | ✅ | Kullanıcı B'yi seçti: < 640 px hoş geldin kartı tek satır (maddeler ekran okuyucuya açık), Frikik / Tahmin / kombine slotu ana sayfada en az 6 maçtan sonraki grup sonunda (`slotMinMatches`); masaüstü karşılama kartı aynı |
| U3 tasarım token'ları | ◐ | 44ff6ee — `--fs-caption/label/title` + cırcır testi (ham değer artamaz, ölçek dışı boyut eklenemez). Toplu geçiş açık dallar birleşince |
| U4 a11y | ✅ | 7cbae42 + 4d6737a (anket h2) — başlık sırası, rozet kontrastı 6,1:1, dokunma alanı 25 px. `label-content-name-mismatch` (Lighthouse'ta ağırlığı 0) bilinçli olarak bırakıldı: etiketler kartın tamamını özetliyor |
| U5 H2H dar ekran | ✅ | 9f3b7bd — 375 px'te kaydırmasız |
| U7 lint | ◐ | Kaçış hataları düzeldi; kalan 8 React Compiler kuralı (`setState` effect içinde vb.) davranış değişikliği riski yüzünden ayrı iş |

### Yerel ölçüm (üretim derlemesi, mobil Lighthouse 13.6, 3 koşu medyan)

| Sayfa | Perf | A11y | SEO | LCP | TBT | CLS |
|---|---|---|---|---|---|---|
| Ana sayfa | 100 | 100 | 100 | 0,87 sn | 13 ms | 0 |
| Maç | 100 | 100 | 100 | 0,61 sn | 36 ms | 0 |
| Takım | 91 | 100 | 100 | 3,54 sn | 18 ms | 0 |

Takım sayfası için temel commit (6a0877a) aynı koşulda 3,47 sn / 91 — fark gürültü düzeyinde; yerel takım LCP'si ortam
kaynaklı (canlıda 2,77 sn). Asıl ölçüm deploy sonrası canlıda mobil 3 koşu.

### Push öncesi not

`origin/main` yerelden 2 commit önde (744772b, 5a0be26 — hakem sayfaları, başka oturum). `git merge-tree` çakışma
göstermedi (ortak dosya yalnız `hakemler/[[...params]].tsx`); push'tan önce rebase + temiz worktree'de tam test.

## 7. Canlı ölçüm (deploy 78e23ae sonrası, mobil Lighthouse 13.6, 3 koşu medyan)

| Sayfa | Perf | A11y | En iyi uyg. | SEO | LCP | TBT | CLS | Önce (denetim) |
|---|---|---|---|---|---|---|---|---|
| Ana sayfa | 95 | 100 | 100 | 100 | 2,90 sn | 38 ms | 0 | 100 / 0,95 sn |
| Maç | 100 | 100 | 100 | 100 | 0,84 sn | 77 ms | 0 | 99 / 0,87 sn, a11y 96 |
| Takım | 96 | 100 | 100 | 100 | 2,75 sn | 20 ms | 0 | 96 / 2,77 sn, a11y 96 |

Ana sayfa notu: B düzeninde Frikik kartı ilk ekrandan çıktı; LCP öğesi artık header'daki marka logosu `<img>`'si (önce
Frikik kartı metniydi, LCP = FCP). Gözlenen LCP ~0,4–0,7 sn; Lantern simülasyonu görsel LCP'yi önceden inen tüm
kaynaklarla hesapladığından 2,9 sn görünüyor (takım sayfasında da aynı öğe, aynı etki). Çözüm adayı: marka logosunu
satır içi SVG yapmak (≈2 KB gz; satır içi SVG LCP adayı değil, ek istek ve preload da kalkar) — ayrı adım, onay bekliyor.

## 8. Deploy sonrası düzeltmeler (yerel, push bekliyor)

- **347a185 — LCP:** header logosu satır içi SVG (`BrandLogo inline`, yol verisi `brandMark.ts`, kaynak SVG eşleşme
  testi). Takım sayfasında LCP takım adına geçince veri bekleyen H1 ortaya çıktı → başlık kartı ad + logoyu ISR
  kabuğundan SSR'da çiziyor (`identityReady`). Yerel mobil LH, canlıdaki 78e23ae ile aynı koşulda: ana sayfa 86 → 90
  (LCP 4,18 → 2,93 sn; koşuların bir kısmı 0,92 sn / 100 — FCP öncesi görünür maç logolarının zamanlamasına bağlı iki
  mod), takım 90 → 100 (LCP 3,62 → 0,60 sn), maç 100.
- **e56f577 — mobil menü:** sayfa kaydırılmışken menü açılınca header kayboluyordu. Neden: scroll kilidi `html` ve
  `body`'yi birlikte `overflow:hidden` yapınca body ayrı kaydırma kutusu oluyor, sticky header body'ye yapışıyordu.
  Kilit artık yalnız `html`'de.

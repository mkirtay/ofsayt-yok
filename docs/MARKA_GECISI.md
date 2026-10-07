# Marka geçişi — envanter ve geçiş günü kontrol listesi

Durum: 2026-10-07. Ad ve alan adı henüz değişmedi (aday ad: Sonskor). Bu belge eski markanın (Ofsayt Yok / ofsaytyok.app)
repodaki ve repo dışındaki tüm izlerini üç sınıfta toplar, geçiş gününün adımlarını sıralar.

## Nasıl çalışıyor

| Parça | Ne yapar |
| --- | --- |
| `src/config/brand.ts` | Tek kaynak: `name`, `shortName`, `compactName`, `siteUrl` (`NEXT_PUBLIC_SITE_URL`, yoksa varsayılan canlı alan adı), `domain`, `contactEmail`, `social`, `tagline`, `description`. |
| `src/lib/siteUrl.ts` → `siteBaseUrl()` | Canonical / og:url / og:image / JSON-LD / sitemap / robots kökü. Sıra: `NEXT_PUBLIC_SITE_URL` → `AUTH_URL` → `NEXTAUTH_URL` → `BRAND.siteUrl`. |
| `src/lib/i18n.tsx` → `t()` | Çevirilerde `{{brand}}`, `{{siteDomain}}`, `{{contactEmail}}` her zaman dolar. JSON'u doğrudan okuyan sayfalar `withBrandText()` kullanır. |
| `src/config/legacyBrand.guard.test.ts` | Eski markanın her yazımını (`/ofsayt[\s_.-]?yok/i`) yasaklar; geçebilen yerler açık izin listesinde, sınıf + nedenle. Kullanılmayan izin girdisi de testi kırar. |
| `src/config/brand.test.ts` | Yardımcılar + `contactEmail` yer tutucu alan adında olamaz (`.test`, `.example`, `ornek.`). |

Türkçe ek uyarısı: çevirilerde `{{brand}}`'den sonra ek (`'a`, `'un`) kullanılmaz; ünlü uyumu ada göre değişir.
Mevcut metinler eksiz kuruldu ("{{brand}} markasına aittir", "{{brand}} sitesinin futbol asistanısın").

---

## (a) Kullanıcıya görünen — değişmeli

### a1. `brand.ts`'ten otomatik değişenler (geçiş günü ek iş yok)

- Sayfa başlıkları ve `og:title` (`brandTitle()`): ana sayfa, maç, takım, oyuncu, puan durumu, karşılaştırma, haber,
  hakem/teknik direktör, gündem, Dünya Kupası, ödeme sonuç sayfaları, 404/500, yasal sayfalar.
- `_app` varsayılanları: `<title>`, `description`, `og:site_name`, `og:image:alt` / `twitter:image:alt`.
- JSON-LD: `Organization` (ana sayfa; `social` dolarsa `sameAs`), haber `publisher`, analiz paywall `publisher`, hakem `Dataset`.
- Canonical, `og:url`, `og:image`, `sitemap.xml`, `robots.txt` (Sitemap satırı) → `siteBaseUrl()`.
- Çeviriler (tr/en): `ai`, `assistant`, `auth`, `common` (footer ©), `credits`, `gundem` (resmi hesap etiketi, meta),
  `legal` (gizlilik/şartlar/iletişim: ad, alan adı, iletişim adresi), `match`, `profile`, `standings`.
- Header / Footer logo `alt` metni; logo yolu `BRAND_LOGO_SVG`.
- E-posta konuları (doğrulama, şifre sıfırlama) — `src/lib/security.ts`.
- AI asistan sistem prompt'u ve yardım metni; video pipeline prompt'u (YouTube kanal adı, ekran kaydı alan adı).
- Teknik ama görünür: haber çekiminde `User-Agent` (`compactName/1.0`), takvim `PRODID`.

### a2. Elle değişecek görseller (kod dışı varlık)

| Dosya | Not |
| --- | --- |
| `public/images/ofsaytyok-logo.svg` | Yeni logo; dosya adı değişirse `src/config/brandImages.ts` `BRAND_LOGO_SVG` + üretim betiği yolu. |
| `public/icon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-512.png` | `node scripts/generate-brand-images.mjs` üretir. |
| `public/images/og-default-v2.png` | Aynı betik; **adı sürümle** (`-v3`) — paylaşım önbellekleri URL'ye göre tutar. `OG_DEFAULT_IMAGE.path` güncelle. |
| `src/server/og/brandLogo.generated.ts` | Maç/takım OG görsellerindeki logo; betik üretir, elle düzenlenmez. |
| `public/images/logo-black.svg` | Dünya Kupası teması logosu (Header). |

### a3. Bekleyen — görünür ama başka oturumun alanı (izin listesinde `bekleyen`)

| Yer | Görünür olduğu yer | Geçiş günü |
| --- | --- | --- |
| `src/components/pitch3d/pitchKit.ts` — pano yazısı `'OFSAYT YOK'` | /auth sahnesi, /frikik | `BRAND.name.toUpperCase()` (tr yereli) |
| ~~`src/lib/frikik/ads.json`~~ — YAPILDI: `{{BRAND}}` yer tutucusu (adBoards `resolveAdText`) | /frikik panoları | — |
| ~~`src/pages/frikik.tsx`~~ — YAPILDI: `siteBaseUrl()` | canonical / og | — |
| ~~`public/locales/{tr,en}/frikik.json`~~ — YAPILDI: `{{brand}}` | sekme başlığı, paylaşım başlığı | — |

Bunlar düzeltilince izin listesindeki girdileri silinmeli (bayat girdi testi zaten hatırlatır).

---

## (b) İç / teknik kimlik — değiştirilmez

| Yer | Neden değişmiyor |
| --- | --- |
| VAR animasyonu: `VarScene.tsx` damgası `OFSAYT YOK` / `NO OFFSIDE`, yorumlar | Marka değil, hakem kararı ("ofsayt yok"). |
| Kural Köşesi animasyon kimliği `03-var-ofsayt-yok` (`kural-kosesi.json`, `facts.ts`, `Panel.tsx`) | İçerik anahtarı; adla ilgisi yok, değişirse içerik eşleşmesi kırılır. |
| Takvim UID'si `wcmatch-<id>@ofsaytyok.app` (`WorldCupCalendar`) | Kalıcı etkinlik kimliği; değişirse kullanıcı takviminde etkinlikler çiftlenir. |
| Logo dosya adı `ofsaytyok-logo.svg` (`brandImages.ts`, `generate-brand-images.mjs`, `brandLogo.generated.ts`) | Yeni logo gelene kadar aynı dosya; logo değişince dosya + yol birlikte (a2). |
| `docs/OFSAYT_YOK_DESIGN_SYSTEM.md` (ve `_tokens.scss`'teki referansı) | Belge dosya adı; istenirse ayrıca yeniden adlandırılır. |
| `package.json` `"name": "ofsayt-yok"`, repo ve worktree klasör adları | Private paket, yayınlanmıyor; yeniden adlandırma yalnız yerel yolları bozar. |
| `scripts/seed-official-account.mjs` (`official@ofsaytyok.invalid`, `ofsaytyok`) | DEPRECATED; DB'deki eski hesabın kimliği. |
| Test fikstürleri (`*.test.*`, `src/test/**`): örnek URL'ler, `itest.ofsaytyok.example`, mobil UA `OfsaytYok/1.0 (iOS)` | Girdi verisi; canlı çıktıyı doğrulayan testler `BRAND` okur. |
| `src/lib/authRedirect.ts` iç köken | Nötr `https://site.invalid` yapıldı (marka içermiyor). |

---

## (c) Dış sistemler — repo dışında, panelden değişir

| Sistem | Eski markaya bağlı olan | Geçiş günü |
| --- | --- | --- |
| **Alan adı / DNS** | `ofsaytyok.app`, `www.ofsaytyok.app` (apex → www 307) | Yeni alan adı + www; eski alan adı **en az 12 ay** 308 ile yeniye. |
| **Vercel** | Domains; env `AUTH_URL` (prod), `.env.local`'da `AUTH_URL` = `ofsayt-yok.vercel.app`; proje adı → `ofsayt-yok.vercel.app` | Yeni domain'i ekle, eskisini "Redirect to" yap; `NEXT_PUBLIC_SITE_URL` + `AUTH_URL` yeni kök. Proje adı değişirse `*.vercel.app` adresi de değişir (GitHub Actions'a bak). |
| **Google OAuth** (Cloud Console) | Onay ekranı uygulama adı + logo, yetkili alan adları, JS kökenleri, redirect `https://www.ofsaytyok.app/api/auth/callback/google` | Yeni alan adını ekle (eskiyi geçiş bitene kadar tut); redirect URI ekle; ad/logo güncelle (marka değişikliği yeniden doğrulama isteyebilir). next-auth kökü Vercel'de host başlığından gelir → callback `www.<yeni>`. |
| **Hikie** | Mağaza adı/logosu; her ödeme linkinin (`HIKIE_LINK_*`) başarı/başarısız dönüş adresleri `/odeme/tamamlandi`, `/odeme/tekrar-dene`; webhook `/api/payments/hikie/webhook`; callback `/api/payments/hikie/callback` | Tüm linklerin dönüş URL'leri ve webhook adresi yeni alan adına; mağaza adı. Link env adları (`HIKIE_LINK_*`) değişmez. |
| **Resend** | Doğrulanmış gönderen alan adı `contact.ofsaytyok.app`; `EMAIL_FROM` = `Ofsayt Yok <noreply@contact.ofsaytyok.app>` | Yeni alan adını Resend'de doğrula (SPF/DKIM DNS), sonra `EMAIL_FROM`'u değiştir. Görünen ad env'de, BRAND'den değil. |
| **İletişim posta kutusu** | `iletisim@ofsaytyok.app` (`BRAND.contactEmail`) | Yeni kutu kurulunca `brand.ts` tek satır; eski adrese gelenleri yönlendir. |
| **Sentry** | Proje slug `SENTRY_PROJECT` (`ofsayt-yok`), izinli alan adları, uyarı e-postaları | İzinli alan adlarına yenisini ekle; proje adı opsiyonel (slug değişirse env de). |
| **cron-job.org** | `https://www.ofsaytyok.app/api/admin/gundem/bot-tick` (1 dk, Bearer `CRON_SECRET`) ve varsa diğer işler | URL'yi `www.<yeni>` yap (apex yönlendirmesi POST'u bozar). Sonrasında tick izi kontrol. |
| **GitHub Actions** | `.github/workflows/evaluate-predictions.yml` → `https://ofsayt-yok.vercel.app/api/admin/{evaluate-predictions,analysis-pregenerate}` | Vercel proje adı değişirse URL'ler; daha iyisi bir repo değişkenine (`vars.SITE_URL`) taşımak. Repo adı (opsiyonel). |
| **Cloudflare Turnstile** | Site anahtarının izinli hostname listesi | Yeni alan adını ekle; yoksa kayıt formu doğrulaması düşer. |
| **Resmi Gündem hesabı** | Gmail `bilgi.ofsaytyok@gmail.com`, DB kullanıcı adı `ofsaytyokmedia` (`DEFAULT_BOT_ACCOUNT_EMAIL`, `GUNDEM_BOT_EMAIL`, `OFFICIAL_ACCOUNT_EMAILS`) | İsterseniz yeni hesap → env'leri ve DB kullanıcı adı/görünen adı güncelle; varsayılan sabiti değiştir. Ertelenebilir. |
| **Mağaza (App Store / Google Play) ve mobil uygulama** | Uygulama adı, ikon, mağaza açıklaması; API kökü uygulamaya gömülü; UA `OfsaytYok/1.0` | Mobil sürüm yeni API köküyle; eski alan adı yönlendirmesi eski sürümler için kalmalı. |
| **Sosyal hesaplar** | X / Instagram / YouTube kullanıcı adları | `BRAND.social` doldur → JSON-LD `sameAs` otomatik. |
| **Google Search Console** | Mülk `ofsaytyok.app` | Yeni mülk + "Adres değişikliği" aracı + yeni sitemap gönder. |
| **Vercel Analytics / Speed Insights** | Projeye bağlı | Ek iş yok (alan adından bağımsız). |

---

## Geçiş günü kontrol listesi

### Hazırlık (T-7 … T-1) — canlıyı etkilemez

- [ ] Yeni alan adını al; DNS'i Vercel'e yönlendirmeye hazırla.
- [ ] Vercel → Domains: yeni alan adını (apex + www) ekle, sertifika çıksın. Eskiyi henüz yönlendirme.
- [ ] Resend: `contact.<yeni>` alan adını ekle, SPF/DKIM kayıtlarını gir, "Verified" olsun.
- [ ] Google OAuth: yetkili alan adı + JS kökeni + redirect URI `https://www.<yeni>/api/auth/callback/google` ekle (eskiler kalsın).
- [ ] Cloudflare Turnstile: hostname listesine yeni alan adını ekle.
- [ ] Sentry: izinli alan adlarına yenisini ekle.
- [ ] Yeni iletişim posta kutusunu kur; eski adresten yönlendirme.
- [ ] Yeni logo SVG'leri hazır; `node scripts/generate-brand-images.mjs` ile ikon/OG üret, OG adını sürümle (`og-default-v3.png`).
- [ ] Bekleyen (a3) maddeleri ilgili oturumla birlikte BRAND'e bağla.

### Kod değişikliği (tek PR)

- [ ] `src/config/brand.ts`: `name`, `shortName`, `compactName`, `DEFAULT_SITE_URL`, `contactEmail`, gerekirse `tagline`/`description`, `social`.
- [ ] Görseller + `brandImages.ts` yolları (a2).
- [ ] `next.config.ts`: eski alan adı için host tabanlı 308 yönlendirmesi (Vercel paneli yerine koddan yapılacaksa; izin listesinde `optional` girdi hazır).
- [ ] İzin listesi: `brand.ts` (`kaynak`) ve düzeltilen `bekleyen` girdilerini sil — bayat girdi testi zaten ister.
- [ ] `docs/` içinde eski adı geçen belgeler (opsiyonel, testin kapsamı dışında).
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` (temiz worktree).
- [ ] Yerelde kontrol: `/`, `/iletisim`, `/gizlilik-politikasi`, `/robots.txt`, `/sitemap.xml` — başlık, og, JSON-LD, ekranda `{{` yok.

### Geçiş anı (sırayla)

1. [ ] Vercel env: `NEXT_PUBLIC_SITE_URL=https://www.<yeni>` ve `AUTH_URL=https://www.<yeni>` (Production). `NEXT_PUBLIC_*` derlemede gömülür → env'den **sonra** deploy.
2. [ ] PR'ı birleştir, deploy et.
3. [ ] Vercel → Domains: eski apex + www → yeni www, **308** (kalıcı).
4. [ ] Hikie: tüm ödeme linklerinin dönüş adresleri + webhook URL'si yeni alan adına; mağaza adı/logosu.
5. [ ] cron-job.org: bot-tick (ve diğer) URL'leri `www.<yeni>`.
6. [ ] GitHub Actions workflow URL'leri (Vercel proje adı değiştiyse).
7. [ ] Resend: `EMAIL_FROM=<Yeni Ad> <noreply@contact.<yeni>>` (Vercel env) → yeniden deploy gerekmez ama sonraki deploy'da kontrol.
8. [ ] Google OAuth onay ekranı adı/logosu.
9. [ ] Search Console: adres değişikliği + yeni sitemap.
10. [ ] Sosyal hesap adları; `BRAND.social` sonraki deploy'da.

### Doğrulama (geçiş sonrası aynı gün)

- [ ] `curl -I https://ofsaytyok.app/` ve `https://www.ofsaytyok.app/matches/...` → 308, `Location` yeni alan adı, yol korunuyor.
- [ ] `https://www.<yeni>/robots.txt` Sitemap satırı yeni alan adı; `/sitemap.xml` kökleri yeni.
- [ ] Ana sayfa / maç / takım kaynağında canonical, `og:url`, `og:image`, JSON-LD yeni alan adı ve ad.
- [ ] Paylaşım önizlemesi (Facebook/X debugger): yeni OG görseli.
- [ ] Google ile giriş (yeni alan adında), e-posta/şifre kayıt (Turnstile + doğrulama e-postası gelir, bağlantı yeni alan adı).
- [ ] Şifre sıfırlama e-postası: gönderen ve bağlantı.
- [ ] Hikie test ödemesi (sandbox/test linki): dönüş sayfası + webhook 200 + kredi işlendi.
- [ ] Gündem bot: cron-job.org geçmişinde 200; Vercel Logs'ta `bot-tick`.
- [ ] Sentry'de yeni alan adından olay geliyor; yeni hata dalgası yok.
- [ ] Mobil Lighthouse (canlı, 3 koşu medyan): ana sayfa, maç, puan durumu.
- [ ] Eski alan adı yönlendirmesi en az 12 ay açık kalacak (takvime hatırlatma).

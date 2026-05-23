# Servisler & Production Checklist

## 1. Vercel Analytics

### Dashboard Nerede?
- vercel.com → proje → sol menü **Analytics** sekmesi
- Göreceklerin: sayfa görüntülemeleri, unique ziyaretçi, popüler sayfalar, trafik kaynağı, ülke dağılımı
- **Local'de veri görmez** — sadece production deploy'dan veri toplanır. Deploy ettikten 24 saat sonra grafiklerde veri görünür.

### Kurulum
`@vercel/analytics` paketi yüklü, `src/pages/_app.tsx`'de `<Analytics />` ekli. Vercel'e deploy edince otomatik aktif olur, ek ayar gerekmez.

---

## 2. Resend & Email Doğrulama

### Şu Anki Durum (Test)
- Resend'e kayıtlı email adresine gönderebilirsin
- Diğer kullanıcılar kayıt olursa mail gitmez, konsola `[verify-email] Link: http://...` olarak loglanır

### Domain Aldıktan Sonra (Production)
1. Resend Dashboard → **Domains** → "Add Domain" → `ofsaytyok.app`
2. DNS paneline (Cloudflare vb.) verilen TXT + MX kayıtlarını ekle
3. Doğrulandıktan sonra `.env`'i güncelle:
```bash
EMAIL_FROM=Ofsayt Yok <noreply@ofsaytyok.app>
```
4. Artık tüm kullanıcılara doğrulama maili gider.

---

## 3. Sentry — Ne İşe Yarar?

### Problem: Production'da Körsen
`console.error` production'da sana ulaşmaz. Bir kullanıcı hata görüyor, sen hiç bilmiyorsun.

### Sentry'nin Çözdükleri

**Senaryo 1 — API Çöküyor**
Kullanıcı maç analizine tıklıyor, AI servisi timeout → boş ekran. Sentry ile: hata anında email gelir, tam stack trace görünür, kaç kullanıcıyı etkilediği yazar.

**Senaryo 2 — JavaScript Hatası**
Mobilde component crash oluyor. Sentry hangi tarayıcı/cihaz/ekran boyutunda olduğunu gösterir.

**Senaryo 3 — Performance**
Hangi API endpoint'i en yavaş? p95 response time görünür.

### Dashboard'da Göreceklerin
- **Issues** — gruplandırılmış hatalar, kaç kez oldu, son ne zaman
- **Performance** — sayfa yükleme süreleri, yavaş API'ler
- **Alerts** — yeni hata türü çıkınca email/Slack bildirimi
- **Breadcrumbs** — hatadan önceki kullanıcı adımları

### Dashboard Linki
sentry.io → projen → Issues sekmesi. DSN env eklenip deploy edilince aktif.

### Gerekli Env Variables
```bash
NEXT_PUBLIC_SENTRY_DSN=https://...@....ingest.sentry.io/...
SENTRY_DSN=https://...@....ingest.sentry.io/...   # aynı değer

# Source map upload için (isteğe bağlı, hata satırlarını görmek için)
SENTRY_ORG=senin-org-slug
SENTRY_PROJECT=ofsayt-yok
SENTRY_AUTH_TOKEN=sntrys_...
```

---

## 4. Stripe — Local Test Rehberi

### Ön Koşul
Stripe CLI kurulu ve `stripe --version` çalışıyor olmalı.
```bash
# macOS — önerilen
brew install stripe/stripe-cli/stripe
```

### Adım 1 — .env.local'a Test Key Ekle
Stripe Dashboard → Developers → API Keys → Secret key (test modu açık olsun)
```bash
STRIPE_SECRET_KEY=sk_test_51...
```

### Adım 2 — Terminal 1: Dev Server
```bash
npm run dev
```

### Adım 3 — Terminal 2: Webhook Listener
```bash
stripe login        # tarayıcı açılır, authorize et
stripe listen --forward-to localhost:3000/api/payment/webhook
```
Çıktıda görünecek:
```
> Ready! Your webhook signing secret is whsec_abc123...
```
Bu `whsec_...` değerini `.env.local`'a ekle, dev server'ı yeniden başlat:
```bash
STRIPE_WEBHOOK_SECRET=whsec_abc123...
```

### Adım 4 — Test Ödemesi
1. `/premium` sayfasına git → "Satın Al" tıkla
2. Stripe Checkout açılır — test kart bilgileri:
```
Kart No : 4242 4242 4242 4242
Son Kul : 12/29  (gelecek herhangi tarih)
CVC     : 123
```
3. "Pay" tıkla → `/premium?payment=success` sayfasına döner

### Adım 5 — Doğrulama
Stripe CLI terminalinde göreceklerin:
```
POST /api/payment/webhook [200]
checkout.session.completed
```
Prisma Studio'da `premiumUntil` güncellendi mi kontrol:
```bash
npm run db:studio
# User tablosuna bak
```

### Hata Senaryosu Test Kartları
| Kart No | Senaryo |
|---------|---------|
| `4242 4242 4242 4242` | Başarılı ödeme |
| `4000 0000 0000 0002` | Kart reddedildi |
| `4000 0025 0000 3155` | 3D Secure gerektirir |

---

## 5. UI Test Listesi

Dev server açıkken sırasıyla:

- [ ] `/premium` → "Satın Al" → Stripe Checkout → `4242...` kart → success sayfası
- [ ] Prisma Studio'da kullanıcının `premiumUntil` güncellendi mi
- [ ] Çıkış yap → `/ai-istatistikleri` → signin sayfasına yönlendiriyor mu
- [ ] Yeni kullanıcı kaydı → `verify-email-sent` sayfası çıkıyor mu
- [ ] `/sitemap.xml` → XML görünüyor mu, maçlar listeleniyor mu
- [ ] `/ofsayt-olmayan-sayfa` → özel 404 sayfası çıkıyor mu
- [ ] Maç detayı → poll'a oy ver → yüzdeler animasyonlu güncelleniyor mu

---

---

# Production Checklist — Deploy Öncesi & Sonrası

## Deploy Öncesi (Vercel'e İlk Push)

### Zorunlu Env Variables (Vercel Dashboard → Settings → Environment Variables)
```bash
# Auth
NEXTAUTH_SECRET=           # openssl rand -base64 32
NEXTAUTH_URL=https://ofsaytyok.app

# Veritabanı
DATABASE_URL=              # production Postgres URL

# Upstash Redis (Rate Limit)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# AI
ANTHROPIC_API_KEY=

# LiveScore API
LIVESCORE_API_KEY=
LIVESCORE_API_HOST=

# Stripe (test → live geçişte güncelle)
STRIPE_SECRET_KEY=sk_test_...   # önce test, sonra sk_live_...
STRIPE_WEBHOOK_SECRET=          # Vercel webhook endpoint'inden alınır (aşağıda)

# Email
RESEND_API_KEY=
EMAIL_FROM=Ofsayt Yok <noreply@ofsaytyok.app>   # domain doğrulandıktan sonra

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=

# Turnstile (bot koruması)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

---

## Deploy Sonrası — Tek Seferlik Ayarlar

### 1. Stripe Production Webhook Kur
- Stripe Dashboard → Developers → **Webhooks** → "Add endpoint"
- URL: `https://ofsaytyok.app/api/payment/webhook`
- Event: `checkout.session.completed`
- Oluşturulan `whsec_...` değerini Vercel env'e `STRIPE_WEBHOOK_SECRET` olarak ekle
- Yeni deploy tetikle

### 2. Resend Domain Doğrula
- Resend Dashboard → Domains → "Add Domain" → `ofsaytyok.app`
- DNS paneline TXT + MX kayıtlarını ekle (Resend'in verdiği değerler)
- Doğrulandıktan sonra Vercel'de `EMAIL_FROM` env'ini güncelle

### 3. Stripe Test → Live Geçiş (Ödeme Almaya Başlamadan Önce)
- Stripe Dashboard → "Activate your account" → firma + banka bilgileri (KYC)
- `sk_test_...` → `sk_live_...` ile değiştir (Vercel env)
- Webhook secret'ı da live endpoint için yenile
- Test ile bir ödeme dene

### 4. Sentry Source Map (Hata Satırlarını Görmek İçin)
- Sentry Dashboard → Settings → Account → Auth Tokens → "Create New Token" (scope: `project:write`)
- Vercel env'e ekle: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`
- Sonraki deploy'da source map'ler otomatik yüklenir

### 5. robots.txt Domain Kontrolü
`public/robots.txt`'te sitemap URL'si `https://ofsaytyok.app/sitemap.xml` olarak güncellendi. ✅

### 6. Google Search Console
- search.google.com/search-console → "Add Property" → `ofsaytyok.app`
- Domain doğrulama: DNS'e TXT kaydı ekle
- Sitemap gönder: `https://ofsaytyok.app/sitemap.xml`
- İlk indexleme 1-2 hafta alabilir

### 7. Prisma Migration
```bash
# Production DB'de migration çalıştır
npx prisma migrate deploy
```

---

## Sürekli Bakım

| Görev | Ne Zaman | Nereden |
|-------|----------|---------|
| Sentry hata takibi | Haftada 1 | sentry.io → Issues |
| Vercel Analytics | Haftada 1 | vercel.com → Analytics |
| Stripe ödemeler | Her gün | dashboard.stripe.com |
| Upstash kullanım limiti | Ayda 1 | upstash.com → konsol |
| Anthropic API kullanımı | Ayda 1 | console.anthropic.com |

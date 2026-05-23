# Ofsayt Yok — Proje Analizi

## Genel Bakış

**Ofsayt Yok** (`ofsaytyok.app`) Türkiye ve dünya futbolunu kapsayan bir analiz platformudur.
Canlı maç skorları, AI destekli maç analizleri, puan durumu, haber akışı ve premium üyelik sistemi sunar.

---

## Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| Framework | Next.js 16 + React 19, SSR (getServerSideProps) |
| Dil | TypeScript |
| Veritabanı | PostgreSQL (Supabase), Prisma ORM |
| Auth | NextAuth.js v4 (Credentials + JWT), bcryptjs |
| Ödeme | Stripe (one-time payment, checkout sessions) |
| AI | OpenAI (gpt-4.1-mini) — Anthropic Claude opsiyonel fallback |
| Rate Limiting | Upstash Redis (KV_REST_API_* prefix) |
| Email | Resend (test modunda) |
| Bot Koruması | Cloudflare Turnstile (sadece production'da zorunlu) |
| Error Tracking | Sentry (@sentry/nextjs) |
| Analytics | Vercel Analytics |
| Styling | SCSS Modules |
| State | Redux Toolkit |
| Hosting | Vercel |

---

## Mimari Kararlar

### Sayfa Yapısı
- Tüm sayfalar SSR (`getServerSideProps`) ile server-side render ediliyor
- Cache-Control header'ları sayfa bazında ayarlanmış (30s–3600s arası)
- Yönlendirme: Next.js Pages Router (App Router değil)

### Auth Akışı
1. Credentials Provider: email veya username + şifre
2. Şifre: bcrypt (12 rounds)
3. Session: JWT stratejisi, 60s'de bir DB'den role sync
4. Email doğrulama: kayıt sonrası Resend ile link gönderimi
5. `AUTH_SECRET` birincil env var (`NEXTAUTH_SECRET` fallback)

### Ödeme Akışı
1. `/api/payment/create-checkout` → Stripe Checkout Session oluştur (price_data inline)
2. Kullanıcı Stripe Checkout'u tamamlar
3. Stripe webhook → `/api/payment/webhook`
4. Webhook: `checkout.session.completed` olayını yakalar, DB'de `premiumUntil` günceller
5. İki plan: Aylık (79 TRY / 30 gün), Yıllık (699 TRY / 365 gün)

### AI Servis Katmanı
- `src/services/aiAnalysisService.ts` ve `aiTriviaService.ts`
- Provider seçimi: `OPENAI_API_KEY` varsa OpenAI, `ANTHROPIC_API_KEY` varsa Anthropic
- Premium gate: `requirePremium` middleware ile korunan endpoint'ler
- Cache stratejisi: PRE fazda kısa TTL, HT/POST fazda sonsuz (Upstash Redis)

### Rate Limiting
- `src/lib/rateLimit.ts` → Upstash Redis üzerinde fixed window algoritması
- Auth kayıt: 5 istek / 15 dakika / IP
- Yorum: 5 istek / dakika / kullanıcı
- AI analiz: 30 istek / saat / kullanıcı

### URL Yönetimi
- `AUTH_URL` env var primary; fallback: `'https://ofsaytyok.app'`
- Canonical URL'ler `process.env.AUTH_URL ?? 'https://ofsaytyok.app'` pattern ile üretilir
- `src/lib/security.ts` ve `verify-email.ts` zaten bu fallback zincirini kullanır

---

## Dizin Yapısı

```
src/
├── components/       UI bileşenleri (Header, MatchCard, MatchForum, ...)
├── config/           Lig konfigürasyonları (SIDEBAR_LEAGUES vb.)
├── hooks/            Custom React hooks
├── lib/              Yardımcı kütüphaneler (auth, stripe, redis, logger, security, validation)
├── models/           Veri modelleri
├── pages/
│   ├── api/          22 API endpoint (auth, payment, matches, user, livescore, ...)
│   ├── auth/         Signin, signup, şifre sıfırlama sayfaları
│   ├── matches/      Maç detay sayfası ([slug].tsx)
│   ├── news/         Haber detay sayfası
│   ├── standings/    Puan durumu
│   ├── teams/        Takım detay
│   ├── world-cup/    Dünya Kupası 2026
│   ├── uefa/         UEFA maçları
│   └── premium.tsx   Premium üyelik sayfası
├── server/           SSR yardımcıları (veri yükleme, Livescore axios)
├── services/         İş mantığı (AI, LiveScore API, Twitter bot)
├── store/            Redux store
├── styles/           Global SCSS
├── types/            TypeScript tipleri
└── utils/            Yardımcı fonksiyonlar (matchUrl, ...)

prisma/               Veritabanı şeması ve migration'lar
scripts/              CLI araçları (grant-premium)
docs/                 Servis rehberleri ve production checklist
public/               Statik dosyalar, robots.txt, görseller
```

---

## API Endpoint'leri (22 adet)

| Endpoint | Açıklama |
|----------|----------|
| `POST /api/auth/register` | Kullanıcı kaydı (rate limit + Turnstile) |
| `GET/POST /api/auth/[...nextauth]` | NextAuth handler |
| `POST /api/auth/forgot-password` | Şifre sıfırlama linki |
| `POST /api/auth/reset-password` | Yeni şifre kaydetme |
| `POST /api/auth/verify-email` | Email doğrulama |
| `POST /api/payment/create-checkout` | Stripe Checkout Session oluştur |
| `POST /api/payment/webhook` | Stripe webhook (premiumUntil güncelle) |
| `GET /api/matches/[id]/analysis` | AI maç analizi (premium) |
| `GET/POST /api/matches/[id]/comments` | Maç yorumları |
| `GET /api/matches/[id]/trivia` | AI maç trivia (premium) |
| `GET/POST /api/matches/[id]/poll` | Maç anketi |
| `GET /api/livescore/[...path]` | LiveScore API proxy |
| `GET /api/news` | Haber listesi |
| `GET /api/news/[id]` | Haber detayı |
| `GET /api/compare/teams` | Takım karşılaştırma |
| `GET /api/ai-stats` | AI tahmin istatistikleri |
| `GET/PUT /api/user/me` | Kullanıcı profili |
| `PUT /api/user/password` | Şifre değiştirme |
| `GET/POST /api/user/favorites` | Favori maçlar |
| `POST /api/admin/grant-premium` | Manuel premium verme (admin) |
| `POST /api/admin/evaluate-predictions` | AI tahmin değerlendirme (admin) |

---

## Güvenlik Önlemleri

- **XSS:** `sanitizePlainText` ile yorum içeriği temizleniyor
- **CSRF:** NextAuth built-in CSRF koruması (session tabanlı)
- **Rate Limiting:** Upstash Redis ile IP + kullanıcı bazlı
- **Bot Koruması:** Cloudflare Turnstile (kayıt endpoint'inde)
- **Şifre:** Minimum 10 karakter, büyük/küçük harf + rakam + özel karakter zorunluluğu
- **Webhook:** Stripe imza doğrulaması (`micro` + `buffer`)
- **SQL Injection:** Prisma ORM (parametreli sorgular)
- **URL Doğrulama:** `isSafeHttpUrl` fonksiyonu (javascript: ve data: URI engelleme)

---

## Veritabanı Modeli (Özet)

Ana tablolar:
- `User`: id, email, username, password, role (USER/ADMIN), premiumUntil, emailVerified
- `Account`, `Session`, `VerificationToken`: NextAuth adaptör tabloları
- Maç verileri LiveScore API'den anlık çekiliyor, DB'de saklanmıyor

---

## Ortam Değişkenleri

### Zorunlu (production)
```bash
AUTH_SECRET=          # JWT imzalama
AUTH_URL=             # https://ofsaytyok.app (prod) / preview URL / localhost:3000
DATABASE_URL=         # PostgreSQL (Supabase pooler)
DIRECT_URL=           # PostgreSQL (Supabase direct, migration için)
KV_REST_API_URL=      # Upstash Redis
KV_REST_API_TOKEN=    # Upstash Redis
LIVESCORE_API_KEY=    # LiveScore API key
LIVESCORE_API_SECRET= # LiveScore API secret
OPENAI_API_KEY=       # AI analiz (Anthropic opsiyonel alternatif)
RESEND_API_KEY=       # Email servisi
EMAIL_FROM=           # Gönderici adresi (domain doğrulandıktan sonra noreply@ofsaytyok.app)
STRIPE_SECRET_KEY=    # sk_test_... → sk_live_... (live'a geçince)
STRIPE_WEBHOOK_SECRET=# whsec_... (her ortam için ayrı)
NEXT_PUBLIC_SENTRY_DSN= # Sentry DSN (public)
NEXT_PUBLIC_TURNSTILE_SITE_KEY= # Cloudflare Turnstile (public)
TURNSTILE_SECRET_KEY= # Cloudflare Turnstile (secret)
```

### Opsiyonel
```bash
SENTRY_ORG=           # Source map upload
SENTRY_PROJECT=       # Source map upload
SENTRY_AUTH_TOKEN=    # Source map upload
ANTHROPIC_API_KEY=    # Anthropic Claude (OpenAI varsa gerekmez)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= # Stripe.js client
```

---

## Bilinen Sorunlar ve Teknik Borç

| Sorun | Öncelik | Dosya |
|-------|---------|-------|
| Resend test modunda, kullanıcılara mail gitmiyor | Yüksek | Servis konfigürasyonu |
| Stripe test modunda, gerçek ödeme alınamıyor | Yüksek | Servis konfigürasyonu |
| `next.config.ts` image hostname `'**'` (SSRF riski) | Orta | `next.config.ts` |
| `reactStrictMode: false` | Düşük | `next.config.ts` |
| `STRIPE_PRICE_ID_MONTHLY` declare edilmiş ama kullanılmıyor | Düşük | `src/lib/stripe.ts` |
| Error boundary component yok | Düşük | Genel |

---

## Production'a Çıkış İçin Yapılacaklar

Detaylar için: [SERVISLER_VE_PROD_CHECKLIST.md](./SERVISLER_VE_PROD_CHECKLIST.md)

1. **Vercel env güncelle:** `AUTH_URL` (✅), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `EMAIL_FROM`
2. **Stripe:** Webhook kur → KYC tamamla → sk_live_ geçişi
3. **Resend:** `ofsaytyok.app` domain doğrula
4. **DB:** `npx prisma migrate deploy` çalıştır
5. **Google Search Console:** Domain doğrula → sitemap gönder
6. **UI Test:** SERVISLER_VE_PROD_CHECKLIST.md'deki 7 maddeyi geç

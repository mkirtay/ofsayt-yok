# Kullanıcı Hareketleri Takibi

> Ofsayt Yok — mevcut gözlemlenebilirlik durumu ve nasıl genişletilebileceği

---

## 1. Mevcut Durum

### 1.1 Sentry (Hata Takibi)

**Yapılandırma:** `sentry.client.config.ts` + `sentry.server.config.ts`

```
tracesSampleRate: 0.2   → her 5 istekten 1'i trace'lenir
enabled: production only
```

**Şu an yakalananlar:**

| Nereden | Ne yakalanıyor |
|---|---|
| `src/lib/logger.ts` → `captureError()` | Sunucu tarafı exception'lar |
| API: `analysis.ts`, `trivia.ts`, `comments.ts`, `create-checkout.ts` | Endpoint hataları |
| Next.js otomatik entegrasyon | Render hataları, unhandled rejection'lar |

**Eksikler:**
- `Sentry.setUser()` hiçbir yerde çağrılmıyor → kullanıcıya atfedilen hata yok
- Kullanıcı aksiyonları için özel event yok (analiz istedi, yorum attı, oy kullandı)
- Breadcrumb eklenmemiş → hata öncesi adımlar görünmüyor
- Session Replay devre dışı

---

### 1.2 Vercel Analytics (Sayfa Görüntüleme)

**Yapılandırma:** `src/pages/_app.tsx`

```tsx
import { Analytics } from '@vercel/analytics/next'
// ...
<Analytics />
```

**Otomatik olarak izlenenler:**
- Sayfa geçişleri (route değişimleri)
- Sayfa yükleme süreleri (Web Vitals: LCP, FID, CLS)
- Tarayıcı / cihaz dağılımı
- Coğrafi konum (ülke bazlı)
- Referrer kaynakları

**Eksikler:**
- Özel event yok → hangi butona tıklandı, hangi özellik kullanıldı bilinmiyor
- `@vercel/analytics` `track()` fonksiyonu kurulu ama hiç çağrılmıyor

---

### 1.3 Veritabanı (Dolaylı Davranış Verisi)

Prisma + PostgreSQL'de saklanan kullanıcı aksiyonları:

| Model | Ne Anlatıyor |
|---|---|
| `UserPrediction` | Kim hangi maçta ne tahmin etti (HOME/DRAW/AWAY) |
| `MatchComment` | Kim hangi maçta yorum yaptı, ne zaman |
| `MatchAnalysis.tokensUsed` | AI analizi ne kadar kullanıldı |
| `MatchTrivia.tokensUsed` | AI trivia ne kadar kullanıldı |
| `PredictionRecord` | AI tahmin isabeti (accuracy tracking) |
| `User.favoriteTeamIds/favoriteLeagueIds` | Favori takım/lig tercihleri |
| `User.premiumUntil` | Premium dönüşüm ve churn takibi |

Bu veriler Prisma Studio veya doğrudan SQL sorgusuyla analiz edilebilir.

---

## 2. Kullanıcı Hareketlerini Nasıl Takip Ederiz

### 2.1 Sentry'ye Kullanıcı Kimliği Bağlama

Kullanıcı giriş yaptığında Sentry'ye kimlik atanmalı. En doğru yer `_app.tsx`:

```tsx
// src/pages/_app.tsx
import * as Sentry from '@sentry/nextjs'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

function SentryUserSync() {
  const { data: session } = useSession()
  useEffect(() => {
    if (session?.user) {
      Sentry.setUser({
        id: session.user.id,
        email: session.user.email ?? undefined,
      })
    } else {
      Sentry.setUser(null)
    }
  }, [session])
  return null
}

// App bileşeninin içine ekle:
// <SentryUserSync />
```

Bunu ekledikten sonra Sentry'deki her hata "hangi kullanıcıda" olduğunu gösterir.

---

### 2.2 Vercel Analytics ile Özel Event'ler

`@vercel/analytics` zaten yüklü, `track()` fonksiyonu kullanılmayı bekliyor.

**Nereye eklemeli:**

```ts
import { track } from '@vercel/analytics'

// Analiz isteği — MatchAnalysis bileşeninde
track('analysis_requested', { matchId, matchPhase: 'PRE' })

// Trivia isteği — MatchTrivia bileşeninde
track('trivia_requested', { matchId })

// Tahmin gönderme — MatchPoll bileşeninde
track('poll_submitted', { prediction: 'HOME' })

// Yorum gönderme — MatchForum bileşeninde
track('comment_posted', { matchId })

// Premium modal açıldı — PremiumModal bileşeninde
track('premium_modal_opened', { trigger: 'analysis_lock' })

// Ödeme başlatıldı — create-checkout sonrası
track('checkout_started', { plan: 'monthly' })

// Favori eklendi
track('favorite_added', { type: 'team' })
```

Vercel Analytics dashboard'unda bu event'ler `Custom Events` sekmesinde görünür.

---

### 2.3 Sentry Breadcrumb ile Kullanıcı Akışı

Kritik aksiyonlarda Sentry'ye breadcrumb eklersen, bir hata olduğunda önceki adımlar görünür:

```ts
import * as Sentry from '@sentry/nextjs'

// Analiz isteği öncesinde:
Sentry.addBreadcrumb({
  category: 'user.action',
  message: 'AI analizi istedi',
  data: { matchId, matchPhase: 'PRE' },
  level: 'info',
})

// Ödeme başlatılırken:
Sentry.addBreadcrumb({
  category: 'payment',
  message: 'Checkout başlatıldı',
  data: { plan },
  level: 'info',
})
```

---

### 2.4 Sentry Performance ile API Süre Takibi

`tracesSampleRate: 0.2` aktif, yani transaction'lar geliyor. Bunları zenginleştirmek için:

```ts
// API handler içinde
import * as Sentry from '@sentry/nextjs'

const span = Sentry.startInactiveSpan({ name: 'ai.generate_analysis', op: 'ai' })
const result = await generateMatchAnalysis(ctx)
span.end()
```

Sentry → Performance → Traces ekranında AI sürelerini görebilirsin.

---

## 3. Hangi Soruları Yanıtlayabilirsin (Bugün)

| Soru | Kaynak |
|---|---|
| Bu hafta kaç kez hata oluştu? | Sentry Issues |
| Hangi sayfalar en çok ziyaret ediliyor? | Vercel Analytics |
| Hangi maçlara en çok yorum yapıldı? | `MatchComment` tablosu |
| Kullanıcılar hangi takımı en çok favoriledi? | `User.favoriteTeamIds` |
| AI analizi kaç token tüketiyor? | `MatchAnalysis.tokensUsed` |
| Premium dönüşüm kaç kişide gerçekleşti? | `User.premiumUntil IS NOT NULL` |

### Örnek SQL Sorguları

```sql
-- En aktif kullanıcılar (yorum sayısına göre)
SELECT u.email, COUNT(c.id) AS comment_count
FROM "MatchComment" c
JOIN "User" u ON c."userId" = u.id
WHERE c."deletedAt" IS NULL
GROUP BY u.email
ORDER BY comment_count DESC
LIMIT 10;

-- Son 7 günde kaç premium dönüşüm oldu
SELECT COUNT(*) FROM "User"
WHERE "premiumUntil" > NOW()
  AND "createdAt" > NOW() - INTERVAL '7 days';

-- AI analiz israfını ölç (tokensUsed toplamı)
SELECT SUM("tokensUsed") AS total_tokens,
       COUNT(*) AS analysis_count
FROM "MatchAnalysis";

-- Topluluk tahmini dağılımı
SELECT prediction, COUNT(*) AS votes
FROM "UserPrediction"
GROUP BY prediction;
```

---

## 4. Öncelik Sırası

| Öncelik | İş | Etki |
|---|---|---|
| **1 - Acil** | `Sentry.setUser()` ekle | Hataları kullanıcıya atfet |
| **2 - Yüksek** | `track()` çağrılarını premium aksiyonlara ekle | Analiz/trivia/checkout event'leri |
| **3 - Orta** | Sentry breadcrumb'ları ekle | Hata öncesi context |
| **4 - Düşük** | Sentry Performance span'leri | AI süre breakdown |
| **5 - İsteğe bağlı** | Session Replay aktif et | Kullanıcı yeniden oynat (GDPR dikkat) |

### Session Replay için (isteğe bağlı, KVKK/GDPR uyumu gerekir)

```ts
// sentry.client.config.ts'e ekle
import { replayIntegration } from '@sentry/nextjs'

Sentry.init({
  // ...mevcut ayarlar...
  integrations: [
    replayIntegration({
      maskAllText: true,      // PII maskeleme
      blockAllMedia: true,
    }),
  ],
  replaysSessionSampleRate: 0.05,  // %5 oturum
  replaysOnErrorSampleRate: 1.0,   // Hata olan oturumun tamamı
})
```

---

## 5. Özet

```
Şu an çalışan:
  ✓ Sentry → sunucu hataları (kullanıcı kimliği YOK)
  ✓ Vercel Analytics → sayfa görüntülemeleri
  ✓ PostgreSQL → aksiyonlar dolaylı olarak kayıtlı

Yapılacaklar (küçük müdahale, yüksek kazanç):
  ✗ Sentry.setUser() → _app.tsx'e ekle
  ✗ track() → MatchAnalysis, MatchTrivia, MatchPoll, PremiumModal'a ekle
  ✗ Sentry breadcrumb → analysis/trivia/payment akışlarına ekle
```

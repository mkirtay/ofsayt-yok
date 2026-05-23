# Veritabanı Araçları

## Prisma Studio (Görsel DB Editörü)

Tüm tabloları tarayıcıda görsel olarak incelemek, kayıt eklemek/düzenlemek için kullanılır.

```bash
npm run db:studio
```

Tarayıcıda otomatik açılır: **http://localhost:5555**

> `.env.local` dosyasındaki `DATABASE_URL` ve `DIRECT_URL` değişkenlerini kullanır.
> Prisma Studio production DB'ye bağlanır — dikkatli edit yapın.

### Hangi tablolar var?

| Tablo | İçerik |
|-------|--------|
| `User` | Kayıtlı kullanıcılar, premium durumu, roller |
| `MatchAnalysis` | AI üretimli maç analizleri (PRE/HT cache) |
| `PredictionRecord` | PRE tahminleri + maç bittikten sonra isabet oranları |
| `MatchTrivia` | AI üretimli trivia/eğlenceli istatistikler |
| `MatchComment` | Kullanıcı yorumları |
| `UserPrediction` | Topluluk anketi oyları (1X2) |
| `VerificationToken` | Email doğrulama ve şifre sıfırlama token'ları |

---

## Diğer DB Scriptleri

### Schema değişikliği sonrası DB'yi güncelle

```bash
npm run db:push
```

`prisma/schema.prisma`'daki değişiklikleri production DB'ye uygular. Migration dosyası oluşturmaz.

### Prisma Client'ı yeniden üret

```bash
npm run db:generate
```

Schema değişikliğinden sonra TypeScript tiplerini günceller. `db:push` bunu zaten otomatik yapar.

---

## PredictionRecord Tablosu

PRE fazında AI analizi yapılan maçların tahminleri burada tutulur. Maç bitince değerlendirme yapılır.

### Kolonlar

| Kolon | Açıklama |
|-------|----------|
| `matchLabel` | "Ev Takımı - Deplasman" formatında maç adı |
| `predictedHomePct` | AI'nın ev sahibi galibiyeti tahmini (0-100) |
| `predictedDrawPct` | Beraberlik tahmini |
| `predictedAwayPct` | Deplasman galibiyeti tahmini |
| `predictedScore` | Tahmin edilen skor ("2-1" gibi) |
| `actualResult` | Gerçek sonuç: HOME / DRAW / AWAY |
| `actualScore` | Gerçek skor ("3-0" gibi) |
| `result1x2Hit` | Maç sonucu tahmini tuttu mu? |
| `scoreExactHit` | Tam skor tahmini tuttu mu? |
| `evaluatedAt` | Null ise henüz değerlendirilmemiş |

### Değerlendirme çalıştır (Admin)

Biten maçların tahminlerini değerlendirmek için admin hesabıyla:

```
POST https://www.ofsaytyok.app/api/admin/evaluate-predictions
```

Ya da local'de:

```
POST http://localhost:3000/api/admin/evaluate-predictions
```

`evaluatedAt: null` olan kayıtları tarar, LiveScore API'den final skoru çeker, isabet oranlarını hesaplar ve kaydeder. AI çağrısı yoktur — sıfır token maliyeti.

### İsabet oranlarını görmek için

`/ai-istatistikleri` sayfasına git. Bu sayfa `PredictionRecord` tablosunu okur.

---

## Premium Verme (Manuel)

```bash
npm run grant-premium
```

Script çalıştırıldığında email ve süre (gün) sorar.

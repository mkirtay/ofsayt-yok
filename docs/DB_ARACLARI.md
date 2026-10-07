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

---

## Kural: yeni tablolarda Row Level Security

Prisma'yla eklenen her yeni tablo için migration SQL'ine şunu ekle:

```sql
ALTER TABLE "<Tablo>" ENABLE ROW LEVEL SECURITY;
```

Politika eklenmez: uygulama tabloya yalnız Prisma'nın servis bağlantısıyla erişir (RLS'yi aşan rol). Böylece Supabase'in
PostgREST/anon anahtarı üzerinden tabloya erişilemez. Deploy sonrası Supabase → Advisors → **Security Advisor**'da
**0 hata** olduğunu doğrula (`rls_disabled_in_public` uyarısı kalmamalı).

---

## emailNormalized geri doldurma (kanonik e-posta, 2026-10)

`canonicalEmail` (src/lib/emailNormalize.ts) genişledi: artık TÜM alan adlarında `+etiket` atılıyor (gmail'de ayrıca
noktalar; IDN → punycode). Eski satırlarda `User.emailNormalized` boş (2026-10-04 öncesi) ya da eski kuralla yazılmış.
Kod bu satırları ham e-postadaki `taban+…@alan` aramasıyla da yakalıyor, ama tekil indeksin tam koruma sağlaması için
değerler güncel kuralla yeniden yazılmalı.

```bash
# 1) DRY-RUN (varsayılan; hiçbir şey yazmaz): plan + çakışma raporu, e-postalar maskeli
npx dotenv -e .env.local -- npx tsx scripts/backfill-email-normalized.mjs

# 2) Rapor uygunsa yaz
npx dotenv -e .env.local -- npx tsx scripts/backfill-email-normalized.mjs --apply
```

- Sıra: önce bu değişikliğin (kanonik kural) deploy'u, sonra betik. Deploy'dan önce çalıştırılırsa yeni kayıtlar eski
  kuralla yazılmaya devam eder.
- **Çakışma grubu** = aynı posta kutusunda birden çok hesap (ör. `ali+1@outlook.com` ve `ali+2@outlook.com`). Betik bu
  gruplardaki hiçbir satıra yazmaz; kullanıcı id'leri ve maskeli e-postaları listeler. Karar elle: hesapları birleştirme,
  fazla kayıt bonuslarını (`CreditTransaction` `SIGNUP_BONUS`) geri alma ya da olduğu gibi bırakma. Kayıt bonusu kodu
  (`grantVerifiedSignupBonus`) aynı posta kutusunda ikinci bonusu zaten vermez; bu gruplar yalnız geçmişte verilmiş
  bonuslar için önemlidir.
- `--apply` her satırı ayrı ve koşullu yazar (okunduğu andaki değer değişmişse atlar). Tekil çakışma (P2002) raporlanıp
  atlanır; betiği bir kez daha çalıştırmak, sıralamadan doğan geçici çakışmaları çözer. Tekrar çalıştırmak güvenlidir.

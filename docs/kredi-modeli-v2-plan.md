# Kredi modeli v2 — uygulama planı

Durum: **PLAN — onay bekliyor, kod yazılmadı.** Tarih: 2026-10-03.
Girdi: kullanıcının 10 kararı; `docs/kredi-fiyatlandirma-raporu.md`; mevcut kod (`106f818` atomik düşüm, `56d8016` premium=false).

## 0. Bugünkü durum (kısaca)

| Konu | Bugün | v2 |
|---|---|---|
| Analiz erişimi | Bir kişi 5 krediyle üretir, **herkes bedava okur** (`GET /analysis` tam analizi herkese döner) | Her kullanıcı kendisi için 1 krediyle açar; açtığı kalıcı açık |
| Girişsiz ziyaretçi | Tam analizi görür (istemci JS ile çeker; Googlebot da görür) | Yalnız önizleme (kısa özet + ana olasılık) |
| Kayıt bonusu | 5 kredi, kayıt anında (DB varsayılanı `credits = 5`) | 2 kredi, yalnız e-posta doğrulanınca (Google doğrulanmış sayılır) |
| Premium | Kimse değil (`isPremiumUser` → false); ADMIN kredisiz üretir | `User.premiumUntil`; sınırsız açma + reklamsız; yönetici panelinden elle |
| Paketler | 5 / 50 / 100 kredi, fiyatsız, "Yakında" | 10 / 30 / 100 kredi — 39,99 / 99,99 / 249,99 TL, "Yakında" |
| Yönetici | Yalnız `POST /api/admin/grant-credits` (arayüz yok) | Kullanıcı arama, kredi ±, premium ver/kaldır, hareketler |

Bulunan iki açık (v2'de kapanır):
- **`/ai-istatistikleri` sızıntısı:** `loadAiStatsDashboard` geçmiş listesinde HENÜZ OYNANMAMIŞ maçların tahminini de veriyor
  (`predictedHomePct/Draw/Away`, `predictedScore`). Kilitli içeriğin (skor tahmini) kapısı. v2: geçmiş listesinde yalnız
  değerlendirilmiş (bitmiş) maçlar; bekleyenler yalnız sayı olarak.
- **Googlebot bugün tam analizi görüyor** (istemci JS ile `GET /analysis` → herkese tam). v2'de kimseye (bot dahil) kilitli içerik
  gönderilmez → cloaking riski yok.

## 1. Erişim kuralları (tek kaynak: `src/lib/analysisAccess.ts`)

Bir kullanıcı bir PRE analizine erişebilir ⇔ aşağıdakilerden biri:
1. `AnalysisUnlock(userId, matchAnalysisId)` satırı var (kredi / haftalık ücretsiz / premium / yönetici / eski kayıt).
2. Premium (`premiumUntil > now`) ya da ADMIN → erişim anında bir unlock satırı yazılır (kaynak `PREMIUM` / `ADMIN`).
   Premium bitince **açtıkları açık kalır** (karar bekliyor: §11-3).
3. (Karar bekliyor §11-1) Maç bittikten sonra herkese açık — öneri: evet.

Herkes: önizleme (özet + ana olasılık). Girişsiz kullanıcıya "Giriş yap ve 1 krediyle aç".

**Kredi asla sonuca bağlanmaz (karar 8):** tahmin tutunca/tutmayınca kredi iadesi ya da ödülü YOK; `CreditTransactionType`
listesine sonuç bağlı tür eklenmez; `predictionRecords.ts` kredi modülünü import etmez — bunu bir koruma testi denetler.

## 2. Açma akışı — `POST /api/matches/[id]/analysis` (aynı adres, eski istemciyle uyumlu)

Gövde (yeni, isteğe bağlı): `{ method?: 'credit' | 'weekly_free' }` — yoksa `credit` (eski mobil uygulama gövdesiz gönderir).

1. Giriş + saatlik 30 sınırı (mevcut).
2. Maç bağlamı (Sportmonks, mevcut; geçici hata → 503, kredi yok).
3. Kullanıcının erişimi varsa → tam analiz, ücret yok (`cached: true`).
4. **Analiz hazırsa** (DB'de var):
   - premium / ADMIN → unlock (`PREMIUM`/`ADMIN`, 0 tutarlı defter satırı) → tam analiz.
   - `weekly_free` → tek işlemde: haftalık hak talebi (`ANALYSIS_WEEKLY_FREE`, tutar 0, anahtar `weekly-free:{ISO hafta TSİ}`,
     kullanıcı başına tekil) + unlock. Hak kullanılmışsa 409 `WEEKLY_FREE_USED`.
   - `credit` → **tek işlemde** (AI çağrısı yok): koşullu düşüm (`credits >= 1`) + defter `ANALYSIS_SPEND` −1 `SETTLED`
     (anahtar `analysis:{matchId}:PRE`) + unlock. Yetersiz → 402. Çift tık → tekil anahtar/unlock → tek düşüm.
5. **Analiz yoksa** (üretim): maç PRE olmalı (değilse 409). Haftalık ücretsiz **kullanılamaz** (karar 7) → 409 `WEEKLY_FREE_NOT_READY`.
   - premium / ADMIN → ücretsiz üretim.
   - `credit` → mevcut güvenli akış: `reserveCredits(1)` PENDING → AI → kayıt → unlock + `settle`; hata → aynı istekte iade;
     10 dk'dan eski PENDING iadesi (cron + sonraki istek) aynen.
   - Yarış: iki kullanıcı aynı anda üretirse ikisi de 1 kredi öder ve ikisi de açar; kayıt yarışını kaybedenin AI çıktısı atılır
     (öneri: iade YOK — kullanıcı aynı fiyata erişimi aldı; karar §11-6).

**Tekrar anahtarı uyumu (karar 2):** `userId + analysis:{matchId}:PRE` aynen kalır. Eski 5 kredilik üretim satırları bu anahtarla
`SETTLED` → v2'de `DuplicateSpendError` = "zaten açılmış" (göç SQL'i bunlara unlock da yazar). İade edilen harcamada anahtar
`…:refunded:{id}` olduğu için yeniden açılabilir (mevcut davranış).

## 3. Okuma — `GET /api/matches/[id]/analysis` (oturuma duyarlı, `Cache-Control: private, no-store`)

| İstemci | Erişim var | Erişim yok, analiz var | Analiz yok |
|---|---|---|---|
| **Eski** (parametresiz; eski mobil) | 200 tam analiz (bugünkü şekil) | **404** (eski uygulama "Analiz et" düğmesini gösterir; POST 1 krediyle açar) | 404 |
| **Yeni** (`?v=2`; web, yeni mobil) | 200 `{ access: 'unlocked', analysis, predictionRecord, unlock }` | 200 `{ access: 'locked', preview, offer }` | 200 `{ access: 'none', offer }` |

- `preview = { summary, top: { outcome: 'HOME'|'DRAW'|'AWAY', pct } }` — `summary`: `fullReport.matchSummary`'nin ilk 1–2 cümlesi
  (≤ 240 karakter, bahis temizliğinden geçmiş); `top`: `matchPrediction`'daki en yüksek olasılık ("Ev sahibi kazanır %58").
- `offer = { cost: 1, balance, weeklyFreeAvailable, canGenerate, premium, signedIn }`.
- Web bugün `?optional=1` gönderiyor → `?v=2` ile değişir; `optional=1` eski davranışla kalır (geçiş için).
- Kimlik: `getRequestAuth` (web çerezi + mobil Bearer, mevcut).

**Önizleme sunucuda (SEO):** maç sayfası SSR'ı DB'den önizlemeyi okur (tek indeksli sorgu: `MatchAnalysis` matchId+PRE) ve HTML'e
koyar; kilitli bölüm HTML'de yalnız yer tutucu (`<section class="ai-analysis-locked">` başlıklar + kilit), içerik YOK.
Maliyet: CDN ıskasında +1 DB sorgusu (~10–30 ms). İstemci yine `GET ?v=2` ile kişisel durumu (açık mı) alır.

## 4. Şema ve migration (yazılacak, ÇALIŞTIRILMAYACAK)

### 4.1 Prisma

```prisma
model User {
  // …mevcut…
  credits        Int       @default(0)   // 5 → 0 (yalnız yeni kayıtlar; migration B)
  premiumUntil   DateTime?               // > now ⇒ premium
  referralCode   String?   @unique       // davet kodu (ilk istekte üretilir)
  referredById   String?                 // kayıtta ?ref= kodundan
}

model CreditTransaction {
  // …mevcut…
  actorId String?   // yönetici işlemlerinde işlemi yapan yönetici (denetim)
}

/// Kullanıcının açtığı analiz — erişimin tek kaydı. Kaynak: CREDIT | WEEKLY_FREE | PREMIUM | ADMIN | LEGACY
model AnalysisUnlock {
  id                  String   @id @default(cuid())
  userId              String
  user                User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  matchAnalysisId     String
  matchAnalysis       MatchAnalysis @relation(fields: [matchAnalysisId], references: [id], onDelete: Cascade)
  matchId             String
  source              String
  creditTransactionId String?  @unique
  createdAt           DateTime @default(now())
  @@unique([userId, matchAnalysisId])
  @@index([matchAnalysisId])
  @@index([userId, createdAt])
}

/// Premium değişikliklerinin denetim izi (yönetici elle / ileride ödeme)
model PremiumGrant {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  until     DateTime?          // null = kaldırıldı
  source    String             // ADMIN | PURCHASE
  actorId   String?
  note      String?
  createdAt DateTime @default(now())
  @@index([userId, createdAt])
}

/// Davet: ödül, davet edilenin İLK SATIN ALIMINDA (ödeme entegrasyonunda bağlanacak)
model Referral {
  id         String    @id @default(cuid())
  referrerId String
  refereeId  String    @unique
  createdAt  DateTime  @default(now())
  rewardedAt DateTime?
  @@index([referrerId, createdAt])
}
```

Yeni defter türleri: `ANALYSIS_WEEKLY_FREE` (0), `ANALYSIS_PREMIUM` (0; eski `ANALYSIS_FREE` okunmaya devam eder), `REFERRAL_BONUS`.
Açma `ANALYSIS_SPEND` (−1) olarak kalır (geçmiş ve "AI Analizlerim" uyumu).

### 4.2 Migration A — ekleme (deploy ÖNCESİ)

`prisma/migrations/2026100XXXXXXX_credit_model_v2/migration.sql` (Prisma'nın `migrate diff` çıktısı + elle eklenen göç):

```sql
ALTER TABLE "User" ADD COLUMN "premiumUntil" TIMESTAMP(3),
  ADD COLUMN "referralCode" TEXT, ADD COLUMN "referredById" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
ALTER TABLE "CreditTransaction" ADD COLUMN "actorId" TEXT;

CREATE TABLE "AnalysisUnlock" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "matchAnalysisId" TEXT NOT NULL, "matchId" TEXT NOT NULL,
  "source" TEXT NOT NULL, "creditTransactionId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalysisUnlock_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AnalysisUnlock_creditTransactionId_key" ON "AnalysisUnlock"("creditTransactionId");
CREATE UNIQUE INDEX "AnalysisUnlock_userId_matchAnalysisId_key" ON "AnalysisUnlock"("userId", "matchAnalysisId");
CREATE INDEX "AnalysisUnlock_matchAnalysisId_idx" ON "AnalysisUnlock"("matchAnalysisId");
CREATE INDEX "AnalysisUnlock_userId_createdAt_idx" ON "AnalysisUnlock"("userId", "createdAt");
ALTER TABLE "AnalysisUnlock" ADD CONSTRAINT "AnalysisUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AnalysisUnlock" ADD CONSTRAINT "AnalysisUnlock_matchAnalysisId_fkey" FOREIGN KEY ("matchAnalysisId") REFERENCES "MatchAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PremiumGrant" ( … ); CREATE TABLE "Referral" ( … );   -- Prisma çıktısı, aynı desen

-- Karar 9: daha önce üretilmiş/açılmış analizler üreten kullanıcıya açık (iade edilenler hariç)
INSERT INTO "AnalysisUnlock" ("id", "userId", "matchAnalysisId", "matchId", "source", "creditTransactionId", "createdAt")
SELECT DISTINCT ON (t."userId", a."id")
       'legacy_' || t."id", t."userId", a."id", a."matchId", 'LEGACY', t."id", t."createdAt"
FROM "CreditTransaction" t
JOIN "MatchAnalysis" a ON a."matchId" = t."matchId" AND a."matchStatus" = 'PRE'
WHERE t."type" IN ('ANALYSIS_SPEND', 'ANALYSIS_FREE')
  AND (t."status" IS NULL OR t."status" <> 'REFUNDED')
ORDER BY t."userId", a."id", t."createdAt";
```

Bakiyeler değişmez (karar 9): hiçbir `UPDATE "User" SET credits` yok.

### 4.3 Migration B — yeni kayıt varsayılanı (deploy SONRASI)

```sql
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 0;
```

Neden ayrı: A önce, kod sonra gelir. Varsayılan A'da değişseydi, A ile deploy arasındaki eski kod Google kayıtlarına 0 kredi ve
"bonus verildi" kaydı yazardı → kullanıcı 2 krediyi hiç alamazdı. Yeni kod zaten açıkça `credits: 0` yazar ve OAuth kaydında
bakiyeyi 0'a çekip 2'yi ekler; B yalnız varsayılanı hizalar.

### 4.4 Supabase SQL Editor ile uygulama (sen)

1. Salt okunur ön kontrol:
   ```sql
   SELECT count(*) FROM "User" WHERE credits < 0;                          -- 0
   SELECT count(*) FROM "CreditTransaction" WHERE "matchId" IS NOT NULL
     AND type IN ('ANALYSIS_SPEND','ANALYSIS_FREE')
     AND (status IS NULL OR status <> 'REFUNDED');                           -- göçte yazılacak en fazla satır
   ```
2. Migration A'yı `BEGIN; … COMMIT;` içinde çalıştır; doğrula: `SELECT source, count(*) FROM "AnalysisUnlock" GROUP BY 1;`
3. `npx dotenv -e .env.local -- npx prisma migrate resolve --applied <A adı>` (ya da dokümandaki checksum'lı INSERT) → `migrate status`.
4. Kodu push et (deploy).
5. Migration B'yi aynı yolla uygula + `resolve --applied <B adı>`.
6. Geri alma SQL'i (DROP TABLE / DROP COLUMN / varsayılan 5) ayrı dosyada verilecek.

## 5. Kayıt bonusu, haftalık ücretsiz, davet

- **Kayıt bonusu (2):** `grantVerifiedSignupBonus(userId)` — e-posta doğrulama (`consumeEmailVerificationToken`), Google ilk kaydı
  (`onOAuthUserCreated`) ve Google'la mevcut hesabı bağlama (`oauth.ts` doğrulanmamış hesabı doğrulanmış yapıyor) çağırır.
  Atomik ve bir kez: kullanıcı satırı kilitli; **tutarı > 0 olan** `SIGNUP_BONUS` varsa hiçbir şey yapmaz (eski kullanıcılar 5'ini
  almıştı → ek bonus yok). Şifreli kayıt `credits: 0` ile oluşturulur; kayıtta artık bonus yazılmaz.
- **Haftalık ücretsiz açma:** hafta = TSİ Pazartesi 00:00 – Pazar 23:59 (ISO hafta). Yalnız hazır analiz. Koşul (öneri, §11-2):
  e-posta doğrulanmış + hesap ≥ 24 saatlik. Kullanıcı seçer ("Bu haftaki ücretsiz hakkını kullan" / "1 krediyle aç").
- **Davet altyapısı:** `referralCode` (8 karakter, ilk istekte üretilir), kayıtta `?ref=` (UTM ile aynı oturum deposu) →
  `Referral` satırı. `grantReferralRewardOnFirstPurchase(refereeId)` yazılır ve testlenir (iki tarafa +2, tekrar anahtarları
  `referral:{refereeId}:referrer|referee`) ama **hiçbir yerden çağrılmaz** — ödeme entegrasyonunda ilk başarılı satın almaya
  bağlanacak. Kendine davet ve aylık tavan (ör. davet eden başına 20) fonksiyonda.

## 6. Arayüz (web)

- **Maç sayfası, AI sekmesi:**
  - Önizleme kartı: kısa özet + "Ev sahibi kazanır %58" çubuğu (sunucuda, herkese).
  - Kilitli bölümler: olasılık senaryoları, skor tahmini, takım analizleri, eksik oyuncu yorumu, analist yorumu — başlıkları
    görünür, içerik bulanık yer tutucu (sahte metin DEĞİL; CSS iskeleti), kilit simgesi.
  - Düğmeler: "1 krediyle aç" (bakiye gösterilir) · haftalık hak varsa "Bu haftaki ücretsiz açma" · girişsiz "Giriş yap" ·
    bakiye 0 → "Kredi al" (/credits). Premium: "Premium ile aç" (tek tık, ücretsiz). Analiz yoksa: "1 krediyle üret"
    (haftalık hak burada gösterilmez).
  - Açıldıktan sonra bugünkü tam görünüm.
- **/credits:** 3 paket (fiyat, kredi başı fiyat, "En popüler" rozeti 30'da), premium kartı (aylık 99,99 / yıllık 799,99, "4 ay
  bedava"), hepsi "Yakında"; "1 kredi = 1 analiz", haftalık hak, kayıt bonusu açıklaması; "krediler süresiz". Fiyatlar
  `src/config/creditPackages.ts` + `src/config/premiumPlans.ts` (TL, KDV dahil, kuruş tamsayı).
- **Premium rozeti:** header kredi çipi yerine "PREMIUM" (premiumUntil > now), profilde bitiş tarihi; reklamlar gizli
  (`useAdsVisible` premium'a bağlı, mevcut). Oturuma `premiumUntil` eklenir (JWT 60 sn tazeleme, mevcut).
- **Profil "AI Analizlerim":** `AnalysisUnlock`'tan (kaynağıyla); kredi geçmişinde yeni tür etiketleri.
- **/ai-istatistikleri:** bekleyen maçların tahmini listeden çıkar (yalnız sayı).
- **Yönetici paneli `/admin/kullanicilar`** (yalnız ADMIN, SSR'da kontrol):
  - arama (e-posta / kullanıcı adı), kullanıcı kartı: bakiye, premium bitişi, doğrulama, kayıt tarihi, açılan analiz sayısı;
  - kredi ekle/çıkar: tutar + **zorunlu gerekçe** (≥ 5 karakter) + onay; atomik (`addCredits`, eksiye inemez), defterde
    `actorId`;
  - premium: +1 ay / +1 yıl / tarih seç / kaldır + not → `PremiumGrant` denetim satırı;
  - kredi hareketleri tablosu (sayfalı) ve premium geçmişi.
  - API: `GET /api/admin/users?q=`, `GET /api/admin/users/[id]`, `POST /api/admin/users/[id]/credits`,
    `POST /api/admin/users/[id]/premium` (requireAdmin; mevcut `grant-credits` aynı fonksiyona yönlenir).

## 7. Mobil uygulamaya etkisi

- Eski uygulama (1.0.0) `GET /analysis` (parametresiz) ve gövdesiz `POST` kullanıyor; istemcide `ANALYSIS_COST = 5`.
- v2'de eski uygulama **bozulmaz:**
  - erişimi olan kullanıcı tam analizi bugünkü şekliyle alır;
  - erişimi yoksa 404 → uygulama bugünkü "Analiz et (5 kredi)" düğmesini gösterir → POST sunucuda 1 kredi düşer ve tam analiz
    döner (cevap şekli aynı; ek alanlar yok sayılır);
  - 402 / 409 kodları aynı.
- Bilinen kısıt: eski uygulama bakiyesi 5'in altındaysa düğmeyi kendi kapatıyor (istemci kontrolü) → 1–4 kredili kullanıcı eski
  uygulamada açamaz. Önizleme ve haftalık hak eski uygulamada yok. Yeni sürümde `?v=2` + gövde `{ method }`.
- `/api/mobile/auth/me` cevabına `premiumUntil` eklenir (ek alan, kırmaz).

## 8. Suistimal riskleri ve önlemler

| Risk | Etki | Önlem |
|---|---|---|
| Çoklu hesapla kayıt bonusu | Hesap başına 2 kredi → 2 yeni üretim (~2,4 TL AI maliyeti) | Yalnız doğrulanmış e-posta; tek kullanımlık e-posta alan adı engeli (liste); kayıt IP hız sınırı (saatte 3); Google hesapları doğrulanmış |
| Çoklu hesapla haftalık ücretsiz | Gelir kaybı, maliyet ~0 (yalnız hazır analiz) | Doğrulanmış e-posta + hesap ≥ 24 sa; kullanıcı başına haftada 1 (tekil anahtar); IP başına haftalık tavan (ör. 5) — Redis, fail-open |
| Davet çiftliği | Sahte hesaplarla ödül | Ödül yalnız davet edilenin **ödemesiyle**; davet edilen başına bir kez (`refereeId` tekil); kendine davet engeli; davet eden başına aylık tavan; ödeme tarafında kart/IP eşleşmesi kontrolü |
| Çift tık / yarış | Çift düşüm | Tek işlemli düşüm + tekil unlock + tekrar anahtarı (mevcut altyapı) |
| Önizleme API'siyle tam içerik çekme | Kilit delinir | Kilitli içerik hiçbir yanıtta yok; `GET ?v=2` yalnız `preview`; SSR HTML'de yer tutucu |
| `/ai-istatistikleri` | Skor tahmini sızıntısı | Bekleyen tahminler gizlenir (§0) |
| Yönetici yetkisi kötüye kullanımı | Kayıt dışı kredi | Her işlem `actorId` + zorunlu gerekçe; premium değişiklikleri `PremiumGrant`'ta |
| Hesap paylaşımı (premium) | Gelir kaybı | Şimdilik kabul; ileride oturum sayısı sınırı |

## 9. Test planı

Sahte DB (`fakeCreditDb.testutil.ts`) `AnalysisUnlock` ve yeni alanlarla genişletilir; gerçek DB'ye bağlanan test yok.
- **Açma:** hazır analiz 1 kredi (bakiye −1, defter SETTLED, unlock); ikinci açma ücretsiz; çift tık / iki sekme tek düşüm;
  yetersiz 402; eski 5 kredilik üretim satırı olan kullanıcı → zaten açık.
- **Üretim:** 1 kredi; AI hatasında iade; iki kullanıcı yarışı (ikisi de açık, iade yok); maç başlamışsa 409; 10 dk PENDING iadesi.
- **Haftalık:** haftada bir; yalnız hazır analiz; yeni hafta yeniden; doğrulanmamış / 24 sa'ten yeni hesap reddi; eşzamanlı iki
  talep → biri.
- **Premium / ADMIN:** ücretsiz açma + unlock; süresi biten premium artık ücretsiz açamaz ama açtıkları açık.
- **Okuma:** eski istemci (parametresiz) erişimsiz 404, erişimli tam; `?v=2` locked/unlocked/none şekilleri; kilitli yanıtta tam
  alanların HİÇ olmadığı (anahtar düzeyinde) testi; `Cache-Control: private, no-store`.
- **Bonus:** şifreli kayıt 0 → doğrulama 2 (bir kez); Google 2; Google'la bağlama; eski kullanıcı (5 almış) doğrulasa ek yok.
- **Davet:** fonksiyon testleri (bir kez, kendine yok, tavan) — çağrılmadığı da test.
- **Yönetici:** ADMIN olmayana 403; gerekçesiz 400; atomik ± ve eksiye inmeme; premium ver/kaldır ve denetim satırı.
- **SEO:** SSR HTML'de önizleme var, kilitli metin yok; JSON-LD `isAccessibleForFree: false` + `hasPart.cssSelector` sayfadaki
  öğeyle eşleşiyor.
- **Karar 8 koruması:** kredi modülü `predictionRecords` / değerlendirme kodundan import edilmiyor; sonuçla ilişkili defter türü yok.
- **Göç SQL'i:** `prisma migrate diff` ile şema uyumu; geri doldurma sorgusunun mantığı sahte veride (birim) — gerçek Postgres
  üzerinde çalıştırma yok (öneri §11-8: PGlite ile yerel doğrulama).
- **Lighthouse (CLAUDE.md):** maç sayfası AI kartı ve SSR önizleme sayfa yükünü etkiler → yerelde 3 koşu medyan (maç sayfası),
  deploy sonrası canlı mobil 3 koşu. /credits ve yönetici sayfası ölçülmez (ilk görünüm değil / iç sayfa).

## 10. SEO etkisi

- **Bugün:** analiz metni HTML'de yok ama Googlebot JS çalıştırınca `GET /analysis` ile tam analizi görüp dizinleyebiliyor.
- **v2:** önizleme (özet + ana olasılık) sunucu HTML'inde → JS'siz de dizinlenir; kilitli bölümler kimseye gönderilmez. Googlebot
  kullanıcıyla AYNI içeriği görür → cloaking değil.
- **Yapılandırılmış veri:** maç sayfasına `SportsEvent`'in yanında ikinci bir JSON-LD:
  `{"@type": "Article", "headline": "<Ev> – <Deplasman> AI maç analizi", "isAccessibleForFree": false,
  "hasPart": {"@type": "WebPageElement", "isAccessibleForFree": false, "cssSelector": ".ai-analysis-locked"}}`.
  Google'ın abonelik/ödeme duvarı işaretlemesi; `cssSelector` HTML'deki kilitli bölümün sınıfıyla birebir olmalı (test edilir).
  Esnek örnekleme (Googlebot'a tam içerik) yapılmaz — gerek yok, risk yok.
- **Beklenen etki:** dizinlenen analiz metni azalır (yalnız önizleme), maç sayfalarının ana içeriği (skor, olaylar, puan durumu)
  aynı. Önizleme her maçta benzersiz kısa metin ekler.
- `/ai-istatistikleri`'nde bekleyen tahminlerin kalkması o sayfanın metnini biraz azaltır.

## 11. Onay bekleyen kararlar

1. **Maç bitince analiz herkese açılsın mı?** Öneri: evet (bitmiş maçta değer "tahmin" değil "şeffaflık"; isabet takibiyle güven
   ve SEO). Hayır ise bitmiş maçta da 1 kredi.
2. **Haftalık ücretsiz koşulu:** doğrulanmış e-posta + hesap ≥ 24 sa (öneri). Kullanıcı mı seçsin (öneri) yoksa otomatik mi?
3. **Premium bitince** premium döneminde açılanlar açık kalsın mı? Öneri: evet.
4. **Eski mobil uygulama** yayında mı? 1–4 kredili kullanıcı eski sürümde açamaz (istemci 5 kredi kontrolü) — kabul mü?
5. **SSR önizleme** (maç sayfası SSR'ında +1 DB sorgusu) — onay?
6. **Üretim yarışı:** kaybeden 1 kredi öder ve açar, iade yok (öneri) — onay?
7. **Tek kullanımlık e-posta engeli:** sabit liste (ör. ~3.000 alan adı, repo içinde) — onay?
8. **Göç SQL doğrulaması:** dev bağımlılığı olarak PGlite (gömülü Postgres) ekleyip migration A'yı testte gerçek SQL motorunda
   çalıştırmak — onay? (Hayır ise yalnız mantık testi + senin SQL Editor ön kontrolün.)
9. Yönetici panelinde **yeni ADMIN atama** yok (yalnız DB'de) — onay?

## 12. İş sırası ve tahmini süre (her adım ayrı commit, testli, push yok)

1. Şema + migration A/B + geri alma SQL'i + uygulama dokümanı (0,5 g)
2. `analysisAccess` + açma/üretim akışı + GET v2 + eski istemci uyumu (1 g)
3. Bonus (doğrulama), haftalık ücretsiz, suistimal önlemleri (0,5 g)
4. Premium alanı, oturum, reklam, rozet (0,25 g)
5. Web arayüzü: önizleme kartı, kilit, düğmeler, SSR önizleme + JSON-LD (1 g)
6. /credits fiyatları ve premium kartı (0,25 g)
7. Yönetici paneli + API'ler (0,75 g)
8. Davet altyapısı (bağlanmamış) (0,25 g)
9. /ai-istatistikleri sızıntısı (0,1 g)
10. Ölçüm (maç sayfası 3 koşu), tam test, rapor (0,25 g)

Toplam ≈ **5 gün**. Push: migration A üretimde uygulanmadan kod gidemez.

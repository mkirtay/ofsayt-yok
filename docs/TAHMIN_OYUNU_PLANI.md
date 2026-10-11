# Tahmin Oyunu — Plan (kod yok)

> Durum: **MVP UYGULANIYOR** (2026-10-11, dal `feat/prediction-game`). Kararlar §14'te işaretli. Ürün adı kesinleşmedi: yön **90+** (`90arti.app`); belgede ve kodda
> geçici ad **`{{game}}`** ile anılır. "Tahmin Ligi" yalnız yapılandırmadaki geçici değer olacak, hiçbir yere gömülmez.

Örnek ürün: ScoreHunter (scorehunter.app) — ücretsiz, bahis değil, haftalık maç listesi, skor tahmini, sıralama.
Bizim varsayılanlarımız: **skor tahmini · haftada 5 seçilmiş maç · Google ile giriş · ödül yok**.

---

## 0. Kısa özet

- Yeni, **eklemeli** 4 tablo (hafta, haftanın maçı, tahmin, kullanıcı×hafta özeti). Mevcut `UserPrediction` (1X2 anketi)
  **değişmez**, ayrı kalır.
- Kilit tamamen sunucuda: tahmin yazımı tek bir koşullu SQL (`WHERE kickoffAt > now()`) ile; istemci saati hiç okunmaz.
- **Yeni Sportmonks istek türü yok.** Maç listesi ve sonuçlar, ana sayfanın zaten paylaşımlı cache'te tuttuğu
  `fixtures/date/{d}` listelerinden okunur; maç meta verisi Gündem'in `MatchSnapshot` tablosundan.
  Tek yedek yol: sonuç gecikirse maç başına `fixtures/{id}` (mevcut `resolveSportmonksMatch`, haftada en çok 5 istek).
- Sonuç hesabı yeni bir cron'da (`cronJobs.ts` kalıbı), maç yoksa upstream'e sıfır istek atar.
- Sıralama SQL'i ve takma ad kuralları Frikik skor tablosundan kopyalanır (aynı test yöntemi: PGlite).
- MVP ≈ admin hafta oluşturucu + tahmin sayfası + puanlama + haftalık/sezonluk sıralama + landing. Bildirim, özel lig,
  Gündem paylaşımı, AI rakip sonraki fazlarda.

---

## 1. Mevcut yapı taşları — inceleme ve yeniden kullanım raporu

| Yapı taşı | Ne yapıyor | Oyunda kullanım | Karar |
|---|---|---|---|
| `UserPrediction` (schema.prisma:270) | Kullanıcı×maç tek 1X2 oyu (`HOME/DRAW/AWAY`), `@@unique([matchId,userId])` | Skor tahmini, joker, puan, hafta alanı yok; şemayı genişletmek anketi ve oyunu birbirine bağlar | **Yeniden kullanma, ayrı tablo.** İsteğe bağlı: oyunda tahmin girilince 1X2 karşılığı ankete de yazılsın mı → Karar K12 |
| `pages/api/matches/[id]/poll.ts` | GET dağılım + kendi oy; POST upsert | Kalıp (groupBy dağılım, `getRequestUserId`, `hitFixedWindowRateLimit`) örnek alınır | **Bulgu:** POST'ta **maç başlama kilidi yok** — maç başladıktan, hatta bittikten sonra da oy kabul ediliyor/değiştiriliyor. Hız sınırı yalnız IP'ye göre (kullanıcı başına yok). Oyundan bağımsız düzeltilmeli (ayrı iş) |
| `MatchPoll` bileşeni | Maç sayfasında forum sekmesinde 1X2 anketi | Oyundaki bir maçsa altına "Bu maç haftanın listesinde → tahminini yap" CTA'sı | Faz 2'de CTA; bileşen aynen kalır |
| `MatchAnalysis` | AI analiz cache'i (`PRE/HT/POST`), `scorePrediction.mostLikely` | "Yapay zekâ ne demişti?" — **yalnız başlama saatinden sonra** gösterilir (analiz ücretli/kredili içerik; önceden göstermek açma satışını boşa çıkarır) | Faz 2 "AI rakip" |
| `PredictionRecord` + `predictionRecords.ts` | PRE analizinin tahminini saklar; `evaluatePendingPredictionRecords` biten maçı `resolveSportmonksMatch` (`fixtures/{id}`) ile çözüp isabet yazar; `UNRESOLVED` + 3 gün kuralı | (a) AI'nın skor tahmini sanal oyuncu "AI" olarak sıralamaya girer. (b) Değerlendirme yardımcıları (`parseScoreGoals`, `isMatchFinished`, `extractFinalScore`, `shouldMarkUnresolved` mantığı) oyunda da lazım | Yardımcılar şu an dosya içi özel → **ortak modüle çıkar** (`lib/matchResult.ts`), iki taraf da oradan kullanır; davranış değişmez, mevcut testler korunur |
| `evaluate-predictions` cron (`vercel.json` `0 3 * * *` + harici) | `acquireCronLock` → `recordCronTick` → `runInBackground(runCronJob(...))`, 202/409 | Günde bir kez (03:00) oyun için çok geç: kullanıcı sonucu maç gecesi görmek ister | **Kalıbı kopyala, ayrı iş** `game-settle` (bkz. §5). Mevcut cron'a eklenmez; istersek gece 03:00 koşusu "kaçanları topla" yedeği olarak `settle` çağırabilir |
| `MatchSnapshot` (Gündem) | Fixture'ın takım adları/logoları/`startingAt`'i; 6 sa'te bir ve başlama +3 sa'e kadar yenileme (erteleme yakalama) | Haftanın maçlarının **tek doğruluk kaynağı** (adlar, logolar, başlama saati) | **Aynen kullan.** Haftaya maç eklerken `matchSnapshot.ts` ile snapshot alınır (maç başına bir kez `fixtures/{id}` — Gündem zaten yapıyor) |
| `server/homeDay.ts` / `getFixturesByDate` | TR gününün maçları; üç UTC listesi paylaşımlı cache'te | Admin maç seçici + sonuç okuma + "maç başladı mı" ikinci kontrol | **Aynen kullan** — yeni anahtar yok |
| Frikik (`lib/frikik/daily.ts`, `leaderboard.ts`, `nickname.ts`, `server/frikik/leaderboardService.ts`) | TR günü (sabit +3), sıralama SQL'i (`DISTINCT ON`), PGlite ile gerçek-SQL testi, takma ad = `User.username` + uygunsuz içerik filtresi, `NICKNAME_REQUIRED` | Haftalık/sezonluk sıralama SQL'i, takma ad kapısı, TR haftası hesabı | **Kalıp + kod yeniden kullanımı.** `turkeyDay` → `turkeyIsoWeek` ekle; nickname kapısı aynen |
| `FrikikDailyCard` | Ana sayfa kartı, sabit yükseklik (kayma yok), sim ilk yüke girmesin diye ayrı modül | Ana sayfa "Haftanın tahminleri" kartı aynı kurallarla | Faz 2; Lighthouse ölçümü gerekir |
| `Notification` + `lib/gundem/notify.ts` | Zil bildirimi; `createNotification` **aktör ister** ve kendine bildirimi atlar | Hafta açıldı / hatırlatma / sonuç bildirimleri | Tür listesine `GAME_*` ekle; aktörsüz "sistem" yazımı için küçük bir `createSystemNotification` gerekir |
| `PushToken` + `/api/push/register` | Token **yalnız kaydediliyor**; gönderim altyapısı "Faz B", yok | Mobil push hatırlatma | Push sonraya (Faz 3); MVP'de zil + (onaylanırsa) e-posta |
| `security.ts` (Turnstile, e-posta doğrulama), `emailNormalized` | Kayıtta bot ve ikinci hesap engeli | Çoklu hesap/bot önleme zaten kayıtta var | Aynen; oyuna ek CAPTCHA yok |
| `oauth.ts` / `auth-options.ts` | Google + e-posta/şifre; `getRequestUserId` mobil belirteci de tanır | "Google ile giriş" hazır | Aynen. Oyun e-posta/şifre hesaplarını da kabul eder (Karar K6) |
| `rateLimit.ts` | `hitFixedWindowRateLimit` (Upstash, fail-open) | Tahmin kaydetme: kullanıcı + IP sınırı | Aynen |
| `config/brand.ts` + `legacyBrand.guard.test.ts` | Marka tek kaynağı, `{{brand}}` çeviri değişkeni, eski marka yazımını yasaklayan koruma testi | Oyun adı için aynı düzen | §2 |
| `turkeyTeamTiers.ts` | Türk takımlarının seviye sınıfı | Admin maç seçiciye "büyük maç" önerisi | Faz 1 sonu / Faz 2 |
| `Post` (`OFFICIAL_BOT`, `matchId`), `GundemBotDraft` | Resmi bot postu, onay kuyruğu | "Haftanın en iyileri" postu, kullanıcının tahminini paylaşması | Faz 3 |
| `server/og` + `imageResponse.ts` | Paylaşım görselleri (nft tuzağı çözülmüş) | "Bu hafta 34 puan" paylaşım kartı | Faz 2 |

### Ayrı iş olarak düzeltilmesi önerilen
- `poll.ts` POST: başlama saatinden sonra oy kabul edilmesin; kullanıcı başına hız sınırı. (Oyun bunu beklemez ama oyun
  "kilit" vaat ederken anketin kilitsiz olması tutarsız görünür.)

---

## 2. Marka / ad yapılandırması

`src/config/brand.ts` içine ayrı bir alt nesne (marka geçişi düzenine uygun, bağımlılıksız):

```ts
export const GAME_BRAND = {
  /** Görünen ad. Geçici değer; karar: 90+ (K1). */
  name: 'Tahmin Ligi',
  /** Dar alan (alt menü, rozet). */
  shortName: 'Tahmin',
  /** Boşluksuz teknik ad (OG dosya adı, analytics etiketi). "90+" için "90arti". */
  compactName: 'TahminLigi',
  /** Ayrı alan adı varsa (ör. https://90arti.app); yoksa null → site içi yol kullanılır. */
  siteUrl: null as string | null,
  /** Site içi kök yol — markadan bağımsız sabit (ad değişince URL değişmesin). */
  basePath: '/tahmin',
  tagline: { tr: 'Ücretsiz skor tahmin oyunu · Bahis değil', en: 'Free score prediction game · Not betting' },
} as const;
```

- `BRAND_I18N_VARS`'a `game: GAME_BRAND.name` eklenir → çevirilerde `{{game}}`.
- **URL, API yolu, tablo ve dosya adları markadan bağımsız:** `/tahmin`, `/api/game/*`, `Game*` modelleri. Ad değişince
  yalnız bu nesne değişir.
- Koruma testi: `legacyBrand.guard.test.ts` benzeri `gameBrand.guard.test.ts` — geçici ad ("Tahmin Ligi") ve kesinleşince
  "90+" düz metni `brand.ts` dışında geçmesin.
- **"90+" tuzakları:** `+` URL'de boşluk olur (slug/hashtag'de kullanma → `90arti`), XML/OG metninde sorun yok, arama
  motorunda "90+" tek başına zayıf anahtar → başlıkta "90+ · Ücretsiz skor tahmin oyunu".
- Ayrı alan adı (`90arti.app`) seçilirse: aynı Next uygulamasında host'a göre yönlendirme (middleware) + canonical
  `GAME_BRAND.siteUrl`; Google OAuth'a ikinci origin/callback, NextAuth host ayarı (bkz. hafıza: preview callback
  uyumsuzluğu), çerez alanı. **MVP site içi yolda**; alan adı Faz 4 (K2).

---

## 3. Oyun kuralları

### 3.1 Hafta ve sezon
- **Hafta anahtarı:** TR saatine göre ISO hafta, `"2026-W42"`. Sınır: **Pazartesi 00:00 TSİ → Pazar 23:59 TSİ**
  (K4 — ONAYLANDI). Kilit maç başına, başlama saatinde.
- Tüm zamanlar DB'de UTC; Europe/Istanbul yalnız hafta sınırı ve gösterim için. Frikik'teki sabit +3 ofset yaklaşımı
  geçerli (TR 2016'dan beri yaz saati uygulamıyor); yine de tek yardımcıda tutulur.
- **Sezon:** `"2026-27"`, Ağustos–Mayıs. Oyun sezon ortasında açılırsa sezon tablosu ilk haftadan başlar (K5).

### 3.2 Haftanın maçları
- Haftada **5 maç** (sayı yapılandırılabilir, `GameWeek.matchCount`). Kaynak: planımızdaki ligler (`PLAN_SPORTMONKS_LEAGUE_IDS`).
- Seçim: admin panelinde, sistem öneri listesi sunar (TR büyük takımları, derbi, Avrupa üst maçları). Otomatik seçim
  sonraki faz (K3).
- Yayın sonrası maç eklemek/çıkarmak yalnız ilk maç başlamadan; sonra yalnız "iptal (VOID)".

### 3.3 Tahmin
- Her maç için **ev–deplasman skoru** (0–15 arası tam sayı). Boş bırakılan maç 0 puan.
- Maç başına bağımsız kilit: tahmin o maçın başlama saatine kadar değiştirilebilir (tüm hafta tek seferde kilitlenmez).
- **Skor = normal süre** (90 + uzatma dakikaları); uzatma devreleri ve penaltılar sayılmaz. Kural sayfasında açıkça
  yazılır. Eleme maçlarında Sportmonks skorunun 90' karşılığı doğrulanmalı (Risk R6) — MVP'de eleme maçı seçmekten
  kaçınılabilir.

### 3.4 Puanlama (öneri — K7)

Kriterler ScoreHunter'daki 6 kritere benzer, tek bir saf fonksiyonda (`lib/game/scoring.ts`), birim testli:

| Kriter | Koşul | Puan |
|---|---|---|
| Doğru yön | 1 / X / 2 doğru (beraberlik dahil) | **3** |
| Gol farkı | Yön doğru **ve** fark doğru (ör. 2-1 ↔ 3-2; beraberlikte her beraberlik) | **+1** |
| Toplam gol | Toplam gol doğru (yönden bağımsız) | **+1** |
| Tam skor | Skor birebir | **+3** |
| Nadir skor | Tam skor **ve** o skoru tahmin edenlerin payı ≤ %5 (en az 30 tahmin varsa) | **+2** |
| Joker (2X) | Haftada 1 maç; o maçın toplamı ×2 | ×2 |

- Maç başı en çok **10**, joker ile **20**; hafta en çok 5×10 + 10 = **60**.
- Beraberlikte "gol farkı" kriteri: tüm beraberliklerde fark 0 → beraberliği bilen 3+1. Bilinçli tercih (beraberlik zor).
- **Nadir skor payı** başlama anında dondurulur (kilitten sonra dağılım değişmez) ve yalnız e-postası doğrulanmış
  hesaplar sayılır (sahte hesapla pay oynanmasın).
- **Joker:** o maç başlamadan seçilir/değiştirilir; joker maçı başladıysa joker taşınamaz; başlamış maça joker konamaz.
  Joker maçı VOID olursa joker yanar (K8 — alternatif: kalan başlamamış maça taşınabilir).
- **Eşitlik bozma (sıralama):** toplam puan ↓, tam skor sayısı ↓, doğru yön sayısı ↓, son değişiklik zamanı ↑ (erken
  karar veren önde). K9.
- Puanlama kuralları sürümlü: `GameWeek.scoringVersion`. Kural değişirse eski haftalar eski kuralla kalır.

### 3.5 Ertelenen / iptal / yarıda kalan maç
- Başlama saati **hafta içinde ileri kayarsa**: tahminler açık kalır, kilit yeni saate göre (snapshot yenilemesi yakalar).
- Hafta dışına ertelenir, iptal olur ya da sonuç 3 gün içinde gelmezse: **VOID**, herkese 0, joker K8'e göre.
  (`predictionRecords.ts`'teki 3 günlük `UNRESOLVED` kuralının aynısı.)
- Admin elle VOID yapabilir; sonuç sonradan düzelirse "yeniden hesapla" (puanlama idempotent).

---

## 4. Veri modeli önerisi (Prisma, eklemeli)

Göç: yalnız yeni tablolar + enum'lar, mevcut tabloya dokunmayan tek adım (bkz. `docs/MIGRATION_STRATEJISI.md`).
`User`'a yalnız ilişki alanları ve (Faz 2) bildirim tercihi eklenir.

```prisma
enum GameWeekStatus { DRAFT PUBLISHED SETTLED }
enum GameMatchStatus { SCHEDULED FINISHED VOID }

/// Oyun haftası. `weekKey` TR ISO haftası ("2026-W42"); `season` "2026-27".
model GameWeek {
  id              String         @id @default(cuid())
  weekKey         String         @unique
  season          String
  status          GameWeekStatus @default(DRAFT)
  matchCount      Int            @default(5)
  scoringVersion  Int            @default(1)
  /// Hafta sınırları (UTC) — sorgu ve gösterim için önceden hesaplanır.
  startsAt        DateTime
  endsAt          DateTime
  publishedAt     DateTime?
  publishedById   String?
  settledAt       DateTime?
  createdAt       DateTime       @default(now())
  matches         GameMatch[]
  entries         GameWeekEntry[]

  @@index([season, startsAt])
}

/// Haftanın maçı. `fixtureId` = MatchSnapshot.fixtureId (Sportmonks, String). `kickoffAt` snapshot'tan kopyalanır ve
/// snapshot yenilenince güncellenir; KİLİT BU ALANA GÖRE.
model GameMatch {
  id            String          @id @default(cuid())
  weekId        String
  week          GameWeek        @relation(fields: [weekId], references: [id], onDelete: Cascade)
  fixtureId     String
  position      Int
  kickoffAt     DateTime
  status        GameMatchStatus @default(SCHEDULED)
  /// Normal süre skoru (sonuçlanınca).
  homeGoals     Int?
  awayGoals     Int?
  /// Nadir skor için başlama anında dondurulan dağılım: { "2-1": 140, "1-1": 90, ... , "_total": 820 }.
  distribution  Json?
  settledAt     DateTime?
  voidReason    String?
  predictions   GamePrediction[]

  @@unique([weekId, fixtureId])
  @@index([kickoffAt])
  @@index([status, kickoffAt])
}

/// Kullanıcının bir maça skor tahmini.
model GamePrediction {
  id           String    @id @default(cuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  gameMatchId  String
  gameMatch    GameMatch @relation(fields: [gameMatchId], references: [id], onDelete: Cascade)
  weekId       String    /// denormalize: haftalık sorgular tek tablo
  home         Int
  away         Int
  /// Kaç kez değiştirildi (kötüye kullanım sinyali / analytics).
  revisions    Int       @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  /// Sonuçlanınca: joker dahil puan ve kırılım { dir, diff, total, exact, rare, joker }.
  points       Int?
  breakdown    Json?

  @@unique([userId, gameMatchId])
  @@index([gameMatchId])
  @@index([weekId, userId])
}

/// Kullanıcı × hafta özeti: joker seçimi + sıralama alanları. Haftalık tablo bundan okunur; sezon tablosu bunun toplamı.
model GameWeekEntry {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  weekId            String
  week              GameWeek @relation(fields: [weekId], references: [id], onDelete: Cascade)
  season            String   /// denormalize
  jokerGameMatchId  String?
  totalPoints       Int      @default(0)
  exactCount        Int      @default(0)
  directionCount    Int      @default(0)
  lastChangeAt      DateTime @default(now())
  /// Sıralamadan gizli (admin; kötüye kullanım). Satır silinmez.
  hiddenAt          DateTime?
  createdAt         DateTime @default(now())

  @@unique([userId, weekId])
  @@index([weekId, totalPoints])
  @@index([season, userId])
}
```

Neden böyle:
- `GameWeekEntry` jokeri tek satırda tutar → "haftada tek joker" kısmi unique index'e gerek kalmaz.
- Sezon tablosu MVP'de canlı SQL toplamı (`SUM ... GROUP BY userId WHERE season = $1 AND hiddenAt IS NULL`) + kısa süreli
  cache. Kullanıcı sayısı büyürse `GameSeasonStanding` tablosuna (settle sırasında güncellenen) geçilir.
- `distribution` Json'u kilit anında yazılır: tahminleri başlamadan sonra herkese göstermek için de kullanılır.
- Sonraki fazlar (şimdi oluşturulmaz): `GameLeague { id, name, inviteCode @unique, ownerId, season }`,
  `GameLeagueMember { leagueId, userId, joinedAt, @@unique([leagueId,userId]) }`; `User.gameNotify Json?`.

---

## 5. Kilit, sonuç ve kota

### 5.1 Kickoff kilidi (sunucu)
- Tek doğruluk kaynağı `GameMatch.kickoffAt` (UTC) ve **veritabanının `now()`**'u; sunucu süreç saati bile değil.
- Yazım koşullu ve atomik:
  ```sql
  INSERT INTO "GamePrediction" (...) SELECT ... FROM "GameMatch" m
   WHERE m.id = $1 AND m.status = 'SCHEDULED' AND m."kickoffAt" > now()
  ON CONFLICT ("userId","gameMatchId") DO UPDATE SET home = $h, away = $a, revisions = "GamePrediction".revisions + 1
   WHERE EXISTS (SELECT 1 FROM "GameMatch" WHERE id = $1 AND "kickoffAt" > now());
  ```
  Etkilenen satır 0 ise `LOCKED`. Yarış (son saniye istekleri) DB'de çözülür.
- **İkinci savunma:** cache'teki gün listesinde maç durumu "NOT STARTED" değilse (erken başlama, saat hatası) yazım
  reddedilir. Bu okuma paylaşımlı cache'ten; yeni istek yok.
- Kilitten sonra: başkalarının dağılımı görünür; kilitten önce yalnız kendi tahmini.
- Joker değişikliği aynı kurala tabi: hem eski hem yeni joker maçı başlamamış olmalı.

### 5.2 Sonuç hesabı (`game-settle` işi)
- Uç: `POST/GET /api/admin/game/settle` — `CRON_SECRET` ile cron, admin oturumuyla elle. `acquireCronLock` /
  `recordCronTick` / `runCronJob` / `runInBackground` kalıbı aynen (`evaluate-predictions` ile birebir).
- Tetik: cron-job.org **10 dk** (Vercel Hobby cron'u günde bir). **Boşta koşu:** `kickoffAt + 105 dk < now()` ve
  `status = SCHEDULED` olan maç yoksa hiçbir dış istek atmadan döner.
- Adımlar:
  1. **Kilit anı işi:** başlamış ama `distribution` boş maçlar için dağılımı yaz (yalnız DB).
  2. Bitmiş olabilecek maçlar için sonucu **maçın TR gününün listesinden** oku (`loadHomeDay` / `getFixturesByDate` —
     ana sayfayla aynı cache anahtarları).
  3. Listede FT değilse ve başlama +4 sa geçtiyse yedek: `resolveSportmonksMatch(fixtureId)` (`fixtures/{id}`), maç
     başına en çok saatte bir (negatif cache zaten var).
  4. 3 gün sonuç yok → VOID.
  5. Puanla (saf fonksiyon), `GamePrediction.points/breakdown` + `GameWeekEntry` toplamlarını tek transaction'da yaz.
     İdempotent: aynı maç tekrar puanlanırsa sonuç aynı.
  6. Haftanın tüm maçları FINISHED/VOID → `GameWeek.SETTLED`, sıralama cache'ini sil, bildirim (Faz 2).

### 5.3 Kota özeti
| İş | Sportmonks isteği |
|---|---|
| Admin maç seçici | 0 yeni (upcoming-days / day uçları, paylaşımlı cache) |
| Haftaya maç ekleme | maç başına 1 `fixtures/{id}` → **haftada ~5** (MatchSnapshot; Gündem ile ortak, snapshot varsa 0) |
| Snapshot yenileme (erteleme) | mevcut kural: 6 sa'te bir, yalnız başlama +3 sa'e kadar → haftada ~5–20 |
| Tahmin sayfası / sıralama | 0 (yalnız DB) |
| Kilit ikinci kontrolü + sonuç okuma | 0 yeni (gün listesi cache'i) |
| Sonuç yedeği | yalnız gecikmede, haftada ≤ 5 |

Canlı skor oyun sayfasında **gösterilmez** (MVP); maç kartı maç sayfasına bağlanır. İleride gösterilecekse ana sayfanın
zaten çağırdığı `/api/matches/day` kullanılır, yeni polling ucu açılmaz.

**Redis:** Upstash 251/256 MB'a dayalı (hafıza). Sıralama cache'i küçük tutulur (ilk 50 satır, kısa TTL); kullanıcı
tahminleri Redis'e yazılmaz.

---

## 6. API listesi

Kök `/api/game/*` (markadan bağımsız). Yanıtlar kişiselse `private, no-store`; herkese açıksa CDN `s-maxage`.

| Yöntem | Yol | Erişim | Açıklama |
|---|---|---|---|
| GET | `/api/game/weeks/current` | herkese açık, CDN 60 sn | Yayındaki hafta + maçlar (snapshot adları/logoları, `kickoffAt`, durum, sonuç). Kişisel veri yok |
| GET | `/api/game/weeks/[weekKey]` | herkese açık | Geçmiş/gelecek hafta aynı şekil |
| GET | `/api/game/weeks/[weekKey]/me` | giriş | Benim tahminlerim, jokerim, puan kırılımı, haftalık sıram |
| PUT | `/api/game/weeks/[weekKey]/predictions` | giriş + takma ad | Toplu kayıt: `{ items: [{ gameMatchId, home, away }], jokerGameMatchId? }`. Kalem başına sonuç: `ok` / `LOCKED` / `INVALID`. 403 `NICKNAME_REQUIRED` (Frikik ile aynı kod). Hız: kullanıcı 20/dk, IP 60/dk |
| GET | `/api/game/matches/[gameMatchId]/distribution` | herkese açık, **yalnız kilit sonrası** | Skor dağılımı + 1/X/2 yüzdeleri; önce 403 |
| GET | `/api/game/leaderboard?scope=week&key=2026-W42` | herkese açık, CDN 60 sn | İlk 50 (takma ad, puan, tam skor sayısı) |
| GET | `/api/game/leaderboard?scope=season&key=2026-27` | herkese açık | Sezon toplamı |
| GET | `/api/game/leaderboard/me?scope=…&key=…` | giriş | Benim sıram + çevremdeki ±2 |
| GET | `/api/game/me/history` | giriş | Haftalarım (Faz 2) |
| GET | `/api/game/users/[username]` | herkese açık | Profil özeti (Faz 2; tahminler yalnız kilit sonrası) |
| POST | `/api/admin/game/weeks` | admin | Hafta taslağı oluştur |
| PUT | `/api/admin/game/weeks/[weekKey]/matches` | admin | Maç listesi (fixtureId[]) — snapshot alır |
| GET | `/api/admin/game/suggestions?weekKey=` | admin | Önerilen maçlar (cache'li gün listeleri + takım seviyesi) |
| POST | `/api/admin/game/weeks/[weekKey]/publish` | admin | Yayınla (Faz 2: bildirim tetikler) |
| POST | `/api/admin/game/matches/[id]/void` | admin | Elle iptal |
| POST | `/api/admin/game/matches/[id]/rescore` | admin | Sonucu düzelt + yeniden puanla |
| POST | `/api/admin/game/entries/[id]/hide` | admin | Sıralamadan gizle |
| GET/POST | `/api/admin/game/settle` | cron / admin | §5.2 |
| — | `/api/gundem/notifications` (mevcut) | giriş | `GAME_*` türleri eklenir (Faz 2) |
| POST | `/api/game/leagues`, `/api/game/leagues/join` | giriş | Özel lig (Faz 3) |

Mobil: tüm uçlar `getRequestUserId` üzerinden mobil belirteçle de çalışır (ek iş yok).

---

## 7. Sayfa / ekran listesi

| Sayfa | Yol | Not |
|---|---|---|
| Landing + aktif hafta | `/tahmin` | Girişsiz: landing (§9). Girişli: üstte haftanın tahmin formu, altta landing'in kısa hali. SSR/ISR, kişisel kısım istemcide |
| Hafta formu | `/tahmin` içinde | 5 maç kartı: logolar, TSİ saat, iki sayı girişi (+/– düğmeli, mobil öncelikli), joker yıldızı, "kilitlenmesine 2 sa 14 dk", kaydet. Taslak `localStorage`'da (gönderilmemiş girdi kaybolmasın) |
| Hafta sonucu | `/tahmin/hafta/[weekKey]` | Benim tahminim vs sonuç, kriter rozetleri, dağılım çubuğu, (Faz 2) AI'nın tahmini |
| Sıralama | `/tahmin/siralama` | Sekmeler: Bu hafta / Sezon (/ Lig — Faz 3). İlk 50 + "sen buradasın" satırı |
| Kurallar ve puanlama | `/tahmin/kurallar` | Puan tablosu, kilit, VOID, eşitlik bozma; SSS. SEO için ayrı sayfa |
| Takma ad seçimi | mevcut Frikik akışı | Takma ad yoksa aynı modal |
| Oyuncu profili | `/tahmin/oyuncu/[username]` | Faz 2; Gündem profiliyle bağ |
| Özel lig | `/tahmin/lig/[code]` | Faz 3 |
| Admin hafta oluşturucu | `/admin/tahmin` | Öneri listesi → 5 maç seç → sırala → yayınla; VOID / yeniden puanla; gizleme |
| Ana sayfa kartı | ana sayfa | Faz 2. `FrikikDailyCard` kuralları: sabit yükseklik, ağır kod ilk yüke girmez. **Lighthouse ölçümü gerekir** |
| Maç sayfası CTA | maç detayı (`MatchPoll` yanında) | Faz 2; maç haftanın listesindeyse |
| Alt menü / üst menü girişi | `BottomNav`, `Header` | MVP sonunda; `GAME_BRAND.shortName` |

i18n: yeni `game` ad alanı (tr + en), tüm metinlerde `{{game}}`. **Dil kuralı:** "bahis, kupon, oran, iddaa, kazanç,
yatır" sözcükleri kullanılmaz (kumar dili temizliği ile tutarlı); "tahmin, puan, sıralama, hafta, joker".

---

## 8. Kötüye kullanım önleme

Ödül yok → para teşviki yok; asıl risk sıralamada sahte hesap kalabalığı ve vitrin ünü.

- **Kilit atlatma:** §5.1 (DB saati, koşullu yazım, ikinci durum kontrolü). Testli: kilitten 1 sn önce/sonra, eşzamanlı
  iki istek, başlama saati geri çekilen maç.
- **Çoklu hesap:** kayıtta zaten Turnstile + `emailNormalized` + tek kullanımlık e-posta engeli. Ek: sıralamada
  görünmek için **e-posta doğrulanmış** olmak (Google hesapları zaten doğrulanmış) — doğrulanmamış hesap oynar ama tabloda
  görünmez (K6).
- **Nadir skor oynama:** pay yalnız doğrulanmış hesaplardan, en az 30 tahmin eşiği, dağılım kilitte dondurulur.
- **Kopyalama:** başkalarının tahmini kilitten önce hiçbir uçta dönmez (dağılım ucu 403).
- **Uygunsuz takma ad:** Frikik `nickname.ts` filtresi aynen.
- **Bot/scraper yükü:** herkese açık uçlar CDN cache'li; yazma uçlarında kullanıcı + IP hız sınırı.
- **Toplu tahmin otomasyonu:** zararı düşük; `revisions` ve `lastChangeAt` sinyali, admin "gizle".
- **Hesap silme:** `onDelete: Cascade` — silinen kullanıcının satırları gider, geçmiş sıralamalar yeniden hesaplanmaz
  (kabul edilebilir).
- **Hukuk/uyum:** ödülsüz ve ücretsiz olması, oyunu şans oyunu / çekiliş izin rejiminin dışında tutmanın temeli.
  **Kredi, premium gün veya hediye vermek "ödül" sayılabilir** (kredi satın alınabilen, parasal değeri olan bir varlık) →
  MVP'de hiçbir ödül yok; ileride ödül düşünülürse önce hukuki görüş (K10). Kullanım şartlarına oyun maddesi eklenir
  (bkz. `docs/YASAL_NOTLAR.md` avukat listesi).

---

## 9. Landing sayfası iskeleti (`/tahmin`)

ScoreHunter sırası (hero → 3 adım → ödüller → nasıl oynanır → özellikler → uygulama içi → sıralama → SSS → son CTA)
bizde ödül ve uygulama ekran görüntüsü bölümleri olmadan:

1. **Hero**
   - Başlık: `{{game}}` — "Skoru tahmin et, haftanın en iyisi ol."
   - Alt satır: "Ücretsiz. Bahis değil. Her hafta 5 seçilmiş maç."
   - Birincil CTA: **Google ile başla** (`GoogleSignInButton`); girişliyse **Bu haftanın tahminlerini yap**.
   - İkincil: "Nasıl oynanır?" (sayfa içi bağlantı). Sağda/altta bu haftanın 5 maçı mini liste + geri sayım.
2. **3 adımda**
   1. *Maçları gör* — her hafta 5 seçilmiş maç.
   2. *Skoru tahmin et* — başlama saatine kadar değiştirebilirsin, bir maça joker koy.
   3. *Sıralamada yüksel* — haftalık ve sezonluk tablo.
3. **Nasıl oynanır** — iki sekme:
   - *Puanlama:* §3.4 tablosu + örnek ("Tahminin 2-1, sonuç 3-2 → yön 3 + fark 1 = 4 puan").
   - *Kurallar:* kilit, normal süre, ertelenen maç, eşitlik bozma. Tam metin `/tahmin/kurallar`.
4. **Canlı sıralama** — sezon ilk 10 (takma ad, puan, tam skor sayısı) + "Tüm sıralama" bağlantısı. Veri
   `/api/game/leaderboard` (CDN cache'li); boşsa "İlk haftanın lideri sen ol" boş durumu. İleride: "AI" satırı.
5. **SSS** (5 soru, accordion; `FAQPage` JSON-LD)
   - Ücretsiz mi? → Evet, tamamen.
   - Bahis mi? → Hayır; para yatırılmaz, ödül yoktur, yalnız puan ve sıralama.
   - Nasıl giriş yaparım? → Google ile tek dokunuş (ya da mevcut hesabınla).
   - Arkadaşlarımla oynayabilir miyim? → Özel ligler yakında.
   - Tahminimi değiştirebilir miyim? → O maç başlayana kadar.
6. **Son CTA** — "Bu haftanın ilk maçına 1 gün 3 saat" + **Hemen tahmin yap** + "%100 ücretsiz · bahis değil".

Teknik: ISR (hafta ve sıralama verisi saniyeler değil dakikalar), görseller satır içi SVG (Frikik kartı kararı), yeni
font yok. Yeni sayfa olduğu için yerelde 3 koşu Lighthouse, deploy sonrası canlıda mobil 3 koşu (CLAUDE.md).

---

## 10. Bildirimler

| Olay | Kanal (faz) | Not |
|---|---|---|
| Hafta yayımlandı | Zil (F2) | Son 4 haftada oynamış kullanıcılara |
| Hatırlatma: ilk maça 3 sa kaldı, eksik tahminin var | Zil (F2), e-posta (F2, opt-in), push (F3) | Kullanıcı başına haftada en çok 1 |
| Hafta sonuçlandı: puanın, sıran | Zil (F2) | |
| Özel lig daveti / katılım | Zil (F3) | |

- `Notification.type` listesine `GAME_WEEK_OPEN | GAME_REMINDER | GAME_RESULT` eklenir; aktörsüz yazım için
  `createSystemNotification` (mevcut `createNotification` aktör ister).
- Toplu yazım `createMany` + gönderim işi settle/publish içinde arka planda.
- E-posta: mevcut e-posta altyapısı (`security.ts` kullandığı gönderici); tercih ve abonelikten çıkma bağlantısı zorunlu.
  Hatırlatma içeriği ticari ileti sayılır mı → İYS gerekliliği hukuki kontrol (K11).
- Push: `PushToken` kaydı var ama gönderim altyapısı yok (Faz B) → ayrı iş, oyun beklemez.

---

## 11. Gündem ve Frikik bağlantısı

**Frikik**
- Ortak kimlik: takma ad (`User.username`) ve `NICKNAME_REQUIRED` akışı aynı.
- Ortak kod: sıralama SQL yaklaşımı, PGlite test düzeni, TR zaman yardımcıları (`daily.ts` → hafta yardımcısı eklenir).
- Ana sayfada kart: Frikik kartı ile yan yana ya da dönüşümlü — yerleşim kararı K13 (CLS riski, aynı yükseklik kuralı).
- "Genel" tablo (oyun + Frikik toplamı, ScoreHunter'daki Overall gibi) **yapılmaz** (MVP); puan ölçekleri farklı.

**Gündem**
- Faz 3: hafta sonuçlanınca `GundemBotDraft` kuyruğuna `kind: 'GAME_WEEKLY'` taslağı ("Haftanın ilk 3'ü"), admin onaylı.
- Faz 3: kullanıcı kilit sonrası tahminini Gündem'de paylaşabilir (`Post.matchId` ile maça bağlı; kilitten önce paylaşım
  kapalı — kopyalama).
- Profil: Gündem profilinde oyun rozeti / sezon sırası (Faz 3).

**AI analiz (Faz 2)**
- Haftanın maçları `analysisPregen` listesine eklenir → PRE analizi ve `PredictionRecord` oluşur.
- Kilit sonrası maç kartında "AI'nın tahmini: 2-1"; sıralamada ayrı "AI" satırı (gerçek kullanıcı değil, sıra
  numarası almaz). `/ai-istatistikleri` ile çapraz bağlantı.

---

## 12. Aşamalı teslim planı

**Faz 0 — Kararlar (yarım gün)**
- §14 kararları; `GAME_BRAND` + koruma testi; kullanım şartlarına oyun maddesi taslağı.

**Faz 1 — MVP (≈ 6–8 iş günü)**
1. `lib/matchResult.ts` ortak skor/durum yardımcıları (`predictionRecords.ts`'ten çıkarma; mevcut testler yeşil).
2. Şema + göç (4 tablo, 2 enum).
3. `lib/game/week.ts` (TR ISO hafta, sezon), `lib/game/scoring.ts` (saf, tablo testli: her kriter, joker, beraberlik,
   nadir eşiği).
4. Admin: hafta taslağı, öneri listesi, maç ekleme (MatchSnapshot), yayınla, VOID, yeniden puanla, gizle.
5. Tahmin uçları + kilit (DB entegrasyon testi PGlite ile: kilit sınırı, yarış, joker kuralları, `NICKNAME_REQUIRED`).
6. `game-settle` işi + cron-job.org kaydı (10 dk, boşta sıfır istek) — testler `cronJobs` örneğiyle.
7. Sıralama uçları (hafta, sezon, me) — SQL testleri.
8. Sayfalar: `/tahmin` (landing + form), `/tahmin/siralama`, `/tahmin/kurallar`, `/tahmin/hafta/[weekKey]`; tr çeviri.
9. Menü girişi; Lighthouse (yeni sayfa) yerelde 3 koşu.
- Çıkış ölçütü: bir hafta uçtan uca (taslak → yayın → tahmin → kilit → sonuç → tablo) prod'da, admin elle izleyerek.

**Faz 2 — Bağlılık (≈ 4–5 gün)**
- Zil bildirimleri (+ onaylanırsa e-posta hatırlatma), maç sayfası CTA, ana sayfa kartı (Lighthouse), dağılım görünümü,
  AI rakip, geçmiş/profil, OG paylaşım kartı ("Bu hafta 34 puan" — `imageResponse.ts`), en çeviri.

**Faz 3 — Sosyal (≈ 4–6 gün)**
- Özel ligler (davet kodu, lig tablosu, lig sayfası), Gündem haftalık bot postu, tahmin paylaşımı, rozet/kupa, mobil push
  (push gönderim altyapısı hazırsa).

**Faz 4 — Ürünleşme**
- Ayrı alan adı (`90arti.app`) + OAuth/NextAuth host ayarı, mobil uygulama ekranları, bonus maç (ScoreHunter'daki gibi en
  düşük puanlı maçın yerine geçen yedek), otomatik maç seçimi, Pro özellikleri (ödül değil — ör. yedek liste) tartışması.

---

## 13. Riskler

| # | Risk | Etki | Önlem |
|---|---|---|---|
| R1 | Başlama saati değişikliği geç fark edilir (erken başlama) | Başlamış maça tahmin | Snapshot yenileme + cache'teki durum ikinci kontrolü; admin VOID |
| R2 | Sonuç gecikir / Sportmonks 429 (havuz soğuması) | Sonuçlar geç | Gün listesi + saatlik yedek + 3 gün VOID; havuz soğumasında settle bekler, kayıt kapatmaz (`shouldMarkUnresolved` mantığı) |
| R3 | Upstash bellek sınırı (251/256 MB) | Cache yazımları düşer | Oyun Redis'e yalnız küçük sıralama özeti yazar; kişisel veri yok |
| R4 | Vercel Hobby CPU / soğuk başlangıç (hafıza) | Kilit anındaki yoğun yazımlar yavaş | Toplu PUT tek istek; sorgular indeksli; settle arka planda |
| R5 | Az oyuncu → boş sıralama, nadir skor eşiği hiç dolmaz | Oyun "ölü" görünür | Boş durum metinleri, AI satırı, eşik altı nadir bonusu kapalı |
| R6 | Eleme maçında skorun 90' karşılığı yanlış okunur | Yanlış puan | MVP'de eleme maçı seçme ya da `scores` türlerinden 90' skorunu doğrulayan test; admin rescore |
| R7 | "Bahis" algısı / hukuki sınıflandırma, reklam ağı politikası | İtibar, uyum | Ödülsüz, ücretsiz; dil kuralı; ödül öncesi hukuki görüş |
| R8 | Ad değişikliği geç kesinleşir | Metin/SEO borcu | `GAME_BRAND` + `{{game}}` + koruma testi; URL'ler markadan bağımsız |
| R9 | Ana sayfa kartı Lighthouse'u düşürür | Mobil perf (88–90 bandı) | Kart Faz 2'de, sabit yükseklik, kod bölme; ölç, düşüş kalıcıysa raporla |
| R10 | Paralel oturumlar (aynı index, `poll.ts`, ana sayfa dosyaları) | Çakışma | Commit'ler `git commit -o -- <yollar>`; ortak dosyalara küçük dokunuş |
| R11 | Puan kuralını sonradan değiştirme ihtiyacı | Adaletsizlik algısı | `scoringVersion`; değişiklik yalnız yeni haftadan |
| R12 | Sezon ortası başlangıç | Sezon tablosu küçük | Duyuru: "Sezon 1: Ekim–Mayıs"; haftalık tablo öne çıkar |

---

## 14. Kararlar

> 2026-10-11: K4 ve K10 kullanıcı tarafından belirlendi; diğer tüm maddeler önerilen varsayılanlarla **ONAYLANDI**.
> Migration zaman damgası payments dalındaki `20261007120000` ve main'deki `20261008120000`'dan sonra: `20261011120000_prediction_game`.

| # | Karar | Öneri |
|---|---|---|
| K1 | Ürün adı (90+ kesin mi?), kısa ad, `compactName` | 90+ / 90arti; kesinleşene kadar geçici değer yalnız config'de |
| K2 | Site içi yol mu, ayrı alan adı mı (`90arti.app`)? Yol adı `/tahmin` uygun mu? | MVP `/tahmin`; alan adı Faz 4 |
| K3 | Maçları kim seçer: admin elle mi, otomatik öneri + onay mı? Hangi ligler? | Öneri + admin onayı; Süper Lig ağırlıklı + 1–2 Avrupa maçı |
| K4 | Hafta sınırı ve kilit | **ONAY:** Pazartesi 00:00 – Pazar 23:59 Europe/Istanbul; kilit maç başı kickoff'ta |
| K5 | Sezon tanımı ve ilk sezonun başlangıcı | "2026-27", oyunun açıldığı haftadan |
| K6 | E-posta/şifre hesapları da oynasın mı? Sıralamada görünmek için e-posta doğrulaması şart mı? | Herkes oynar; tabloda yalnız doğrulanmış hesap |
| K7 | Puan tablosu (3 / +1 / +1 / +3 / +2, joker ×2) | Önerilen tablo |
| K8 | VOID olan maçtaki joker: yanar mı, taşınabilir mi? | Yanar (basit, açık kural) |
| K9 | Eşitlik bozma sırası | Puan → tam skor → doğru yön → erken son değişiklik |
| K10 | Ödül politikası | **ONAY:** hiç ödül yok (kredi/premium dahil); yalnız kozmetik rozet serbest |
| K11 | E-posta hatırlatma olacak mı (İYS/abonelik)? | Faz 2'de opt-in, hukuki kontrol sonrası |
| K12 | Oyundaki skor tahmini 1X2 anketine (UserPrediction) de yansısın mı? | Hayır (anket ayrı kalsın; çift sayım ve kilit farkı) |
| K13 | Ana sayfada Frikik kartı ile yerleşim (yan yana / dönüşümlü / ayrı satır) | Dönüşümlü tek yuva (CLS ve LH için en güvenli) |
| K14 | AI'yı sıralamada sanal rakip olarak göstermek | Evet, Faz 2, sıra numarasız |
| K15 | `poll.ts` kilitsizlik bulgusu ayrı iş olarak düzeltilsin mi? | Evet, oyundan önce |
| K16 | Maç sayısı (5) sabit mi, bonus maç ileride? | 5 sabit; bonus Faz 4 |

---

## 15. MVP uygulama durumu (2026-10-11, dal `feat/prediction-game`, PUSH YOK)

**Yapılanlar (Faz 1):** şema + migration `20261011120000_prediction_game`; hafta / puan / karar modülleri (`src/lib/game/*`);
kilit SQL'i; `game-settle` işi + `/api/admin/game/settle`; `/api/game/*` ve `/api/admin/game/*`; sayfalar `/tahmin` (landing +
form), `/tahmin/siralama`, `/tahmin/kurallar`, `/tahmin/hafta/[weekKey]`, `/admin/tahmin`; mobil menü bağlantısı; site
haritası; TR + EN çeviriler (`game` namespace, `{{game}}`); `GAME_BRAND` + ad koruma testi; `lib/matchResult.ts` ortak skor
yardımcıları (AI tahmin değerlendirmesi de kullanıyor).

**Plandan sapmalar:**
- Kilidin "ikinci savunması" (önbellekteki listede maç başlamış görünüyorsa yazımı reddetme) PUT ucunda değil, `game-settle`
  işinde: liste canlı gösteriyorsa `kickoffAt = şimdi` yapılır → bir sonraki yazım DB kilidine takılır. Neden: PUT yolunda gün
  listesini okumak soğuk cache'te Sportmonks isteği tetikleyebilirdi (kota kuralı).
- Nadir skor dağılımı "başlama anında dondurma" yerine sonuçlandırmada hesaplanıp `GameMatch.distribution`'a yazılır.
  Başlamadan sonra tahmin değişemediği için sonuç aynı; ayrı bir "kilit anı" işi gerekmedi.
- `GameMatch.checkedAt` eklendi (yedek `fixtures/{id}` sorgusunu saatte bire sınırlamak için).
- "Şu anki hafta": bu hafta tahmine açık değilse yayındaki en yakın gelecek hafta (Pazar akşamı sonraki haftaya geçiş).

**Canlıya çıkış öncesi (kullanıcı / push oturumu):**
1. Migration'ı prod'a uygula (yalnız yeni tablolar; deploy öncesi güvenli). Sıra: payments `20261007120000` → frikik
   `20261008120000` → bu.
2. cron-job.org'a iş ekle: `POST https://<alan>/api/admin/game/settle`, `Authorization: Bearer $CRON_SECRET`, 10 dk.
   (Vercel günlük yedek `30 3 * * *` vercel.json'da.)
3. `/admin/tahmin`'den ilk haftayı oluştur → 5 maç seç → yayınla.
4. Deploy sonrası `/tahmin` için mobil Lighthouse 3 koşu (yeni sayfa; yerelde ölçülmedi — yerel ortam PGlite + dev sunucu,
   temsil edici değil).

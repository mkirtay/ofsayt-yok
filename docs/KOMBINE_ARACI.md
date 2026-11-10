# Kombine aracı (yalnız admin) — durum ve çalıştırma

Dal: `claude/admin-coupon-tool-e78eee` (milli maç dalından kesildi, PUSH EDİLMEDİ). Bayrak varsayılan KAPALI.

## Açma
`.env.local` / Vercel env: `COMBO_TOOL_ENABLED=1` (+ oran için `API_FOOTBALL_KEY`). Adres: **`/admin/kombine`** (ADMIN oturumu; oturumsuz → giriş,
ADMIN değil → 404; bayrak kapalıyken herkese 404). API: `GET/POST /api/admin/kombine`. `noindex`, robots/sitemap/menüde yok; `/admin` ana
sayfasında kart olarak listelenir (yalnız adminler görür). Bayrak kapalıyken AF'ye hiç istek / iş yok; lig ve milli maç davranışı değişmez.

## Ne yapar
- Aday: günün Sportmonks maçları ∩ kayıtlı maç öncesi AI analizi (prompt v5+, `PRE`). **Her maçtan yalnız en güçlü tek pazar**
  (`pickTopPredictions(…, 1)`, analiz kartı ile aynı seçim). Başlamış maçlar varsayılan gizli (“Başlamış maçları da göster” ile açılır).
- Kombine tutma olasılığı = olasılıkların çarpımı (maçlar bağımsız varsayılır; bu bir yaklaşıklıktır).
- Form: risk düzeyi (düşük/dengeli/yüksek = eşik %80/70/60, 3/4/6 maç), en düşük olasılık, maç sayısı, isteğe bağlı hedef kombine oran.
  Hedef oransız → eşiği geçen en güçlü N; hedef oranlı → hedefe ulaşan alt kümeler içinde olasılığı EN YÜKSEK olan (en çok 16 aday, tam tarama).
  Elle işaretleme de serbest; özet (olasılık, oran, başabaş olasılık, fark = olasılık × oran − 1) anında güncellenir.
- Geçmiş isabet tablosu: değerlendirilmiş maçların en güçlü tek pazarı, olasılık bantlarına göre; bant başına < 30 maç “az örnek” uyarılı.
  (2026-11-10 kalibrasyonu: model temkinli — dediğinden fazla tutuyor; örnek küçük.)

## Oran (API-Football Pro)
- Eşleme (`src/services/apiFootball/fixtureMatch.ts`): UTC günü başına TEK `fixtures?date=` (sadeleştirilmiş, Redis `af:combo:fx:<gün>`, 3 sa);
  başlama saati ±30 dk + normalize takım adı (aksan, S.K./FC ekleri, ø/æ, önek, küçük takma ad tablosu). Yedek kural: ±10 dk içinde TEK
  adaylı, takımlardan biri eşleşen fikstür (“time-and-one-team”, API yanıtında `matchQuality`). Eşleşmeyen maçta oran gösterilmez.
- Oran: `odds?fixture=` yalnız **seçilen** maçlar için (≤ 12 / istek, eşzamanlı 4, rateLimit'te 2 sn sonra 1 yeniden deneme), 15 dk önbellek
  (`af:combo:odds:<id>`). “Hedef oran” ile Öner: eşiği geçen en güçlü 12 maçın oranı çekilir (tümü değil).
- Pazar eşlemesi (`oddsMarkets.ts`, bet id): 1X2 → 1; 2+/3+/4+ gol → 5 (Over 1.5/2.5/3.5); KG var → 8; İY 0.5/1.5 üst → 6; ev/deplasman gol bulur →
  16/17 “Over 0.5”, yedek 28/27 “Clean Sheet … No”; İY KG var → 34. Bookmaker sırası Bet365 › Pinnacle › Marathonbet › 1xBet › Betano › …; medyan + sayı da gösterilir.
- Etiket: arayüzde “yaklaşık piyasa oranı” (uluslararası bookmaker); Türk bahis şirketi (iddaa/Nesine) oranı DEĞİL. Oran ~1–2 gün önce açılır, geçmiş yok.
- Bütçe: milli maç sayacından ayrı `combo` havuzu — `COMBO_DAILY_LIMIT=1500`/gün (`af:daily:combo:<gün>`); milli 5000 + kombine 1500 < Pro 7500.

## Doğrulama (2026-11-11, canlı AF + Sportmonks, Redis/DB'ye yazmadan)
- Maç eşleme, 8 Kasım (112 Sportmonks maçı, ~25 lig): **111/112 eşleşti** (ilk sürüm 96/112 idi; ad varyantları — Lyon/Olympique Lyonnais, København/Copenhagen, Brøndby,
  Stade Brestois — ile “tek takım + ±10 dk” yedek kuralı eklenince düzeldi). Kalan: Hearts–Falkirk (AF “Heart Of Midlothian”; Falkirk eşleşiyor ama o saatte iki aday var). 9/10/12 Kasım (az maç): 12/12.
- Oran alma, 8 Kasım'dan 25 maç (tek istekte 25 paralel → AF dakika sınırı hatası verdi; eşzamanlılık 4 + yeniden deneme eklendi). Copa del Rey maçlarından biri “bu pazar yok”.
- Pazar eşlemesi: Süper Lig (Beşiktaş–Gençlerbirliği) ve UCL (PSG–Bayern) gerçek AF yanıtlarında 12 pazar anahtarının hepsi oran döndürüyor
  (`oddsMarkets.test.ts`, `__fixtures__/oddsSuperLig_*`, `oddsUcl_*`; bookmaker/bet alt kümesine sıkıştırıldı). Milli maç (yalnız 1xBet) ve oransız maç testli.

## Oran biriktirme (backtest) — MIGRATION TASLAĞI (UYGULANMADI, koda bağlı DEĞİL)
`prisma/` altına KONMADI: build sırasında `migrate deploy` çalışırsa prod'a gider. Onaylanırsa `prisma/schema.prisma`'ya ve yeni bir migration'a konur:

```prisma
model ComboOddsSnapshot {
  id            String   @id @default(cuid())
  /// Maçın Türkiye günü (YYYY-MM-DD)
  day           String
  matchId       String
  afFixtureId   Int
  pickKey       String
  pct           Float
  odd           Float
  median        Float
  bookmaker     String
  oddsUpdatedAt DateTime?
  createdAt     DateTime @default(now())

  @@unique([matchId, pickKey, day])
  @@index([day])
}
```
```sql
CREATE TABLE "ComboOddsSnapshot" (
  "id" TEXT NOT NULL, "day" TEXT NOT NULL, "matchId" TEXT NOT NULL, "afFixtureId" INTEGER NOT NULL,
  "pickKey" TEXT NOT NULL, "pct" DOUBLE PRECISION NOT NULL, "odd" DOUBLE PRECISION NOT NULL,
  "median" DOUBLE PRECISION NOT NULL, "bookmaker" TEXT NOT NULL, "oddsUpdatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComboOddsSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComboOddsSnapshot_matchId_pickKey_day_key" ON "ComboOddsSnapshot"("matchId","pickKey","day");
CREATE INDEX "ComboOddsSnapshot_day_idx" ON "ComboOddsSnapshot"("day");
```
Yazma noktası: `/api/admin/kombine` POST sonucunda (yalnız `status: 'ok'`) upsert; bunun için günlük otomatik toplama (cron) ayrı karar.

## Bilinen eksikler
- Maçlar bağımsız varsayılır (aynı gün aynı ligdeki maçlar arasında küçük korelasyon olabilir); sistem/mısli yok.
- Pazar olasılığı modelin ham değeri; kalibrasyon düzeltmesi uygulanmıyor, yalnız geçmiş tablo gösteriliyor.
- Oran yalnız maça ~1–2 gün kala; uzak günlerde “oran henüz açılmadı”. Milli maçlar (AI analizi yok) araca girmez.
- Ekran/etkileşim testi: sayfa bileşeni tarayıcıda oturum gerektirdiği için yalnız örnek veriyle (sahte oturum üretilmeden) görsel doğrulandı.

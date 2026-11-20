# Günün Kombinesi (kupon) — devir raporu (2026-11-20)

Yeni Claude oturumu bu dosyayla devam edebilsin diye: ne var, ne canlıda, ne yapılacak, nelere dikkat. Ayrıntılı teknik
belge: `docs/KOMBINE_ARACI.md`.

## 1. Kısa durum

- Ana sayfa yan panelinde (mobilde maç listesinin içinde) **"Günün Kombinesi"** kartı var. Şu an **yalnız ADMIN ve izin
  listesindeki** kullanıcılar görüyor (`COMBO_TOOL_ENABLED=1` + `COMBO_TOOL_USER_IDS`).
- Kullanıcının hedefi: kuponları **herkese açmak**, ama önce **verilen tüm kuponların tuttu/tutmadı geçmişini**
  göstermek (AI isabet sayfası gibi).
- **2026-11-20'ye kadar hiç kupon üretilmedi:** 17:30 cron'u hiçbir yerde zamanlanmamıştı. Prod Redis'te tek bir
  `combo:daily` anahtarı yoktu (salt okunur token ile tarandı). Yani geçmiş sıfırdan başlıyor.
- **2026-11-20'de canlıya alındı (c42ab71, deploy doğrulandı):**
  1. Kuponlar kalıcı tabloda: `ComboCouponLog` (prod migration kullanıcı tarafından `prisma migrate deploy` ile uygulandı).
  2. Vercel Cron: `/api/cron/combo-daily` 14:30 ve 16:30 UTC (17:30 / 19:30 TSİ). Vercel panelinde Cron Jobs listesinde
     görünüyor (Legacy "Cron Jobs" bölümü — çalışıyor, ileride "Schedules"a taşınacak).
  3. Gece sonuçlandırma: `/api/admin/evaluate-predictions` (03:00 UTC) tahmin skorlarını yazdıktan sonra
     `settleComboCoupons` kuponları kapatır.
  4. Kartta **"Geçmiş"** sekmesi (Bugün / Yarın / Geçmiş): gün gün kuponlar, maç başına ✓ / ✗ / •, özet.
- **İlk veri:** 2026-11-20 akşamı 17:30'da ilk kayıt; ilk sonuçlar 2026-11-21 sabahı (~06:00 TSİ) "Geçmiş"te.

## 2. Akış

```
17:30 TSİ  Vercel Cron GET /api/cron/combo-daily (Bearer CRON_SECRET)
           → buildDailyCoupons(bugün, yarın)  [server/combo/dailyCoupons.ts]
               havuz (config/comboPool.ts) ∩ AI analizi olan maçlar  [server/combo/candidates.ts]
               + API-Football oranları (combo bütçe havuzu 1500/gün) [server/combo/afOdds.ts]
           → Redis combo:daily:v2:<gün> (2 gün)  → kart "Bugün/Yarın" buradan okur
           → ComboCouponLog upsert (gün, tür başına tek satır; ilk maç başlayana dek güncellenir) [server/combo/couponLog.ts]
19:30 TSİ  aynı cron — yalnız 17:30'da "insufficient" kaldıysa yeniden dener ("ok" ise `already`)
03:00 UTC  evaluate-predictions → PredictionRecord.actualScore yazılır → settleComboCoupons
           tüm maçlar tuttu → hit=true · tek ıska → hit=false · bilinmeyen varsa açık (legHits ara sonuç)
           ilk maçtan 7 gün sonra hâlâ bilinmeyen + ıska yok → hit=null ("Sonuçlanamadı")
Kart       GET /api/combo/history → son 120 gün + özet  [pages/api/combo/history.ts, utils/comboHistory.ts]
```

**Kupon türleri** (`COUPON_KINDS`): Temkinli 2 maç (bacak olasılığı %70–80), Dengeli 3 maç (%60–72), Riskli 4 maç
(%50–62). Maç başına tek bacak. Pazar YALNIZ toplam gol 1,5 / 2,5 / 3,5 alt-üst ve KG var/yok (`utils/comboMarkets.ts`).
Olasılık = model %25 + oranlardan çıkan (marjı temizlenmiş) olasılık %75 (`MODEL_WEIGHT` 0,25; kalibrasyonda model tek
başına taban oranından iyi değildi). Kartta **adil oran** = 1 / olasılık. Oranı olmayan maç kupona girmez.
Havuz: Süper Lig, UEFA kulüp turnuvaları, büyük 5 (iki takım da ilk 6'da), milli turnuvalar; günde en çok 10 maç.

## 3. Dosyalar

| Ne | Yer |
|---|---|
| Kart (UI) | `src/components/ComboHomeCard/index.tsx`, `HistoryPanel.tsx`, `comboHomeCard.module.scss` |
| Metinler | `public/locales/{tr,en}/combo.json` (`past.*` = Geçmiş sekmesi) |
| Kupon üretimi | `src/server/combo/dailyCoupons.ts`, `candidates.ts`, `afOdds.ts`, `config/comboPool.ts` |
| Kayıt + sonuç | `src/server/combo/couponLog.ts` (`saveCouponLog`, `evaluateCoupon`, `planCouponSettlement`, `settleComboCoupons`, `loadCouponHistory`) |
| Geçmiş (saf) | `src/utils/comboHistory.ts` (`buildCouponHistory`, durum, özet) |
| Uçlar | `pages/api/cron/combo-daily.ts`, `pages/api/combo/{daily,day,history,match-odds}.ts`, `pages/api/admin/evaluate-predictions.ts` |
| Erişim | `src/lib/requireComboAccess.ts`, `src/config/comboTool.ts` |
| DB | `prisma/schema.prisma` → `ComboCouponLog`; `prisma/migrations/20261120120000_combo_coupon_log` |
| Cron | `vercel.json` (2 satır combo-daily) |
| Testler | `src/server/combo/couponSettle.test.ts`, `couponHistory.test.ts`, `ComboHomeCard/HistoryPanel.render.test.tsx`, `src/test/migrations/comboCouponLog.pglite.test.ts`, `src/test/api/comboDaily.test.ts` |

Env: `COMBO_TOOL_ENABLED`, `COMBO_TOOL_USER_IDS`, `COMBO_DAILY_TIME` (varsayılan 17:30), `CRON_SECRET`, `API_FOOTBALL_KEY`.
**API-Football kalıyor** (kullanıcı kararı 2026-11-20; tek ana anahtar fikri geri alındı).

## 4. Yarın ilk iş: doğrulama

1. Kartta "Bugün" sekmesinde 2026-11-20 kuponları görünüyor mu (17:30 sonrası)? "Yeterli veri yok" ise 19:30'u bekle.
2. 2026-11-21 sabahı "Geçmiş" sekmesinde dünkü kuponlar ✓/✗ ile görünüyor mu?
3. Görünmüyorsa: Vercel → Logs'ta `/api/cron/combo-daily` yanıtı (`summary[].logged` sayı olmalı, `no-table` olmamalı) ve
   `/api/admin/evaluate-predictions` yanıtında `comboSettled`.
4. Redis'i salt okunur kontrol: `.env.local`'daki `KV_REST_API_URL` + `KV_REST_API_READ_ONLY_TOKEN` ile
   `prod:v2:combo:daily:v2:<gün>` anahtarı (yazma token'ı KULLANILMAZ). Prod DB'ye sorgu kullanıcı onayıyla.

## 5. Bilinen sorun / ilk iyileştirme (önerilen)

**Analiz zamanlaması kuponu daraltıyor.** AI analizleri maçtan yalnız 2 sa – 3 sa 15 dk önce üretiliyor
(`server/analysisPregen.ts`, `PREGEN_WINDOW_*`). 17:30'da yalnız ~20:45'e kadar başlayan maçların analizi var → akşamın
büyük maçları (21:00–22:00) kupona giremiyor. 19:30 tiki 17:30'da kupon "ok" çıktıysa yeniden üretmiyor.
Seçenekler (karar kullanıcıda):
- a) `COMBO_DAILY_TIME`'ı 19:30'a çekmek (env; kod yok) — 22:45'e kadarki maçlar girer.
- b) Kuponu ilk maçı başlayana kadar yeni analizlerle güncellemek (upsert zaten buna izin veriyor; cron'un `already`
  koşulunu "yalnız aynı aday kümesi" diye değiştirmek).
- c) Havuz maçları için analiz ön üretimini sabaha almak (AI maliyeti artar).

Diğer:
- Milli maç kuponları AF skoruyla sonuçlanır (`PredictionRecord` milli değerlendirmesi var).
- "Kendin ayarla" bölümündeki "Geçmiş isabet tablosu" kuponların değil, AI pazar isabetinin olasılık bantlarıdır.
- Kartta oranlar uluslararası referans (Bet365/William Hill); iddaa oranı değildir.

## 6. Herkese açmadan önce KARAR

`src/utils/gamblingTerms.ts` sitenin herkese açık metinlerinde **"kupon", "piyasa", "KG var", "2,5 üst", "bahis",
"iddaa", "oran 1.85"** gibi ifadeleri yasaklıyor (AdSense kumar politikası; birçok render testi bu listeyle denetliyor).
Kart şu an bu kelimeleri kullanıyor (admin-only olduğu için sorun değil). Açılırsa:
- ya metinler istatistik diline çevrilir (ör. "Günün Kombinesi" → "Günün AI Seçkisi", "2,5 Üst" → "3+ gol", "KG Var" →
  "İki takım da gol atar", "adil oran" kaldırılır / "olasılık" kalır, "Kendin ayarla"daki tutar/misli/sistem kaldırılır),
- ya kullanıcı AdSense riskini bilerek kabul eder.

Açma adımları (öneri): (1) dil kararı, (2) kapı: `requireComboAccess` yerine herkese / üyelere açık uç ve kart
(`MatchHubPage` şu an yalnız `comboAccess` varken yükler), (3) herkese açık geçmiş sayfası (ör. `/ai-istatistikleri`
benzeri, ISR, JSON-LD Dataset), (4) gamblingTerms testleri yeşil.

## 7. Çalışma kuralları (bu repo)

- Paralel oturumlar aynı git index'ini paylaşır: commit daima `git commit -o -- <yollar>`; `git add -A` YOK.
  Köşeli parantezli yollar için `GIT_LITERAL_PATHSPECS=1`.
- Push yalnız kullanıcı onayıyla; push öncesi temiz worktree'de tam test (`git worktree add --detach ../x main`,
  `cp -cR node_modules`, `.env.local` kopyala) — yerel vitest `.claude/worktrees/**`'i de topladığı için hedefli
  testlerde `npx vitest run --exclude '.claude/**' <yollar>`.
- `.env.local` PROD'a bağlı (Supabase + Redis). Prod DB / Redis yazma ve migration kullanıcı onayıyla.
- Lighthouse yalnız sayfa yüküne dokunan işlerde (yerel 3 koşu medyan; asıl ölçüm canlıda).
- Ekran görüntüsü yalnız görsel değişiklikte. Kullanıcıyla Türkçe konuşulur.
- Bu oturumun diğer işleri: `docs/DENETIM_RAPORU_2026-11-20.md` (UI/perf/SEO denetimi, hepsi canlıda);
  haber bölümü yapılmıyor (`docs/HABER_MODELLERI.md`).

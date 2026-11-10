# Kombine aracı (admin + test kullanıcıları) — durum ve çalıştırma

Dal: `claude/admin-coupon-tool-e78eee` (milli maç dalı `claude/national-matches-af-1a48cb` ile birleştirildi, PUSH EDİLMEDİ). Bayrak varsayılan KAPALI.

## Açma ve kapı
- `COMBO_TOOL_ENABLED=1` (+ oran için `API_FOOTBALL_KEY`). Görebilenler: ADMIN rolü + env izin listesi `COMBO_TOOL_USER_IDS` (virgül/boşluk ayrımlı kullanıcı
  kimliği ya da e-posta). Repoda "test kullanıcısı" rolü yok → izin listesi.
- **Ana sayfada** yan panelde (puan durumu / gol krallığı kutusunun altı, masaüstünde sol sütun, mobilde listenin altı) "Günün Kombinesi" kartı. Kapı
  istemcide, oturumdaki `comboAccess` ile (next-auth `session` callback'i: bayrak açık VE yetkiliyse true). Kart `next/dynamic` (ssr:false) ile YALNIZ
  o zaman yüklenir → yetkisiz kullanıcıya ek JS / istek / yerleşim yok, SSR çıktısı aynı. API `/api/combo/day` aynı kapıyı sunucuda uygular
  (`requireComboAccess`: bayrak kapalı / yetkisiz → 404). Eski `/admin/kombine` sayfası kaldırıldı. `noindex`, robots/sitemap'te yok.
- Milli maç detayında "Piyasa oranları" kartı (aynı kapı): `/api/combo/match-odds?id=…` (ayrıca `NATIONAL_MATCHES_ENABLED`); herkese açmak kullanıcı kararı.

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

## Oran biriktirme (backtest) — migration BEKLEMEDE, koda bağlı ama tablo yoksa atlar
**Güvenlik araştırması (2026-11-11):** `package.json` build'i yalnız `next build` (+ sharp izi denetimi); build / deploy sırasında `prisma migrate deploy`
ÇALIŞMIYOR, CI (`.github/workflows/ci.yml`) yalnız `prisma generate` + sahte `postgresql://user:pass@localhost` kullanıyor. Migration'lar elle
uygulanıyor (SQL Editor / `migrate deploy`, bkz. `docs/MIGRATION_STRATEJISI.md`). Vercel Preview'ın prod `DATABASE_URL`'ini kullanıp kullanmadığı
repoda belgeli DEĞİL (`docs/GUVENLIK_RAPORU.md` §6'da "açık soru") → ayrı test DB'si olduğuna dair kanıt yok. Bu yüzden migration `prisma/migrations`
altına KONMADI: `docs/migrations-pending/20261111120000_combo_odds_snapshot/migration.sql`. `schema.prisma` değişmedi (yazma/okuma ham SQL; Prisma
client'a model gerekmiyor). Yerelde `migrate` / `db push` / `test:db` çalıştırılmadı; migration yalnız bellek içi PGlite testinde doğrulandı
(`src/test/migrations/comboOddsSnapshot.pglite.test.ts`).

**Test ortamına uygulama (kullanıcı):** test Supabase projesinin SQL Editor'ünde dosyanın içeriğini çalıştır (IF NOT EXISTS; iki kez çalışması zararsız).
Tablo yokken cron 200 + `skipped: "no-table"` döner, hiçbir şey yazılmaz.

**Tasarım:** maç + pazar başına TEK satır (`UNIQUE(matchId, pickKey)`): `firstOdd/firstAt` (ilk görülen = açılışa yakın, sabit) ve her çalışmada güncellenen
`lastOdd/lastAt` (kapanışa yakın) + `snapshots` sayacı; maç başladıktan sonra güncellenmez (oran donar). Böylece gün içinde kaç kez çalışırsa çalışsın
satır sayısı değişmez (idempotent) ve tablo şişmez. Milli maçlar (AI analizi yok) olasılıksız (`pct NULL`) 1X2 / 2,5 üst / KG var satırlarıyla girer.

## Günlük oran toplama (cron) — KURULMADI
Uç: `POST /api/cron/combo-odds` (`COMBO_TOOL_ENABLED` kapalıyken 404; yalnız `Authorization: Bearer $CRON_SECRET`; sır query'de reddedilir). Kapsam:
bugün + yarın (Türkiye günü) AI analizi olan yaklaşan maçlar + (bayrak açıksa) milli maçlar; oran kombine bütçe havuzundan (önbellekli, eşzamanlılık 4).
**Vercel crons'a eklenmedi.** cron-job.org kurulumu (gundem bot-tick ile aynı desen):
1. https://cron-job.org → *Create cronjob*. URL: `https://<site>/api/cron/combo-odds`, yöntem **POST**.
2. *Advanced → Headers*: `Authorization: Bearer <CRON_SECRET değeri>` (Vercel env'deki ile aynı; URL'ye YAZMA).
3. Zamanlama: 3 saatte bir (örn. `0 */3 * * *`) yeterli — oranlar maçtan 1–2 gün önce açılıp kapanışa kadar oynar; günde ≈ 8 çalışma × (≤ ~10 maç) ≈ 80 AF isteği (günlük 1500 payın çok altında).
4. Zaman aşımı 30 sn, hata bildirimi açık. Yanıt `{"ok":true,"summary":{candidates,withOdds,national,written,skipped?}}`; `skipped:"no-table"` = migration henüz uygulanmadı.
5. Önce elle dene: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/combo-odds`.

## Backtest özeti (salt okunur, UI'a bağlı değil)
`src/server/combo/backtest.ts`: `summarizeBacktest(picks, { comboSize })` (saf, testli) ve `loadBacktestPicks('first'|'last')` (snapshot + `PredictionRecord` sonucu; tablo yoksa null).
Çıktı: tekli (isabet oranı, ortalama oran, düz 1 birim kâr/ROI, modelin beklediği ROI) ve günlük kombine (günün en yüksek olasılıklı N pazarı). Küçük örnekte gürültüdür.

## Bilinen eksikler
- Maçlar bağımsız varsayılır (aynı gün aynı ligdeki maçlar arasında küçük korelasyon olabilir); sistem/mısli yok.
- Pazar olasılığı modelin ham değeri; kalibrasyon düzeltmesi uygulanmıyor, yalnız geçmiş tablo gösteriliyor.
- Oran yalnız maça ~1–2 gün kala; uzak günlerde “oran henüz açılmadı”. Milli maçlar (AI analizi yok) araca girmez.
- Ekran/etkileşim testi: sayfa bileşeni tarayıcıda oturum gerektirdiği için yalnız örnek veriyle (sahte oturum üretilmeden) görsel doğrulandı.

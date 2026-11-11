# Milli maç AI analizi — maliyet, adaptör, geriye dönük test (2026-11-11/12)

Dal `claude/national-analysis-a12830` (PUSH YOK). Kod: `src/server/analysisNationalContext.ts`, betikler `scripts/national/`.
Bayrak: `NATIONAL_MATCHES_ENABLED` + `NATIONAL_ANALYSIS_ENABLED` (ikisi de varsayılan KAPALI; kapalıyken `buildMatchAnalysisContext` milli id'yi eskisi gibi "yok" sayar).

## 1) Maliyet (gpt-6-luna: 0,10 $/Mtok girdi, 0,50 $/Mtok çıktı; aylık tavan `OPENAI_MONTHLY_BUDGET_USD`, varsayılan 30 $)
Ölçüm (prod DB salt okunur, `tokensUsed`): kulüp v6 analizi ort. **5.546 token** (girdi+çıktı), p95 5.749; milli backtest: 4.046 girdi + 1.326 çıktı. Analiz başına ≈ **0,0013 $ (kulüp) / 0,0011 $ (milli)**; bütçe rezervasyonu üst sınırı 0,0019 $.
Bu ay: sayaç Kasım 0,032 $ / Ekim 0,089 $ (tüm LLM kullanımı) → tavanın %0,1–0,3'ü. (Vercel'de env farklıysa tavan değişir; yerel env'de tanımsız → 30 $.)

| Günde analiz | Ayda ($) | Ayda (TL, 1$≈44₺ varsayım) | Tavanın (30 $) % |
|---:|---:|---:|---:|
| 5 | 0,20 | ≈ 9 | %0,7 |
| 10 | 0,39 | ≈ 17 | %1,3 |
| 15 | 0,59 | ≈ 26 | %2,0 |
| 20 | 0,78 | ≈ 34 | %2,6 |
Son 30 günde kulüp ön üretimi 89 analiz (günde 0–10).

`analysisPregen.ts` kapsamı: Süper Lig tamamı · Türk takımlı UEFA kulüp maçları (ŞL/AL/KL) · büyük 5 ligde iki takım da ilk 6; maçtan 2 sa–3 sa 15 dk önce; çağrı başı en çok 3 üretim; GitHub Actions 15 dk. Milli maç YOK (Sportmonks `fixtures/between` + lig listesi). Öneri: milli maçları ayrı aday kaynağıyla (AF günlük liste) ve 'analysis' havuzuyla ekle — bu işte açılmadı.

## 2) Adaptör — hangi veri var / yok
Var (hepsi AF, maç TARİHİNE göre; `historical` modda sonuç/olay/kadro/hakem sızmaz): son 10 maç (A milli, tüm turnuvalar; `fixtures?team&season` yıl, yıl-1, gerekirse yıl-2), dinlenme/sıradaki maç/seri (aynı pencereden), H2H (`fixtures/headtohead`, maçtan önceki 10), turnuva puan durumu (grup başına) ve takımın turnuva sezon özeti — ikisi de turnuva-sezon fikstüründen hesaplanır (AF `standings`/`teams/statistics` yalnız "şimdiki" durumu verir → geçmiş maçta sızıntı; beraberlik bozma resmî kuralları uygulanmaz). Maç başı ~8 AF isteği ('analysis' havuzu, 900/gün; 5000+1500+900 < 7500).
Yok (alan hiç yazılmaz, prompt kural 7 gereği metinde de söz edilmez; bağlama "Maç Türü Notu" eklenir): sakat/cezalı, muhtemel 11 (resmî kadro ~1 sa önce `fixtures?id` ile gelirse otomatik girer), hakem istatistiği, hava, derbi, 1. ayak, gol dakikaları, takım golcüleri, **dış sonuç beklentisi (oran)** — kulüp analizinde bu sinyal var, milli maçta yok (en büyük fark).
Not bloğu (yalnız `ctx.notes`; kulüp prompt metni/çıktısı değişmedi, test kanıtlı): milli maç kadro belirsizliği, hazırlıkta rotasyon, eleme turu, "oyuncu adı uydurma / belirsizliği confidence'a yansıt". Backtest'te 57 analizin hiçbirinde "veri yok" tarzı ifade ya da bahis dili çıkmadı.

## 3) Backtest (57 bitmiş milli maç, DB'siz, aynı prompt+model; OpenAI gerçek maliyet 0,051 $)
Seçim: Türkiye 2026 (9) + UNL 2026 + DK Elemeleri Avrupa (2025 maçları) + hazırlık 2026 + Dünya Kupası 2026, tarihe eşit aralıklı. Gerçek sonuç = 90 dk skoru.

| Ölçüt | Milli (n=57) | Kulüp referansı (n=101) |
|---|---|---|
| En güçlü 3 tahmin isabeti | **%78,4** (134/171; %95: %72–84) | %82,8 |
| Tahmin %55 → gerçekleşen | %50→%56, %59→%64 | %55→%62 |
| %65 → | %68→%82 | %65→%71 |
| %75 → | %79→%82 | %75→%77 |
| %85 → | %90→%96 (n=25) | %85→%90 |
| 1X2 en yüksek olasılık | %61 (%48–73), "hep ev sahibi" tabanı %49 | — |
Bulgular: kulüptekiyle aynı yönde **temkinli** (gerçekleşen ≥ tahmin her aralıkta); gol pazarları belirgin düşük tahmin (3+ gol %46 → %60, ilk yarıda gol %54 → %79; milli maçlarda zayıf rakipli skor farkları büyük). Beraberlik fazla tahmin (%25 → %16). Model risk "high" diyor (34/57) ama isabeti kötü değil. Ayrıntı: `docs/milli-backtest-sonuc.json`.
**Uyarı:** n=57, aralıklar geniş; kulüp farkı (%78,4 vs %82,8) güven aralıkları içinde; hiçbir sonuç kesin değil. Yalnız 2025-26 maçları, oran sinyali olmadan.

## Öneri
Milli maçlar kupona **"deneme/beta" etiketiyle** girebilir: top-3 madde isabeti kulüple istatistiksel olarak ayırt edilemez, ama (a) sakat/kadro/oran girdisi yok, (b) örnek küçük, (c) gol pazarları sistematik düşük tahminli → kuponda gol pazarlarını "temkinli alt sınır" olarak okuyun, 1X2 ve beraberlik pazarına güvenmeyin. Güven: orta-düşük. Pregen'e açmadan önce: AF oran verisini bağlama eklemek (kulüp analizindeki sinyal) ve ≥150 maçlık ikinci ölçüm.

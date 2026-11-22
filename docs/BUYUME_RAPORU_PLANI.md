# Büyüme Raporu Uygulama Planı

Kaynak: "Scor3 — Trafik ve Gelir Büyüme Raporu" (22 Kas 2026). Plan 22 Kas 2026'da kodla karşılaştırılarak yazıldı.

## Rapor ile kod arasındaki farklar (raporun bilmediği, zaten var olanlar)

| Rapor önerisi | Kodda bugün | Sonuç |
|---|---|---|
| Maç sayfasına SportsEvent şeması | `pages/matches/[slug].tsx` SportsEvent JSON-LD + hakem bağlantısı var | Yalnız BroadcastEvent + kanal eklenecek |
| Kanal bilgisi | Sportmonks `tvstations` geliyor ama yalnız belli maç fazlarında (`wantsTvStations`) | Kapsam genişletilecek, şemaya bağlanacak |
| "İlk tahmini aç, gerisini kilitle" | Kilitli analizde `preview` (özet + en olası sonuç) zaten açık; bitmiş maç analizi ücretsiz; `weekly_free` hakkı var | Var olanın üzerine kurulacak; günlük hak kararı gerekli |
| Aylık AI isabet raporu | `/ai-istatistikleri/rapor/[ay]` var | Temel oran + Brier + kalibrasyon eklenecek |
| Kalibrasyon ölçümü | `utils/comboPicks.ts` `calibrationBands` + izlenmeyen `scripts/ai-kalibrasyon.ts` (25 Eki) | Mantık yeniden kullanılacak |
| Reklam | `config/ads.ts` bayrağı var, kapalı; reklamsız yüzey listesi yazılı | Açma 60. gün kararına bağlı |
| PWA / push | `manifest.webmanifest` var; `/api/push/register` yalnız kayıt, gönderim yok | Gönderim + web push yazılacak |
| Kumar dili | `utils/gamblingTerms.ts` filtresi var | "18+ / bilgi amaçlı" ibaresi yok → eklenecek |
| B2B widget | `pages/embed/puan-durumu` var | 6 ay+ işinin tabanı |
| Özel lig, davet kredisi, Frikik emoji kartı, Takımım paketi, hakem atamaları sayfası | Yok | Yeni iş |

## Faz 0 — Ölçüm ve ön koşullar (1. hafta, büyük kısmı sende)

Hedefler oran olarak kaldıkça başarı ölçülemez; önce taban çizgisi.

1. **Search Console dökümü (sen):** aylık tıklama, indekslenen maç sayfası sayısı, en çok tıklanan 50 sorgu.
2. **Site içi sayılar (ben, salt okunur sorgu):** kayıtlı kullanıcı, kredi satın alan, son 30 gün açılan analiz, Tahmin Ligi haftalık oyuncu.
3. **Analiz başına maliyet (ben):** OpenAI bütçe kayıtlarından (ai budget guard) maç başına ortalama.
4. **GA4 olayları (ben):** `sign_up`, `analysis_unlock`, `purchase`, `prediction_submit`; 7. gün geri dönüş için kullanıcı kimliği yok, yalnız olay. Onay mantığı mevcut (GA4 yalnız açık onayla).
5. **UTM (sen + ben):** Reels/bio bağlantılarına `utm_source` kuralı; sosyal medya paket şablonlarına işlenir.
6. **Hukuk (sen):** Sportmonks sözleşmesinde ticari kullanım + logo + AI türev içerik; ödüllü yarışma ve davet kredisi için avukat görüşü.

Çıktı: `docs/BUYUME_KPI.md` — KPI tablosunun "Bugün" sütunu dolu.

## Faz 1 — Güven, dönüşüm, maç sayfası SEO (Gün 1–30)

Sıra önemli: yanıltıcı başarı iddiası en büyük hukuki/marka riski, satış artırmadan önce düzeltilir.

| # | İş | Kapsam | Tür |
|---|---|---|---|
| 1.1 | **Uyum ibaresi** | Her AI analiz kartında "Bilgi amaçlıdır, 18+" satırı; analiz/isabet sayfalarında bahis sitesine bağlantı olmadığının kontrolü (kombine kartı yalnız admin, kalır) | UI, küçük |
| 1.2 | **İsabet sayfası dürüstleştirme** | `/ai-istatistikleri` + aylık rapor: pazar başına temel oran sütunu (aynı lig, kendi değerlendirilmiş maçlarımızdan), Brier skoru, kalibrasyon grafiği; %79,9 başlığı tek başına gösterilmez | UI + sunucu |
| 1.3 | **AI kapsamını daralt** | Analiz üretimi: Süper Lig, 1. Lig, Türk takımlarının Avrupa maçları, 5 büyük lig derbileri (+ büyük milli maçlar?). Maliyet de düşer | Yapılandırma — **karar gerekli** |
| 1.4 | **Olasılık kalibrasyonu** | Geçmiş v5+ tahminlerden pazar başına isotonic eşleme tablosu (betik üretir, JSON olarak repoda); gösterilen yüzde bu tablodan geçer. Yeterli örneklem yoksa pazar ham kalır | Sunucu + betik |
| 1.5 | **Öne çıkan 3 tahmin = temel orandan en çok sapan** | `analysisTopPicks` seçim kuralı; isabet istatistiği yeni kurala ayrı sürümle başlar (eski seriyle karışmaz) | Sunucu |
| 1.6 | **Kilit + kanıt** | Kilitli analizde ilk tahmin tam açık; kilidin yanında "son 7 günde öne çıkan tahminler X/Y tuttu" (kalibre seriden); kayıtlıya günde 1 ücretsiz analiz | UI + API — **karar: weekly_free → günlük?** |
| 1.7 | **Maç sayfası SEO** | BroadcastEvent + kanal (tvstations tüm fazlarda, kota etkisi ölçülerek); maçların 7 gün önceden site haritasında olması; `lastmod` durum değişince; sabit maç bilgisi paragrafı SSR'da (kontrol) | Sunucu + SEO |
| 1.8 | **"AI ne dedi, ne oldu"** | Biten maçta aynı URL'de 3 öne çıkan tahmin + gerçekleşen sonuç bloğu (PostMatchBadge/analiz verisi mevcut) | UI |

Ölçüm: 1.7/1.8 sayfa yüküne dokunur → maç sayfası yerel LH 3 koşu, canlıda mobil LH.

## Faz 2 — Viral döngü, hakem, içerik derinliği (Gün 31–60)

| # | İş | Kapsam | Tür |
|---|---|---|---|
| 2.1 | **Haftalık hakem atamaları** | `/hakemler/super-lig/atamalar` (veya hafta parametreli): o haftanın maçları + hakem + kart/penaltı/ev-dep dağılımı; hakem sayfasına ev/deplasman kırılımı ("en çok" dili yasak kuralı geçerli) | Sayfa + SEO |
| 2.2 | **Tahmin Ligi özel lig** | `PrivateLeague` + üyelik tabloları (migration), davet kodu, WhatsApp paylaşım linki (`wa.me/?text=`), lig içi sıralama | DB + API + UI, büyük |
| 2.3 | **Davet kredisi** | Davet eden + edilen için kredi, yalnız edilen doğrulanmış e-posta + ilk tahmin sonrası; tek kullanımlık kotalar (kötüye kullanım) | DB + API — **avukat görüşü sonrası** |
| 2.4 | **Frikik emoji paylaşım kartı** | Wordle tipi metin (🟩⬜) + `navigator.share`/kopyala | UI, küçük |
| 2.5 | **Türkçe "neden" anlatısı** | Prompt v8: form, sakatlık, hakem profili üzerine 3 cümle; `analysisPreview`'da ilk cümle açık | Prompt + UI |
| 2.6 | **AI vs taraftar** | Maç sayfasında Topluluk Tahmini ile AI olasılığı yan yana; haftalık özet verisi (Reels için) | UI |
| 2.7 | **GEO** | Futbol kuralları sayfalarında soru-cevap blokları + FAQPage şeması (ofsayt, VAR, uzatma); aylık isabet raporuna Dataset şeması + tarih | İçerik + şema |
| 2.8 | **"Takımım" sezon paketi** | Tek seferlik ödeme: favori takımın sezon boyu tüm analizleri (premiumUntil benzeri takım bazlı hak); Hikie ürünü + mesafeli satış metni güncellemesi | DB + ödeme — **fiyat kararı + avukat** |

## 60. gün karar noktası

Faz 0 taban çizgisi ile karşılaştır: organik tıklama eğilimi, kayıt → ödeyen oranı, Tahmin Ligi oyuncu sayısı. Karar: reklam açılsın mı, Faz 3 hangi sırayla.

## Faz 3 — Geri dönüş ve gelir çeşitlendirme (Gün 61–90)

| # | İş | Kapsam | Tür |
|---|---|---|---|
| 3.1 | **Web push** | Favori takım: gol, kadro açıklandı. Service worker + VAPID; mevcut `push/register` `web` platformunu zaten kabul ediyor, gönderim (Faz B) yazılır | Büyük |
| 3.2 | **PWA kurulum** | Manifest var; kurulum isteği + çevrimdışı sayfa | Orta |
| 3.3 | **Haftalık e-posta özeti** | Yalnız açık izinle (ticari ileti → İYS kaydı gerekebilir, hukuki kontrol); favori takım maçları + AI isabet | Orta |
| 3.4 | **Reklam** | `NEXT_PUBLIC_ADS_ENABLED`; yalnız maç ve hakem sayfalarında sınırlı display, canlı skoru bölmeden; kredi alana reklamsız. Ön koşul: Vercel Pro (config/ads.ts notu), AdSense başvurusu, çerez bandında reklam onayı | Orta — **karar** |
| 3.5 | **Sponsorluk** | "Haftanın hakem raporu" / Tahmin Ligi isim sponsoru için yer tutucu bileşen; ödül yalnız site içi kredi | Küçük kod, iş sende |
| 3.6 | **Dijital PR** | Aylık veri hikâyesi (hakem kartları, "AI kaç derbiyi bildi") — 2.1 ve 1.2 verisinden; muhabir listesi sende | İçerik |

## Sonraya kalan / yapılmayan

- **B2B AI önizleme widget'ı / API (6 ay+):** `pages/embed` tabanı var; veri lisansı netleşmeden başlanmaz.
- **Bahis ortaklığı:** yapılmıyor (rapor da öneriyor).
- **Sosyal medya (rapor #5):** kod değil; derbi öncesi AI kartı + maç sonu hakem kartı mevcut şablonlarla (scor3-post, `npm run hakem`).

## Kararlar (22 Kas 2026)

1. **AI kapsamı (1.3):** daraltılır; milli maç analizleri (AF) DEVAM eder, kapsam dışı bırakılmaz.
2. **Ücretsiz hak (1.6):** kayıtlı kullanıcıya **günde 1** ücretsiz analiz (`weekly_free` → günlük).
3. **"Takımım" (2.8):** TL ile satılmaz, **kredi ile açılır** → Hikie ürünü / mesafeli satış değişikliği gerekmez; yalnız kredi harcama türü.
4. **Reklam (3.4):** şimdilik **açılmaz**. Not: kullanıcı Vercel'de zaten Pro planda olduğunu hatırlıyor → `config/ads.ts`'deki "Vercel Pro'ya geçmeden açılmaz" notu güncelliğini yitirmiş olabilir; açma kararı geldiğinde planı Vercel panelinden teyit et.

## KPI (90. gün)

Organik tıklama 3×, indekslenen maç sayfası %80+, Tahmin Ligi haftalık 300 oyuncu, kayıtlı → kredi alan %2, 7. gün geri dönüş %25, bağlantı veren alan adı 20, kalibrasyon farkı < 5 puan.

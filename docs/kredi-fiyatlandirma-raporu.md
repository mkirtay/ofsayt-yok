# Ofsayt Yok — Kredi ve Fiyatlandırma Modeli

Tarih: 2026-10-03 · Yalnız analiz: kod veya repo değişmedi, üretim veritabanı okunmadı.
Kur (TCMB gösterge, 02.10.2026): **1 USD ≈ 49,1 TL, 1 EUR ≈ 55,2 TL** ([TCMB kurları — ikincil kaynak](https://www.ensondakika.com.tr/tcmb-doviz-kurlari-2-ekim-2026/711573/)).

> **Vergi uyarısı:** Bu rapordaki vergi hesapları **kaba tahmindir**. 20/B istisnasının web üzerinden kredi satışını kapsayıp kapsamadığı belirsiz. Şahıs şirketi vergisi, KDV ve muhasebe varsayımları **mutlaka mali müşavire teyit ettirilmelidir.**

---

## 1. Özet ve önerilen fiyat listesi

**En önemli bulgu: AI maliyeti kullanıcı sayısıyla değil, maç sayısıyla sınırlı.**
- Her maç için analiz bir kez üretiliyor (`expiresAt: null`) ve sonraki her açılış önbellekten geliyor.
- İlk üretimin maliyeti yaklaşık **1,20 TL** (gpt-4.1) ya da **2,14 TL** (Sonnet 4.5).
- Önbellekten açmanın maliyeti yaklaşık **0,01 TL**; pratikte sıfır.
- Plandaki 34 ligde ayda tahminen ~1.500 maç oynanıyor. Bütün maçlar üretilse bile aylık AI tavanı yaklaşık **1.800 TL** (gpt-4.1).
- Bu yüzden asıl maliyet sabit giderler: Sportmonks (~5.465 TL/ay) ve Vercel Pro (~982 TL/ay).

**Başabaş noktası:** ayda yaklaşık **1.000–1.500 ücretli açma** ya da bunun karşılığı premium abone (bkz. §3).

### Önerilen fiyatlar

| Ürün | Fiyat (KDV dahil) | Birim | Not |
|---|---|---|---|
| **10 kredi** | **49,99 TL** | 5,00 TL/kredi | Giriş paketi, psikolojik eşik 49,99 |
| **30 kredi** | **119,99 TL** | 4,00 TL/kredi (−%20) | "En popüler" rozeti |
| **100 kredi** | **299,99 TL** | 3,00 TL/kredi (−%40) | Yoğun kullanıcı |
| (isteğe bağlı) 250 kredi | 599,99 TL | 2,40 TL/kredi (−%52) | Premium'a yönlendirme daha iyi olabilir; 4. paket şart değil |
| **Analiz açma** | **2 kredi** | 6–10 TL/analiz | Herkes için aynı fiyat; bir kez açılan kalıcı açık |
| AI Asistan ek soru | 1 kredi = 3 soru | ~1,0–1,7 TL/soru | Asistan raporundaki B seçeneğine yakın |
| **Premium aylık** | **99,99 TL** | | Sınırsız açma + reklamsız + asistan (günde 20 soru) |
| **Premium yıllık** | **799,99 TL** | ≈ 66,67 TL/ay (−%33) | "4 ay bedava" mesajı |

**Neden 2 kredi:** küçük pakette analiz 10 TL, büyük pakette 6 TL ediyor. Bu, tek bir maç için "bir çay-simit" eşiğinin altında kalıyor. Ayrıca bugünkü 5 kredilik bedel ve 5 kredilik kayıt bonusu ile yeni ölçek arasında geçişi kolaylaştırıyor (bkz. §4).

**Alternatif (daha agresif premium dönüşümü için):** premium 79,99 TL/ay ve 699,99 TL/yıl. Bu durumda premium, 30 kredilik paketten (15 analiz) yalnız 40 TL daha pahalı olur ve dönüşüm baskısı artar.

### Türkiye kıyası (aylık, TL)

| Hizmet | Fiyat | Kaynak |
|---|---|---|
| FotMob Standart | 19,99 / yıllık 149,99 | [App Store TR](https://apps.apple.com/tr/app/fotmob-futbol-skorlar%C4%B1/id488575683) |
| Sofascore Plus | ~80 / yıllık ~799,99 (süre belirsiz) | [App Store TR](https://apps.apple.com/tr/app/sofascore-canl%C4%B1-skorlar/id1176147574) |
| Sofascore Analyst | ~209,99–299,99 | aynı |
| Mackolik reklamsız | ~149,99 / yıllık ~999,99 (teyitsiz) | [App Store TR](https://apps.apple.com/tr/app/mackolik-canl%C4%B1-sonu%C3%A7lar/id398157427?l=tr) |
| Spotify Bireysel | 115 | [spotify.com/tr](https://www.spotify.com/tr/premium/) |
| YouTube Premium | 119,99 | [Technopat (ikincil)](https://www.technopat.net/2026/06/11/youtube-premium-turkiye-fiyatlari-zam/) |
| Exxen reklamlı / ExxenSpor reklamlı | 219 / 409 | [eleman.net (ikincil)](https://www.eleman.net/is-rehberi/maaslar-ve-ucretler/exxen-2026-uyelik-paketleri-ve-fiyatlari-h19497) |
| S Sport Plus | 399 / yıllık 2.799 | [Webtekno (ikincil)](https://www.webtekno.com/s-sport-plus-fiyat-h137076.html) |
| TOD Spor Extra | 350 (yıllık taahhütle 229) | [Milli Gazete (ikincil)](https://www.milligazete.com.tr/tod-tv-ucreti-ne-kadar-2026-super-lig-paketi-kac-tl-giris-nasil-yapilir-hangi-diziler-ve-maclar-var) |
| Netflix Temel | 259,99 | [help.netflix.com](https://help.netflix.com/tr/node/24926) |
| ChatGPT Go / Plus (web) | 249 / 499 | [Sanayi Gazetesi (ikincil)](https://sanayigazetesi.com.tr/chatgpt-zamli-fiyat-listesi-chatgpt-go-plus-pro-100-pro-200-pro-500-ne-kadar/) |

**Konumlandırma:** 99,99 TL, "veri + analiz" uygulamalarının (Sofascore Plus ~80, Mackolik ~150) arasında ve müzik/video aboneliklerinin (115–120) hemen altında. Canlı yayın paketlerinin (229–409) ise belirgin biçimde altında kalıyor.

Dijital gazete ve The Athletic TR için güncel fiyat bulunamadı.

---

## 2. Maliyet hesabı

### 2.1 AI: koddaki gerçek model ve prompt

- **Model:** `src/services/aiAnalysisService.ts`
  - `OPENAI_API_KEY` tanımlıysa OpenAI kullanılıyor; `OPENAI_MODEL` env'i yoksa varsayılan **gpt-4.1**.
  - Aksi halde **claude-sonnet-4-5-20250929**.
  - `MAX_TOKENS 5000`, temperature 0,35 (OpenAI).
  - Prod'da `OPENAI_MODEL` env'inin değerini görmedim; gpt-4.1 varsaydım.
- **Girdi** (`src/config/analysisPrompt.ts`, `ANALYSIS_MODEL_VERSION v3-2026-10`):
  - Sistem promptu 2.312 karakter.
  - Çıktı şeması açıklaması 3.498 karakter.
  - Talimat metni ~600 karakter.
  - Maç bağlam özeti ~2.500 karakter: iki takımın son 8 maçı, metrikler, H2H, puan sırası, dış beklenti yüzdeleri.
  - Toplam ≈ 8.900 karakter Türkçe → **≈ 3.000 token** (aralık 2.500–4.000).
- **Çıktı:** ~40 metin alanı (her takım için anlatı ve taktik profil, ısı haritası, 3–5 senaryo, risk, analist yorumu) ve 30 sayısal alan → **≈ 2.300 token** (aralık 1.800–3.000; tavan 5.000).
  - Gerçek değer `MatchAnalysis.tokensUsed` alanında saklanıyor (girdi + çıktı toplamı). §5'teki SQL 1 bunu ölçüyor; sonucu gelince hesap güncellenir.

| Model | Fiyat ($/MTok girdi / çıktı) | Ortalama analiz | Kötü durum (4.000 / 5.000) | Kaynak |
|---|---|---|---|---|
| **gpt-4.1** (varsayılan) | 2,00 / 8,00 | **$0,024 ≈ 1,20 TL** | $0,048 ≈ 2,36 TL | [OpenAI fiyatları](https://developers.openai.com/api/docs/pricing) |
| claude-sonnet-4-5 | 3,00 / 15,00 | $0,044 ≈ 2,14 TL | $0,087 ≈ 4,27 TL | [Anthropic fiyatları](https://platform.claude.com/docs/en/about-claude/pricing) |
| Claude Haiku 4.5 (kıyas) | 1,00 / 5,00 | $0,015 ≈ 0,71 TL | | aynı |
| gpt-5-mini (kıyas; +~1.000 reasoning tokenı) | 0,25 / 2,00 | $0,007 ≈ 0,36 TL | | aynı |

Kodda "Mini varsayılan değil — düşük isabet" notu var. Model değişikliğini fiyat değil isabet belirlemeli; maliyet zaten küçük.

### 2.2 Sportmonks

- **İlk üretimde** `buildMatchAnalysisContext` şu çağrıları yapıyor:
  - fixture + olaylar
  - istatistik
  - kadro
  - lig sezonu + puan durumu (2)
  - H2H
  - iki takımın son maçları (2)

  Toplam **~8 çağrı**. Kullanıcı analizi maç sayfasından açtığı için fixture, H2H ve puan durumu çoğunlukla önbellekte hazır. Gerçek upstream istek tahminen **2–4**.
- **Önbellekten açmada** da aynı bağlam baştan kuruluyor (`analysis.ts` POST'ta önce `buildMatchAnalysisContext`, sonra `findStoredMatchAnalysis`). Bu ~8 önbellek okuması demek; upstream'e nadiren gidiyor. **Küçük iyileştirme önerisi:** saklı analizi bağlamdan önce kontrol etmek. 50.000 açılışta kota ve CPU tasarrufu sağlar.
- **Ek maliyet:** 0. Kota (saatte 2.500) 50.000 açılışta bile yeterli.
- **Sabit:** Growth planı **€99/ay ≈ 5.465 TL** (yıllık ödemede €79/ay ≈ 4.361 TL) ([Sportmonks fiyatları](https://www.sportmonks.com/football-api/plans-pricing/)).
  - Plan bütün siteyi besliyor. Aşağıdaki tablolarda **tamamı analiz ürününe yüklendi**; bu muhafazakâr bir varsayım.
  - Açılış başına pay: 1.000 açılışta 5,47 TL, 10.000'de 0,55 TL, 50.000'de 0,11 TL.

### 2.3 Vercel

- **İlk üretim:**
  - Active CPU tahmini 150–300 ms (Prisma, bağlam hesabı, JSON ayrıştırma). LLM beklenirken CPU sayılmıyor.
  - Duvar saati süresi 20–35 sn. Provisioned memory 2 GB × 30 sn ≈ 0,017 GB-sa.
  - Pro fra1 fiyatlarıyla: CPU ≈ $0,00001, bellek ≈ $0,00025 → **≈ 0,013 TL**.
- **Önbellekten açma:** ~50–150 ms CPU, < 1 sn → **≈ 0,001 TL**.
- **Sabit:** Pro **$20/ay ≈ 982 TL**; $20 kullanım kredisini de içeriyor. Ödeme alınmaya başlandığında Hobby'nin ticari kullanım yasağı yüzünden Pro zorunlu ([fair use](https://vercel.com/docs/limits/fair-use-guidelines)).

### 2.4 Özet: tek analiz maliyeti

| | İlk üretim | Önbellekten açma |
|---|---|---|
| AI | 1,20 TL (gpt-4.1) / 2,14 TL (Sonnet 4.5) | 0 |
| Sportmonks ek maliyeti | 0 (2–4 istek, sabit planın içinde) | 0 (önbellek) |
| Vercel ek maliyeti | ~0,013 TL | ~0,001 TL |
| **Toplam ek maliyet** | **~1,21 TL / ~2,15 TL** | **~0,001 TL** |
| Sabit gider (Sportmonks + Vercel Pro) | **~6.450 TL/ay**, hacme bölünür | ← |

### 2.5 Satış başına kesintiler

**Senaryo A: Hikie, şirketsiz**
- Hikie'nin resmi sayfası "%3,49 + %1'den başlayan" komisyon diyor; blogda **%4,49** geçiyor. Sabit işlem ücreti gösterilmiyor ([hikie.space/about](https://www.hikie.space/about)).
- **20/B istisnası kapsamındaysa:** banka, hesaba giren tutardan **%15 stopaj** keser ve bu nihai vergidir. Beyanname, defter ve KDV yok. 2026 yıllık sınırı **5.300.000 TL**.
- **100 TL'lik satışın kaderi:** 100 − 4,49 komisyon = 95,51 → −14,33 stopaj = **81,18 TL net**.
- **Belirsizlikler:**
  - Web sitesinde kredi satışının 20/B kapsamında olup olmadığı belirsiz. Bir görüş istisnanın yalnız mobil uygulama mağazası satışlarını kapsadığını söylüyor ([Muhasebe TR](https://www.muhasebetr.com/yazarlarimiz/rahmikocaturk/003/)). Başka bir görüş 2024 genişlemesinden sonra mümkün olabileceğini, ama **özelge alınması** gerektiğini söylüyor ([alomaliye forumu](https://forum.alomaliye.com/konular/gvk-muk-20-b-istisnasi-mobil-uygulamanin-web-sitesi-uzerinden-yapilan-satislar-kapsama-dahil-midir.73721/)).
  - Hikie'nin kendi blogu 20/B değil, esnaf muafiyetine (GVK 9/10) yönlendiriyor. 9/10 ise yalnız evde üretilen malları kapsıyor ve dijital krediye uymuyor.
  - Hikie'nin ödeme takvimi, fatura düzenleyeni ve 20/B hesabına ödeme yapıp yapamadığı sözleşme sayfalarından **okunamadı**.
  - **Teknik:** Hikie satışını bizim kredi bakiyemize bağlamak için webhook ya da API gerekiyor; desteklediği teyit edilmedi. Kullanıcı Hikie'de ödeyip sitede kredisini nasıl alacak? Elle kod girme, geri dönüş URL'i ya da bir entegrasyon gerekir.

**Senaryo B: şahıs şirketi + iyzico/PayTR**
- **Komisyon:** iyzico kurumsal **%4,29 + 0,25 TL** ([iyzico fiyatlandırma](https://www.iyzico.com/fiyatlandirma)). PayTR oranı işletmeye göre teklifle belirleniyor, sabit ücret yok ([PayTR](https://www.paytr.com/en/virtual-pos)). Hesaplamada **%3,5 + 0,25 TL** varsayıldı; iyzico'nun liste fiyatı daha yüksek.
- **KDV %20:** fiyat KDV dahil gösterilir. 100 TL'nin 16,67 TL'si KDV'dir; komisyon faturasındaki KDV indirilebilir, burada ihmal edildi.
- **Gelir vergisi** (ücret dışı tarife 2026, [Tebliğ 332](https://www.alomaliye.com/2025/12/31/gelir-vergisi-genel-tebligi-seri-no-332-gvk-332/)):

  | Dilim | Oran |
  |---|---|
  | 0–190.000 TL | %15 |
  | 190.000–400.000 TL | %20 |
  | 400.000–1.000.000 TL | %27 |
  | 1.000.000–5.300.000 TL | %35 |
  | 5.300.000 TL üstü | %40 |

  - Tabloda şirket kârı **tek başına** vergilendirildi. Maaş gibi başka bir geliriniz varsa ikisi birleşir ve marjinal oran yükselir.
  - **Genç girişimci istisnası** (koşulları sağlanırsa, 3 yıl): yıllık 400.000 TL'ye kadar kazanç vergisiz.
- **Sabit ek giderler (varsayım):** mali müşavir ~3.000 TL/ay. Bağ-Kur primi SGK durumunuza bağlı; tabloya **dahil değil**.
- **100 TL'lik satışın kaderi** (vergi öncesi): 100 − 16,67 KDV − ~3,75 komisyon = **79,58 TL**, ardından gelir vergisi.

---

## 3. Senaryo tablosu (aylık, TL)

### Varsayımlar

**Açılış karışımı** (toplam açılış = ücretsiz + krediyle + premium):

| Toplam açılış | Ücretsiz (bonus/günlük) | Krediyle | Premium aboneyle | Premium abone | İlk üretim (benzersiz maç) |
|---|---|---|---|---|---|
| 1.000 | 400 | 450 | 150 | **10** | 400 |
| 10.000 | 3.000 | 5.000 | 2.000 | **100** | 1.200 |
| 50.000 | 12.500 | 25.000 | 12.500 | **500** | 1.500 (tavan: ayda ~1.500 maç) |

**Gelir varsayımları:**
- Krediyle açılış = 2 kredi × ortalama **4,00 TL/kredi** (paket karışımı) = **8 TL**.
- Premium ortalama aylık gelir: %60 aylık (99,99) + %40 yıllık (66,67/ay) = **86,66 TL/abone**.
- Ortalama kredi satın alımı 30 kredi. Gelirlerin hepsi KDV dahil brüt rakam.

**Gider varsayımları:**
- AI üretim: gpt-4.1, 1,20 TL.
- Premium asistan kullanımı: abone başına ~13 TL/ay (günde ~3 soru, gpt-5-mini/Haiku karışımı).
- Sportmonks 5.465 TL ve Vercel 982 TL tamamen bu ürüne yüklendi.

### Sonuç

| | **1.000 açılış** | **10.000 açılış** | **50.000 açılış** |
|---|---|---|---|
| Brüt gelir | **4.467** | **48.666** | **243.331** |
| · kredi satışı | 3.600 | 40.000 | 200.000 |
| · premium | 867 | 8.666 | 43.331 |
| AI üretim (gpt-4.1) [Sonnet 4.5 ile] | 479 [854] | 1.438 [2.563] | 1.797 [3.204] |
| AI Asistan (premium) | 130 | 1.300 | 6.500 |
| Sportmonks (tam pay) | 5.465 | 5.465 | 5.465 |
| Vercel Pro | 982 | 982 | 982 |
| **İşletme gideri toplamı** | **7.056** | **9.184** | **14.744** |
| **Senaryo A: Hikie** | | | |
| Komisyon %4,49 | 201 | 2.185 | 10.926 |
| Stopaj %15 (20/B kapsamındaysa) | 640 | 6.972 | 34.861 |
| **Net** | **−3.430** | **+30.324** | **+182.801** |
| **Senaryo B: şahıs şirketi + iyzico/PayTR** | | | |
| KDV (%20, fiyatın içinden) | 744 | 8.111 | 40.555 |
| Komisyon %3,5 + 0,25 TL | 165 | 1.802 | 9.012 |
| Mali müşavir (varsayım) | 3.000 | 3.000 | 3.000 |
| Vergi öncesi kâr | −6.499 | 26.568 | 176.020 |
| Gelir vergisi (tek başına, yıllıklandırılmış) | 0 | 4.522 | 51.815 |
| **Net** | **−6.499** | **+22.046** | **+124.204** |
| Net (genç girişimci istisnası varsa) | −6.499 | **+26.568** (yıllık kâr 319 bin < 400 bin) | ~+135.900 |

**Okuma notları:**
- **1.000 açılışta iki senaryo da zararda**, çünkü sabit giderler (~6.450 TL) baskın. Sportmonks'u yalnız bu ürüne yüklemek gerçekçi değil (site zaten ona muhtaç). Sportmonks'u hariç tutarsak A **+2.035**, B **−1.034** olur.
- **Başabaş:**
  - A: ~**1.050 ücretli açma/ay**. Ücretli açılış başına net ~6,2 TL; sabit gider 6.450 TL.
  - B: ~**1.500 ücretli açma/ay**. Müşavir gideri ve KDV nedeniyle daha yüksek.
- **50.000 açılışta** A yıllık brütü ~2,9 M TL; 20/B sınırının (5,3 M) altında. Bu hacimde B'nin KDV ve vergi yükü belirgin. Ama A'nın hukuki belirsizliği de en çok bu hacimde can yakar.
- **AI maliyeti en büyük hacimde bile brüt gelirin ~%1'i.** Model seçimi kârlılığı değil kaliteyi belirler.

---

## 4. Ücretsiz kota önerisi

### Mevcut durum
- Kayıt bonusu 5 kredi = bugünkü fiyatla 1 analiz.
- Turnstile yalnız e-posta kaydında var. Google girişi Turnstile'sız.
- `emailVerified` alanı ve doğrulama akışı var (`src/lib/security.ts`), ama bonus buna bağlı değil.

### Öneri

| Kalem | Öneri | Gerekçe |
|---|---|---|
| **Kayıt bonusu** | **2 kredi** (= 1 analiz). E-posta doğrulaması ya da Google girişinden **sonra** verilir | 5 krediyi 2'lik ölçeğe uydurmak; doğrulanmamış hesapla bonus toplamayı kesmek |
| Mevcut kullanıcılar | Bakiyeler korunur. 5 kredilik eski bakiye yeni ölçekte 2 analiz + 1 kredi eder ("hediye" mesajıyla) | Güven |
| **Ücretsiz önizleme** | Herkese, girişsiz: kısa özet + tek ana olasılık | Ek maliyet 0. Analiz yalnız biri açtıysa vardır; yoksa "ilk açan sen ol" çağrısı |
| **Günlük 1 ücretsiz açma** (seçenek) | Yalnız: hesap ≥ 24 saatlik + e-postası doğrulanmış + **analizi önceden üretilmiş maçlar** (önbellekten açma). Hak birikmez | Önbellekten açma ~0,001 TL; üretimi tetiklemediği için AI maliyeti 0. Asıl maliyet satışı yamyamlaştırma |
| Günlük hakkın değeri | Ayda ~30 açma. Krediyle karşılığı 60 kredi ≈ 200 TL | **Premium'u (99,99) baltalar.** Öneri: günlük hakkı **haftada 1**'e indirmek ya da yalnız Süper Lig dışı maçlara vermek. Karar sizde |

### Kötüye kullanım (çoklu hesap) riskleri ve önlemler
1. **Bonus toplama:** her yeni hesap 1 analiz alır. Zarar düşük (önbellekten açma ~0 TL; ilk üretim 1,2 TL). Önlemler:
   - doğrulama şartı;
   - IP/24 başına günde ≤ 3 bonus;
   - tek kullanımlık e-posta alan adı kara listesi;
   - Google girişi için hesap yaşı kontrolü.
2. **Günlük hak:** asıl risk gelir kaybı. 10 hesap açan biri ayda ~300 analiz açar. Önlemler:
   - cihaz/çerez + IP sınırı (aynı IP/24'ten günde ≤ 3 ücretsiz açma);
   - doğrulanmış e-posta;
   - hesap yaşı;
   - şüpheli kümelerde hakkın askıya alınması.
3. **İade ve chargeback:** kredi kullanıldıktan sonra iade yapılmamalı. Mesafeli Sözleşmeler Yönetmeliği'nde anında ifa edilen dijital içerik istisnası var; ödeme ekranında açık onay alınmalı (hukukçuya teyit).
4. **Premium paylaşımı:** "sınırsız açma" için adil kullanım sınırı, örneğin günde 50 açma ve aynı anda ≤ 2 oturum.
5. **Kredi geçerlilik süresi:** satın alınan kredi 12 ay geçerli olabilir (muhasebe yükümlülüğünü sınırlar). Tüketici mevzuatı açısından teyit gerekir.

---

## 5. SQL'ler (Supabase SQL Editor, salt okunur)

Tablo ve sütun adları Prisma varsayılanı (çift tırnaklı).

> **Önemli bulgu:** "aynı maçı açan farklı kullanıcı" bugün **ölçülemiyor**.
> - Önbellekten açılış ücretsiz olduğu için hiçbir kayıt yazılmıyor.
> - `ANALYSIS_FREE` yalnız yönetici üretiminde yazılıyor.
> - GET (görüntüleme) kayıt tutmuyor.
>
> Aşağıdaki 2. sorgu yalnız **ödeyerek üretenleri** sayar ve sonuç büyük olasılıkla maç başına ~1 çıkar. Yeni modelde her açılış zaten bir kredi kaydı (ya da 0 tutarlı premium/ücretsiz kaydı) üreteceği için bu sorun kendiliğinden çözülecek.
>
> `status` ve `idempotencyKey` sütunları `20261002160000_credit_safety` migration'ıyla geldi. Migration üretimde uygulanmadıysa **4. sorgu hata verir**; o durumda yalnız 1, 2, 3 ve 5'i çalıştırın.

```sql
-- 1) Son 30 günde üretilen analizler: faz ve model bazında, token istatistiği
SELECT "matchStatus",
       "modelVersion",
       COUNT(*)                                                    AS analiz_sayisi,
       COUNT(DISTINCT "matchId")                                   AS benzersiz_mac,
       ROUND(AVG("tokensUsed"))                                    AS ort_token,
       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY "tokensUsed")  AS medyan_token,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "tokensUsed")  AS p95_token,
       MAX("tokensUsed")                                           AS max_token
FROM "MatchAnalysis"
WHERE "createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY "matchStatus", "modelVersion"
ORDER BY analiz_sayisi DESC;
```

```sql
-- 2) Aynı maç için kredi harcayan / kredisiz üreten farklı kullanıcı sayısı (son 30 gün)
--    Önbellekten açılışlar kayıt tutmadığı için dahil DEĞİL (yukarıdaki nota bakın).
WITH per_match AS (
  SELECT ct."matchId",
         COUNT(DISTINCT ct."userId") AS farkli_kullanici,
         COUNT(*)                    AS hareket
  FROM "CreditTransaction" ct
  WHERE ct."type" IN ('ANALYSIS_SPEND', 'ANALYSIS_FREE')
    AND ct."matchId" IS NOT NULL
    AND ct."createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY ct."matchId"
)
SELECT farkli_kullanici,
       COUNT(*) AS mac_sayisi
FROM per_match
GROUP BY farkli_kullanici
ORDER BY farkli_kullanici;
```

```sql
-- 3) Kullanıcı başına kredi harcaması (son 30 gün, yöneticiler hariç)
--    Harcamalar negatif tutarla yazılır; iade (REFUND) satırları ayrıca düşülür.
WITH spend AS (
  SELECT ct."userId",
         SUM(CASE WHEN ct."type" = 'ANALYSIS_SPEND' THEN -ct."amount" ELSE 0 END) AS harcanan,
         SUM(CASE WHEN ct."type" = 'REFUND'         THEN  ct."amount" ELSE 0 END) AS iade,
         COUNT(*) FILTER (WHERE ct."type" = 'ANALYSIS_SPEND')                     AS harcama_adedi
  FROM "CreditTransaction" ct
  JOIN "User" u ON u."id" = ct."userId"
  WHERE u."role" <> 'ADMIN'
    AND ct."createdAt" >= NOW() - INTERVAL '30 days'
  GROUP BY ct."userId"
)
SELECT COUNT(*) FILTER (WHERE harcama_adedi > 0)                         AS harcayan_kullanici,
       ROUND(AVG(harcanan - iade) FILTER (WHERE harcama_adedi > 0), 2)   AS ort_net_harcama_kredi,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY harcanan - iade)
         FILTER (WHERE harcama_adedi > 0)                                AS medyan_net_harcama,
       MAX(harcanan - iade)                                              AS max_net_harcama,
       SUM(harcama_adedi)                                                AS toplam_harcama_adedi
FROM spend;
```

```sql
-- 4) (credit_safety migration'ı uygulandıysa) harcama durum dağılımı — başarısız üretim / iade oranı
SELECT COALESCE("status", '(eski kayıt)') AS durum,
       COUNT(*)                            AS adet
FROM "CreditTransaction"
WHERE "type" = 'ANALYSIS_SPEND'
  AND "createdAt" >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY adet DESC;
```

```sql
-- 5) Kayıt bonusu dönüşümü: son 30 günde kaydolanlar ve bonusu harcayanlar
SELECT COUNT(*)                                         AS yeni_kullanici,
       COUNT(*) FILTER (WHERE u."emailVerified" IS NOT NULL) AS dogrulanmis,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM "CreditTransaction" ct
         WHERE ct."userId" = u."id" AND ct."type" = 'ANALYSIS_SPEND'))  AS en_az_bir_analiz_acan,
       COUNT(*) FILTER (WHERE u."credits" = 5)          AS bonusa_dokunmayan
FROM "User" u
WHERE u."createdAt" >= NOW() - INTERVAL '30 days'
  AND u."role" <> 'ADMIN';
```

Sonuçlar gelince güncellenecekler: §2.1 token ortalaması (SQL 1), §3 karışım varsayımları (SQL 2, 3, 5), başarısız üretim oranı (SQL 4).

---

## 6. Varsayımlar listesi

1. **Kur:** 1 USD = 49,1 TL; 1 EUR = 55,2 TL (TCMB gösterge, 02.10.2026). Kur hareketleri USD/EUR giderlerini doğrudan etkiler.
2. **Model:** prod gpt-4.1 kullanıyor (`OPENAI_MODEL` env değeri görülmedi). Sonnet 4.5 alternatif olarak hesaplandı.
3. **Token:** analiz başına ~3.000 girdi / ~2.300 çıktı; prompt dosyalarından tahmin. Türkçede ~3 karakter/token. SQL 1 ile doğrulanacak.
4. **Analiz yeniden üretilmiyor:** her maç için tek PRE üretimi (`expiresAt: null`, mevcut kod).
5. **Maç sayısı:** 34 ligde ayda ~1.500 maç. Kaba tahmin; ilk üretim sayısının tavanı.
6. **Sportmonks:** Growth aylık (€99) plan; tamamı analiz ürününe yüklendi. Yıllık ödemede €79.
7. **Vercel:** Pro $20/ay; kullanım ücreti $20 kredinin içinde kalıyor. Bölge fra1 fiyatıyla hesaplandı.
8. **CPU tahmini:** üretim 150–300 ms, önbellekten açma 50–150 ms (ölçülmedi).
9. **Asistan:** premium abone başına ~13 TL/ay ortalama kullanım; kota günde 20 soru.
10. **Gelir:** ortalama kredi fiyatı 4,00 TL (paket karışımı: %30 küçük, %50 orta, %20 büyük); ortalama alım 30 kredi.
11. **Premium:** %60 aylık, %40 yıllık plan; abone sayıları (10 / 100 / 500) tamamen varsayım.
12. **Açılış karışımı:** ücretsiz %25–40, kredi %45–50, premium %15–25 (§3).
13. **Hikie:** %4,49 toplam komisyon, sabit ücret yok. Ödeme takvimi, fatura ve entegrasyon (webhook/API) teyitsiz.
14. **20/B:** web üzerinden kredi satışının kapsama girdiği **varsayıldı. Hukuken belirsiz; özelge önerilir.** %15 stopaj nihai vergi; KDV yok; yıllık sınır 5,3 M TL.
15. **Şahıs şirketi:** iyzico/PayTR komisyonu %3,5 + 0,25 TL (iyzico liste fiyatı %4,29 + 0,25 TL). KDV %20 fiyatın içinden. Gelir vergisi 2026 ücret dışı tarifesiyle, başka gelir yokmuş gibi hesaplandı. Mali müşavir 3.000 TL/ay. **Bağ-Kur dahil değil.** Genç girişimci istisnası yalnız koşullar sağlanırsa geçerli.
16. Komisyonun KDV'si, kur farkı, chargeback ve iade kayıpları, Supabase ve Upstash plan ücretleri **hesaba katılmadı**.
17. **Bütün vergi hesapları kaba tahmindir; mali müşavir teyidi şarttır.**

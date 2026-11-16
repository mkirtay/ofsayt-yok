# SEO / GEO — senin yapacağın adımlar

Kod tarafı (2026-11-15): AI arama botları açıldı (hafif sayfa, Sportmonks'a ek istek yok), `/llms.txt`, maç ve takım
sayfalarında H1 + sunucuda üretilen özet + yapısal veri, sitemap'e kulüp takımları / Gündem / Frikik / hakemler.
Aşağıdakiler hesap erişimi gerektirdiği için sende. Sıra önem sırası.

## 1. Google Search Console (en önemlisi, ~15 dk)

1. https://search.google.com/search-console adresine Google hesabınla gir.
2. **Mülk ekle** → **Alan adı** seç → `getscor3.com` yaz.
3. Verilen `google-site-verification=...` TXT kaydını alan adının DNS'ine ekle
   (alan adı Vercel'deyse: Vercel → Domains → getscor3.com → DNS Records → Add → Type `TXT`, Name `@`, Value = kod).
4. Search Console'da **Doğrula**'ya bas (DNS yayılması birkaç dakika sürebilir).
5. Sol menü **Site haritaları** → `https://www.getscor3.com/sitemap.xml` yaz → **Gönder**.
6. **URL Denetimi** kutusuna bir maç sayfası ve bir takım sayfası yapıştır → **Dizine eklenmesini iste**.
7. 1–2 hafta sonra **Performans** raporunu (sorgular, tıklamalar, sayfalar) bana at; bir sonraki işi buna göre seçeriz.

## 2. Bing Webmaster Tools (~5 dk) — ChatGPT araması Bing dizinini de kullanır

1. https://www.bing.com/webmasters → giriş yap.
2. **Import from Google Search Console** seç (1. adım bittiyse tek tıkla mülk + sitemap gelir).
3. Değilse: siteyi ekle, sitemap'i `https://www.getscor3.com/sitemap.xml` olarak gönder.

## 3. Vercel Firewall — AI botlarını aç (~3 dk)

2026-11-16'dan beri robots.txt'te GPTBot, ClaudeBot, CCBot, PerplexityBot vb. **serbest**. Kod tarafında bu botlar
Sportmonks'a istek attıramaz: maç sayfası yalnız önbellekten (Redis) gelir, önbellekte yoksa 503 döner; diğer sayfalar
CDN kopyası. Yalnız saldırgan kazıyıcılar (Bytespider, Diffbot, ImagesiftBot, Omgilibot, Timpibot) engelli.

Ama Vercel'in **"AI Bots"** firewall kuralı bu botları hâlâ kapıda **403**'lüyor (robots'a hiç bakmadan).

1. Vercel → proje → **Firewall** → **Bot Management** → **AI Bots**.
2. Kuralı **Off** / **Log** yap (Deny/Block değil) → **Save** → **Publish**.
   - Yalnız bazılarını açmak istersen: AI Bots kuralını açık bırak, üstüne **Custom Rule** ekle — Koşul **User Agent**
     **matches regex** `GPTBot|ClaudeBot|CCBot|PerplexityBot|OAI-SearchBot|Claude-SearchBot`, Aksiyon **Bypass**, sırada
     AI Bots kuralının **üstünde**.
3. Kontrol (terminal): iki komut da `200` dönmeli.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "PerplexityBot/1.0" https://www.getscor3.com/
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (compatible; GPTBot/1.2)" https://www.getscor3.com/
```

İlk günlerde Sportmonks kullanım grafiğine bir göz at; bot trafiği maç sayfalarında artsa da Sportmonks isteği artmamalı.

## 4. Push sonrası hızlı kontrol

```bash
curl -s https://www.getscor3.com/llms.txt | head -5
```

```bash
curl -s https://www.getscor3.com/robots.txt | grep -c PerplexityBot
```

İkinci komut `0` dönmeli (artık engel listesinde değil). `GPTBot` için de aynı: `0`.

Ayrıca https://search.google.com/test/rich-results adresine bir maç ve bir takım sayfası ver: **SportsEvent** ve
**SportsTeam** görünmeli.

## 5. Trafik için kod dışı işler (sürekli)

- **X (@getscor3):** büyük maçlardan önce/sonra maç sayfası linkiyle paylaşım; gündem cevapları (`scor3-x-cevap` skill'i).
- **Google İşletme / sosyal profiller:** tüm profillerde site linki `https://www.getscor3.com` olsun (marka sinyali).
- **Backlink:** taraftar forumları, Ekşi/Reddit r/superlig gibi yerlerde *yararlı* veri paylaşımı (hakem istatistikleri,
  karşılaştırma) — spam değil, kaynak olarak.
- **Paylaşım kartları:** Frikik ve Tahmin Ligi sonuç kartları zaten var; kullanıcıları paylaşmaya teşvik et.

## 6. SEO/GEO raporu (2026-11-16) — koddan sonra sende kalanlar

Kodda yapılanlar: AI isabet sayfası herkese açık + aylık rapor (`/ai-istatistikleri/rapor/{ay}`), Hakkımızda + Yöntem,
lig hafta sayfaları (maçlar, skorlar, hakem atamaları, kart sayıları), takım adreslerinde ad (`/teams/34-galatasaray`),
sitemap dizini (`/sitemap.xml` → `/sitemaps/*.xml`), IndexNow (günlük cron), gömülebilir puan durumu, oyuncu ve
karşılaştırma sayfası özetleri, BreadcrumbList / WebSite / FAQPage şemaları.

1. **Search Console:** Site haritaları → `https://www.getscor3.com/sitemap.xml` yeniden gönder (artık dizin). "Sayfalar"
   raporundaki indekslenen sayfa sayısını bugün not et (rapordaki ölçüt).
2. **Bing Webmaster:** Site haritası aynı. IndexNow ayrıca kurulu (`/api/cron/indexnow`, her gün 04:15 UTC; Vercel
   `CRON_SECRET` zaten tanımlı). Bing → IndexNow sekmesinde gönderimler 1–2 gün içinde görünmeli.
3. **Vercel Firewall:** AI Bots kuralı (3. bölüm) — açılmadıkça GPTBot / ClaudeBot / PerplexityBot 403 almaya devam eder.
4. **Veri haberi / editörler:** her ay başı `https://www.getscor3.com/ai-istatistikleri/rapor/{yyyy-aa}` ve her pazartesi
   `https://www.getscor3.com/lig/super-lig/hafta` (geçen haftanın kart sayıları + hakemler) bağlantısını spor
   editörlerine / X'e gönder. Kaynak gösterilebilir sayfa bunlar.
5. **Gömülebilir puan durumu:** her lig sayfasının altında "Bu puan durumunu sitene ekle" kodu var; taraftar siteleri ve
   yerel haber sitelerine bu kodu öner (altında Scor3 bağlantısı çıkar).
6. **Reels / YouTube:** her video açıklamasında ilgili Scor3 sayfasının bağlantısı (maç, hafta ya da hakem sayfası);
   videoları YouTube Shorts'a da yükle.
7. **Topluluklar:** Ekşi Sözlük, r/superlig vb. yerlerde veriyle (hakem kart sayıları, AI isabet raporu) katılım; spam değil.
8. **GEO ölçümü (ayda bir, elle):** aşağıdaki gibi 20 sabit soruyu ChatGPT, Gemini, Perplexity'de sor; Scor3 kaynak
   gösterildi mi not et. Analitikte `chatgpt.com` ve `perplexity.ai` yönlendirmelerini ayrı izle.
   - "Süper Lig'de bu sezon maç başına en çok sarı kart gösteren hakem kim?"
   - "Yapay zekâ ile maç analizi yapan Türkçe siteler hangileri?"
   - "Süper Lig 12. hafta hakemleri kimler?"
   - "Galatasaray Fenerbahçe aralarındaki son maçlar"
   - "Yapay zekâ maç tahminleri ne kadar tutuyor?"

Not: Hakem sayfalarında sıralama / yorum dili kullanılmıyor (mevcut kural, testlerde korunuyor): özetler yalnız sayı
veriyor ("en çok kart gösteren hakem" cümlesi sitede yazılmıyor; tabloda sıralanabiliyor).

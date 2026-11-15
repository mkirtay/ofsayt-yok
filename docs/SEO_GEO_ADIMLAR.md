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

## 3. Vercel Firewall — PerplexityBot'u aç (~3 dk)

Canlıda `PerplexityBot` hâlâ **403** alıyor (Vercel'in "AI Bots" kuralı), robots.txt'te artık serbest.
Eğitim botları (GPTBot, ClaudeBot, CCBot) engelli kalmalı.

1. Vercel → proje → **Firewall** → **Rules** (ya da **Bot Management / AI Bots**).
2. "AI Bots" kuralı **Deny/Block** ise onu açık bırak; üstüne yeni bir **Custom Rule** ekle:
   - Ad: `AI arama botları izin`
   - Koşul: **User Agent** → **contains** → `PerplexityBot`
   - Aksiyon: **Bypass** (ya da **Allow**)
   - Sırayı AI Bots kuralının **üstüne** al → **Save** → **Publish**.
3. Kontrol (terminal): aşağıdaki komut `200` dönmeli.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -A "PerplexityBot/1.0" https://www.getscor3.com/
```

## 4. Push sonrası hızlı kontrol

```bash
curl -s https://www.getscor3.com/llms.txt | head -5
```

```bash
curl -s https://www.getscor3.com/robots.txt | grep -c PerplexityBot
```

İkinci komut `0` dönmeli (artık engel listesinde değil).

Ayrıca https://search.google.com/test/rich-results adresine bir maç ve bir takım sayfası ver: **SportsEvent** ve
**SportsTeam** görünmeli.

## 5. Trafik için kod dışı işler (sürekli)

- **X (@getscor3):** büyük maçlardan önce/sonra maç sayfası linkiyle paylaşım; gündem cevapları (`scor3-x-cevap` skill'i).
- **Google İşletme / sosyal profiller:** tüm profillerde site linki `https://www.getscor3.com` olsun (marka sinyali).
- **Backlink:** taraftar forumları, Ekşi/Reddit r/superlig gibi yerlerde *yararlı* veri paylaşımı (hakem istatistikleri,
  karşılaştırma) — spam değil, kaynak olarak.
- **Paylaşım kartları:** Frikik ve Tahmin Ligi sonuç kartları zaten var; kullanıcıları paylaşmaya teşvik et.

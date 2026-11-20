# Haber bölümü — model önerileri (2026-11-20)

> **KARAR (2026-11-20): haber bölümü yapılmıyor.** Belge yalnız kayıt için duruyor.

Hedef: başka sitelerin haberlerini aynen göstermek yerine, her sabah belli bir saatte **kendimiz** tarayıp **kendi
içeriğimizi** yayınlamak.

## Önce iki gerçek

**1. Sportmonks bize haber metni vermiyor.** Sportmonks'un bir haber ucu var (`news/pre-match`, `news/post-match`) ama
ayrı ücretli bir paket. Bizim planda 403 dönüyor (2026-10-22'de doğrulandı). Üstelik içeriği İngilizce ve yalnız maç
önü/sonu yazıları; transfer, istifa, açıklama gibi saha dışı haberleri kapsamıyor.

Sportmonks'un verdiği şey **olayların kendisi**, yani haberin ham maddesi:

- dün gecenin sonuçları, golleri ve kartları
- puan durumu ve gol krallığındaki değişimler
- resmî transferler (`transfers/teams/{id}`)
- sakat ve cezalı oyuncular
- hakem atamaları
- bugünün maçları ve yayın kanalları

"Galatasaray deplasmanda 3-1 kazandı, liderliğini 3 puana çıkardı, Osimhen 9. golünü attı" gibi bir haberi bu
veriden biz yazabiliriz. "Teknik direktör istifa etti" ise Sportmonks'ta yok; o tür haber için web taraması gerekir.

**2. Web taraması mümkün, ama göstermenin bir sınırı var.** Olgular (kim kimi aldı, maç kaç bitti) kimsenin malı
değil. Haberin **metni ve fotoğrafı** ise yazanın. Bugünkü sistem (`services/newsService.ts`) 5 sitenin RSS'inden
**tam metni ve fotoğrafı** çekip `/news/[id]`'de gösteriyor. Bu, istemediğiniz model, üstelik en riskli olanı.
Tarayıp **olguyu çıkarmak, kendi cümlemizle yazmak ve kaynağa link vermek** güvenli yol. Kesin sınır için yayına
almadan önce avukata (docs/YASAL_NOTLAR.md listesindeki) tek soru sorulabilir.

---

## Model A — "Günün Bülteni" (yalnız kendi verimiz)

Her sabah 07.00 TSİ: Sportmonks verisi (çoğu zaten önbellekte) → yapay zekâ kısa Türkçe metin yazar → `/bulten/2026-11-21`.

- **Bölümler:** Dün gece · Puan durumunda ne değişti · Gol krallığı · Bugün kim kiminle, hangi kanalda · Resmî
  transferler · Sakat/cezalı · Hakem atamaları · AI tahminleri dün nasıl tuttu.
- **Kapsayamadığı:** saha dışı gelişmeler (istifa, açıklama, söylenti).
- **Risk:** yok denecek kadar az; metin yalnız verilen veriden yazılır, uydurma kuralla engellenir.
- **Maliyet:** günde 1 yapay zekâ çağrısı (mevcut aylık bütçe sınırı içinde), Sportmonks'a ek istek ~0.
- **Süre:** ~2 gün.

## Model B — "Haber Radarı" (tarama + başlık + link)

Her sabah: bugünkü RSS kaynakları (+ istenirse birkaç kaynak daha) taranır → aynı olayı yazan haberler gruplanır →
her olay için **kendi yazdığımız 1–2 cümle** ve "Kaynaklar: Sabah, Hürriyet, Habertürk" linkleri.

- **Tam metin ve fotoğraf yok.** Okumak isteyen kaynağa gider.
- **Artısı:** gerçek gündem (transfer, açıklama, istifa) hızlıca sitede görünür.
- **Eksisi:** ziyaretçiyi başka siteye gönderir; Google için zayıf içerik (herkesin yazdığının özeti) → SEO değeri
  düşük. Haber sitelerinin RSS kullanım şartları ticari kullanımı kısıtlayabilir.
- **Süre:** ~1,5 gün.

## Model C — "AI Editör" (web araması + özgün haber)

Her sabah: yapay zekâ **web araması aracıyla** son 24 saatin en önemli 5–8 futbol gelişmesini bulur (OpenAI'nin web
arama aracı; projede zaten OpenAI kullanılıyor). Her biri için:

- en az **2 bağımsız kaynakta** doğrular, tek kaynaklıysa atlar ya da "X'in haberine göre" diye yazar;
- varsa **kendi verimizle** zenginleştirir (oyuncunun sezon istatistiği, takımın son 5 maçı, puan durumu);
- **özgün, kısa bir haber** yazar ve kaynak linklerini altına koyar.

Sonuç taslak olarak düşer; siz yönetim panelinden onaylarsınız (Gündem botundaki taslak → onay akışının aynısı).

- **Artısı:** saha dışını da kapsayan, sitede kalan, arama motoru ve AI aramalarında alıntılanabilir özgün içerik.
- **Eksisi:** en pahalı ve en riskli model. Yanlış bilgi ve söylentilerde kişilere haksızlık riski var; bu yüzden
  onay şart. Arama maliyeti çağrı başına birkaç sent düzeyinde, günlük toplam düşük (fiyat kurulumdan önce
  doğrulanmalı).
- **Süre:** ~3–4 gün.

## Model D — Önerim: A + "resmî kaynaklar" (C'nin güvenli yarısı)

1. **Omurga Model A:** her sabah otomatik, risksiz, her gün dolu.
2. **Üstüne "Resmî açıklamalar" bölümü:** yalnız resmî kaynaklar taranır, söylenti yok.
   - **KAP bildirimleri:** borsadaki 4 kulübün (GS, FB, BJK, TS) transfer, sözleşme ve teknik direktör bildirimleri.
     Bedel dahil resmî bilgi.
   - Kulüplerin resmî siteleri.
   - TFF / PFDK kararları (cezalar), UEFA duyuruları.

   Yapay zekâ bunları kendi cümlesiyle 1–3 cümlede özetler, resmî kaynağa link verir.
3. **İlk 2 hafta onaylı yayın,** kalite oturunca otomatik.
4. İleride istenirse **C'nin söylenti/gündem kısmı** ayrı bir "Gündemdekiler" bölümü olarak, onaylı ve kaynak
   gösterilerek eklenir.

- **Neden:** her gün dolu bir sayfa (A), gerçek "haber" hissi veren resmî gelişmeler (KAP/TFF), en düşük hukuki ve
  doğruluk riski.
- **Süre:** A ~2 gün + resmî kaynaklar ~1,5 gün. KAP ve kulüp sitelerine teknik erişim (RSS/duyuru sayfası)
  kuruluştan önce tek tek kontrol edilmeli.

---

## Hepsinde ortak

- **Zamanlama:** her sabah 07.00 TSİ (04.00 UTC) Vercel cron. Mevcut cron'larla aynı yöntem, `CRON_SECRET` korumalı.
- **Sayfalar:** `/bulten` (arşiv), `/bulten/{tarih}` (günlük, ISR), istenirse `/bulten/{tarih}/{haber}` (tek haber).
  NewsArticle yapısal verisi, site haritası, IndexNow bildirimi.
- **Görünürlük:** ana sayfada Frikik kartının yanına "Günün Bülteni" kartı (2–3 satır + "Devamı"), menüde ve
  `/bugun`'da link, ilgili takım ve maç sayfalarında "Bültende" bağlantısı, istenirse Gündem botu paylaşımı.
- **Kurallar** (mevcut AI kurallarıyla aynı): kumar/bahis dili yok, hakemler için "en çok / en az" yok, yalnız
  verilen veri ve kaynak.
- **Kaldırılacak:** bugünkü tam metin + fotoğraf gösteren RSS sayfası (`/news/[id]`): 301 ile `/bulten`'e
  yönlendirme ve haber görseli host listesi (`config/newsImageHosts.ts`).

## Sizden karar

1. Model: **D (önerim)** · A · B · C
2. Yayın saati: 07.00 mı, başka bir saat mi?
3. Kapsam: Süper Lig + 1. Lig + Avrupa'daki Türk takımları + büyük 5 lig — yeterli mi?
4. İlk dönem onaylı yayın (önerim) mı, baştan otomatik mi?

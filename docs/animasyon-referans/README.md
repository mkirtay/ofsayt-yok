# Ofsayt Yok — Animasyon referansları

Bu klasör tasarım tuvalindeki 8 animasyonun birebir kopyasıdır: saf CSS ve satır içi SVG, JavaScript yok. Her dosya tarayıcıda tek başına açılır. Siteye taşırken CSS'i bileşen başına bir SCSS modülüne çevirin; buradaki dosyalar kaynak koda dahil edilmez, yalnızca referanstır.

## Dosyalar ve kullanım yerleri

| Dosya | Animasyon | Nerede |
|---|---|---|
| 01-mac-oynaniyor.html | Maç oynanıyor | AI Analiz bekleme ekranı (bugün kullanılıyor: src/components/MatchAnalysis/AiLoadingPitch.tsx) |
| 02-dizilis.html | Diziliş kuruluyor | Takım sayfası Kadro/İlk 11 ve maç sayfası kadro alanı yüklenirken |
| 03-var-ofsayt-yok.html | VAR: Ofsayt yok | Trivia üretimi, Kural Köşesi "Ofsayt nedir?", 404 sayfası |
| 04-puan-tablosu.html | Puan tablosu güncelleniyor | Puan durumunda sezon değişirken, tablo kutusunun içinde |
| 05-tribun-dalgasi.html | Tribün dalgası | Gündem akışı ve maç forumu ilk yüklenirken |
| 06-gol-ani.html | Gol anı | Canlı maç satırında skor değiştiğinde bir kez oynar |
| 07-yuvarlanan-top.html | Yuvarlanan top | Sayfa geçişi (RouteProgress yerine) |
| 08-mac-baslamadi.html | Maç henüz başlamadı | Başlamamış maçta istatistik ve olay kartlarının boş durumu |
| 09-kural-kosesi.html | Kural Köşesi (düğme, baloncuk, panel) | Tüm sayfalarda sağ alt; çalışan referans, dar pencerede mobil, geniş pencerede masaüstü |
| 10-mac-olaylari-baslamadi.html | Maç Olayları: henüz başlamadı | Başlamamış maçta Maç Olayları kartı (0'–45'–90' zaman çizelgesi; istatistik kartıyla aynı yükseklik) |
| 11-var-penalti.html | VAR: Penaltı | Kural Köşesi "VAR ne zaman devreye girer?" |
| 12-uzatma-tabelasi.html | Uzatma tabelası | Kural Köşesi "Uzatma süresi nasıl belirlenir?" |
| 13-kaleci-8-saniye.html | Kalecinin 8 saniyesi | Kural Köşesi "Kalecinin 8 saniyesi" |
| 14-penalti-kaleci.html | Penaltıda kaleci | Kural Köşesi "Penaltıda kaleci nerede durmalı?" |
| 15-toplam-skor-bandi.html | Toplam skor bandı | Kural Köşesi "Deplasman golü kuralı neden yok?" |
| 16-iletisim-bandi.html | İletişim bandı (paslaşma → zarf kale) | /iletisim üst bandı, "Topu bize at." başlığının üstünde (mobil 120 px, ≥1024 px 160 px, yükseklik sabit) |

10–16 tek başına açılır; 11–15 sahnesi 504×230 çizilip kutuya ölçeklenir (ScaledScene eşleniği küçük bir betikle, yalnız referansta). URL'ye `#rm` eklenince "Hareketi azalt" karesi görünür. Temel (animasyonsuz) stiller bu karedir.

kural-kosesi.json: Kural Köşesi için ilk 8 içerik (Oyun Kuralları'na göre yazıldı). Her kayıt hangi animasyonla gösterileceğini söyler.

## Performans kuralları (zorunlu)

1. Saf CSS ve SVG. Animasyon kütüphanesi (Lottie, framer-motion, GSAP vb.) eklenmez.
2. Yalnızca transform ve opacity canlandırılır. 01'deki ballPath left/top ile yazılmış; taşırken transform'a çevrilir.
3. Her animasyon kendi SCSS modülünde ve yalnızca onu kullanan bileşende. Ekranın altında kalan ya da sadece masaüstünde görünen kullanımlar next/dynamic ile yüklenir; ana sayfanın ilk yüküne JS veya CSS eklenmez.
4. prefers-reduced-motion: reduce açıksa animasyon durur ve anlamlı tek bir kare görünür.
5. Görünmezken durur: ekran dışındayken (IntersectionObserver) ve sekme arka plandayken animation-play-state: paused.
6. Kayma yok: animasyon, yerine geçtiği içeriğin kutusunu birebir kaplar. Liste ve tablo gibi içerik alanlarında iskeletler kalır; animasyon yalnızca aynı kutuya sığıyorsa kullanılır.
7. Kısa yüklemelerde görünmez: yükleme animasyonları 300 ms gecikmeyle başlar.
8. Erişilebilirlik: görsel öğeler aria-hidden; yanında role="status" ile kısa bir metin.
9. Gol anı (06) döngü değildir; skor değişiminde bir kez oynar.
10. Ölçüm: her adımdan sonra mobil Lighthouse; skor 90'ın, CLS 0'ın altına düşmez.

## Kural Köşesi

- Düğme: tüm sayfalarda sağ altta (giriş/kayıt ve admin hariç). Mobilde alt menünün 16 px üstünde (safe-area dahil), masaüstünde sağdan ve alttan 24 px. 56 px yeşil yuvarlak, düdük ikonu. Günün bilgisi henüz görülmediyse sarı nokta.
- Baloncuk: "Biliyor muydun?" + günün bilgisinin başlığı. 6 sn görünür; günde en fazla 3 kez, arada en az 2 saat; ziyaretin ilk 15 sn'sinde çıkmaz; kullanıcı o gün paneli açtıysa o gün bir daha çıkmaz; panel açıkken çıkmaz. Tıklanınca paneli açar.
- Panel: mobilde ekranın %88'i (en fazla 360 px) ve arka plan kararır; masaüstünde 380 px, header'ın altında, arka plan kararmaz. Kapatma: X, ESC, mobilde karartmaya dokunma. Açılınca odak panele, kapanınca düğmeye döner.
- Günün bilgisi tarihe göre seçilir; herkes aynı gün aynı bilgiyi görür. Panel günün bilgisiyle açılır.
- Görüldü bilgisi ve baloncuk sayacı localStorage'da; erişilemezse baloncuk ve sarı nokta çıkmaz, düğme çalışır.
- Performans: düğme sayfa yüklendikten sonra (boşta) gelir; panel ve animasyonlar ilk tıklamada dinamik import ile yüklenir; position: fixed, kayma yok; animasyonlar yalnızca panel açıkken çalışır.

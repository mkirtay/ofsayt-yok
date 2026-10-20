# Ofsayt Yok Design System

*(19 Eylül 2026 itibarıyla claude.ai'daki "Ofsayt Yok Design System" dokümanından dışa aktarıldı — https://claude.ai/code/artifact/1ff03d04-24cc-4c58-9901-1b43a883b7de . Bu dosya Claude Code'un yerel olarak okuyabilmesi için repo'ya eklendi; asıl karar kaydı claude.ai'daki dokümandır, güncellemeler önce oraya yazılır.)*

Bu belge, futbol-widget-tasarim-brief.md (Sportmonks widget analizi) ve ofsayt-com-tasarim-brief.md (rakip analizi) ile canlı sitede gözlenen tasarım sorunlarını (bkz. SPORTMONKS_MIGRATION_PLAN.md "Faz 8") birleştirerek Ofsayt Yok için somut, uygulanabilir bir tasarım sistemi tanımlar.

## 1. Renk Paleti

**Tema:** Dark-mode-first (Türkiye'deki futbol kullanıcısının "gece maç izleme" alışkanlığına uyan bilinçli seçim, ofsayt.com ile örtüşüyor) — ama ofsayt.com'un aksine **açık tema tam işlevsel olacak**, yarım/eksik kalmayacak.

- **Arka plan katmanları:** `bg-page` (sayfa) `#0F1015`; `bg-surface` (kart/panel) `#1A1C24`; `bg-header` mevcut siyaha yakın tonun aynısı.
- **Tek aksiyon rengi — yeşil:** Mevcut yeşil resmi aksiyon rengi olarak kilitleniyor. SADECE aktif sekme/pill, canlı gösterge noktası, birincil CTA ve sıralama tablosunun üst bölgesi için kullanılır.
- **Durum renkleri (form G/B/M):** Galibiyet=yeşil, Beraberlik=amber, Mağlubiyet=kırmızı, her yerde birebir aynı.
- **Form rozetleri (G/B/M) — tek stil kaynağı:** `_variables.scss` içindeki `form-badge` mixin'i (+ `form-badge-win/draw/loss`) MatchCard, TeamDetailView ve /compare'de aynen kullanılır; renkler `--color-win #00a76f`, `--color-draw #f59e0b`, `--color-loss #ef4444`, yazı `--color-on-status #0b0d10` (doygun dolgu + koyu yazı: 6.1 / 8.9 / 5.1:1). Pastel arka plan yok; yeni yerde kopya tanım yazma, mixin'i kullan.
- **Karşılaştırma taraf renkleri (yeni, 19 Eylül):** /compare'de sol takım = `--compare-a`, sağ takım = `--compare-b` (kulüp rengi DEĞİL; H2H oran çubuğu, H2H satır noktaları, istatistik barları, takım vurgu çizgisi, en golcü etiketi hep aynı taraf için aynı token). Marka yeşilinin (hsl 161°) analog komşusu camgöbeği (190°) ve tamamlayıcısı magenta (322°) — yeşil/amber/kırmızı durum renklerinden ve mavi bölge çubuğundan ayrışır. Dark: A `#06d0f9`, B `#eb47b4`, yazı `--on-compare-a/b #04161b`; A↔B parlaklık oranı 1.87:1. Light: A `#0099b8`, B `#a30e6c`, yazı A üstünde `#04161b`, B üstünde `#ffffff`; A↔B 2.2:1. Beraberlik `--compare-neutral #6b7280`. Renk tek başına taşıyıcı değil: sol/sağ konum + sayı + isimli lejant her zaman yanında.
- **Sıralama tablosu bölge çubukları:** Şampiyonlar Ligi=yeşil, Avrupa/kupa=mavi, düşme hattı=kırmızı (her lig için hangi sıraların hangi bölgeye girdiği Faz 8'de sabitlenecek).
- **Premium/monetizasyon ayrımı:** "Premium'a Geç" CTA'ları için ayrı bir amber/gold ton kullanılacak (şu an genel yeşille aynı, karışıklık yaratıyor).
- **Metin katmanları:** Birincil kırık beyaz, ikincil orta gri, üçüncül soluk gri (şu an hiç kullanılmıyor, her şey aynı ağırlıkta).

## 2. Tipografi

**Font:** Inter (değiştirilmiyor). Sorun font değil, ağırlık merdiveninin hiç uygulanmaması.

| Seviye | Boyut | Ağırlık | Renk | Örnek |
|---|---|---|---|---|
| Skor | 32-40px | Bold | Birincil | "3-0" |
| Bölüm başlığı | 15-16px | Semibold | Birincil | "Maç İstatistikleri" |
| Gövde/tablo | 14px | Regular | Birincil | Oyuncu/takım adı |
| İkincil meta | 13px | Regular | İkincil gri | Tarih, stadyum, hakem |
| Etiket/mikro | 11px | Medium, uppercase, letter-spacing | Üçüncül gri | Kaynak satırı, alt bilgi |

**Özel durum — boş/hata mesajları:** "Puan tablosu bulunamadı" gibi mesajlar İkincil meta seviyesine (13px, gri) düşürülmeli, hata gibi değil bilgi notu gibi hissettirmeli.

## 3. Spacing / Grid Sistemi

**Temel birim:** 4px. Skala: 4 / 8 / 12 / 16 / 24 / 32 / 48px — başka değer yok.

- **Kart iç padding:** Ana kartlar 16px; kompakt/sidebar widget'lar 12px.
- **Bölümler arası dikey ritim:** minimum 24px, mekanik/eşit değil.
- **Alt navigasyon bar (yeni):** 56-60px yükseklik, ikon+etiket dikey istiflenmiş, mobilde her zaman görünür, masaüstünde gizli (`d-md-none` benzeri), safe-area padding.
- **Grid:** Mobil tek sütun; masaüstü iki sütun (ana içerik + sağ sabit sütun).
- **Dokunma hedefi:** Butonlar/pill'ler en az 40px yükseklik.

## 4. Komponent Kalıpları

| Komponent | Durum | Karar |
|---|---|---|
| Alt navigasyon bar | Yok | Eklenir: Canlı / Puan Durumu / Ligler / Favoriler / Diğer |
| Maç kartı | İyi | Koru, tip ağırlık merdiveni uygula |
| İstatistik çubuğu | İyi | Koru |
| Maç olayları zaman çizelgesi | İyi | Koru |
| Topluluk Tahmini butonları | Kötü — stilsiz | Segmented pill'e çevir, aktif seçim yeşil kenarlık |
| Boş/hata durumu | Tutarsız | Tek bir `EmptyState` komponenti |
| Mini puan durumu widget'ı (sağ sidebar) | Bozuk — veri gelmiyor | Önce veri bug'ı (`getCompetitionTableFull`), sonra ana tabloyla aynı komponent |
| İlk 11 (lineup) | Düzeltildi (Faz 5-6) | `formation_field` ızgarası birincil kaynak, `position_id` fallback |
| Premium/kredi kartları | Orta | Amber/gold renk ayrımı uygulanacak |
| Mobil tarih navigasyonu | Bozuk + fırsat kaçırılmış | ofsayt.com tarzı yatay 5-günlük kaydırmalı seçici; takvim rozetindeki statik "17" `new Date()` ile dinamik olmalı |

## 5. Uygulama Yol Haritası (Faz 8)

1. Design token'ları: Renk/tip/spacing kararları CSS değişkenleri/tema dosyası olarak kodlanır.
2. Alt navigasyon bar eklenir.
3. `EmptyState` komponenti yazılır.
4. Topluluk Tahmini butonları yeniden tasarlanır.
5. Mini puan durumu widget'ı: önce veri bug'ı, sonra ortak komponent.
6. İlk 11 fallback'i düzeltilir. *(Faz 5-6'da tamamlandı.)*
7. Genel geçiş: mevcut sayfalara sayfa sayfa uygulanır.

## 6. Öncelik Sıralı Bulgular (Backlog)

**P0 — bug, düşük efor:** (1) takvim "17" rozeti, (2) mini puan durumu widget veri bug'ı, (3) İlk 11 null-formation fallback *(2 ve 3 Faz 5-6'da çözüldü)*.
**P1 — yüksek etkili UX:** (4) mobil 5-günlük tarih şeridi, (5) alt navigasyon bar, (6) `EmptyState` komponenti.
**P2 — görsel altyapı:** (7) design token'ları, (8) Topluluk Tahmini butonları, (9) premium/kredi renk ayrımı, (10) genel sayfa geçişi.

## 7. Sayfa Mimarisi — Ana Sayfa (19 Eylül kararları)

**Header:** Spor türü sekmesi (Futbol/Basketbol/Voleybol/Tenis) EKLENMİYOR — şimdilik sadece futbol var. Header'da kalacaklar: logo, arama, tema toggle (dark-mode-first korunuyor, sadece mevcut header'ın görsel uygulaması zayıf/boş), Giriş Yap/Üye Ol. World Cup sekmesi kaldırılıyor. İkincil linkler (Bilgi Bankası/UEFA Puanları/Market) için karar YOK — veri doğrulanmadan eklenmeyecek, bu prompt'un kapsamı dışında.

**Sidebar — Ligler/Puan Durumu (2 bug):**
1. Lig listesindeki logo görselleri kırık — `image_path` eşlemesi kontrol edilmeli.
2. Varsayılan sekme "Ligler" olduğu için Puan Durumu + Gol Krallığı fark edilmiyor — varsayılan sekme "Puan Durumu" olmalı.

**Maç detay etkileşimi — split-view:** Maça tıklayınca tam sayfa geçişi YOK — orta sütunda liste yanında bir detay paneli açılır, kullanıcı listeyi kaybetmez. Sağ sütun (reklam yok şimdilik) başka içerikle doldurulur, ileride reklama dönüştürülebilir bir container olarak kurulur. URL değişmeli (paylaşılabilir/geri-ileri çalışmalı). Mobilde bu düzen sığmaz — mobilde tam sayfa (push navigation) korunur, split-view sadece masaüstünde.

**Ürün fırsatı notu (tasarım kararı değil):** ofsayt.com kullanıcıları reklam yoğunluğundan şikâyetçi (kamuya açık yorumlar) — Ofsayt Yok'ta reklam yokken bu "temiz alternatif" konumlaması için bir fırsat, monetizasyon planı netleşince değerlendirilecek.

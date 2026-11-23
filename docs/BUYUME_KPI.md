# Büyüme KPI'ları: taban çizgisi ve ölçüm (büyüme raporu Faz 0)

Taban: 23 Kasım 2026, üretim veritabanından salt okunur sayım. 90. gün: 21 Şubat 2027.

| KPI | Bugün (23 Kas 2026) | 90. gün hedefi | Kaynak / olay |
|---|---|---|---|
| Kayıtlı kullanıcı | 23 (22'si doğrulanmış; son 30 günde 13 yeni) | — | DB `User` |
| Kayıtlı → kredi alan | 1 kişi (%4,3) | %2+ (mutlak sayı büyürken) | DB `CreditTransaction` PURCHASE · GA4 `purchase` |
| Son 30 gün analiz açılışı | 26 | — | DB `AnalysisUnlock` · olay `analysis_unlock` |
| Tahmin Ligi haftalık oyuncu | 1 (son 7 gün) | 300 | DB `GamePrediction` · olay `prediction_submit` |
| Organik tıklama (aylık) | Search Console'dan girilecek | 3× başlangıç | Search Console (kullanıcı) |
| İndekslenen maç sayfası oranı | Search Console'dan girilecek | %80+ | Search Console (kullanıcı) |
| 7. gün geri dönüş | GA4'ten (onaylı kullanıcılar) | %25 | GA4 elde tutma raporu |
| Bağlantı veren alan adı | ~0 | 20 | Ahrefs / Semrush (kullanıcı) |
| AI kalibrasyon farkı (gösterilen − gerçekleşen) | 11,2 puan (%68,8 → %80) | < 5 puan | /ai-istatistikleri › Kalibrasyon |

## Olaylar (lib/growthEvents.ts)

Vercel Web Analytics (çerezsiz, her zaman) + GA4 (yalnız çerez onayıyla). Kişisel veri yok.

| Olay | Nerede | Parametre |
|---|---|---|
| `sign_up` | Şifreli kayıt başarılı | method |
| `analysis_unlock` | AI analizi açıldı (kredi / günlük ücretsiz) | method |
| `prediction_submit` | Tahmin Ligi haftalık kayıt | scope |
| `league_create`, `league_join` | Özel lig | — |
| `invite_share` | Davet linki kopyala / WhatsApp, lig paylaşımı | channel |
| `team_pass_purchase` | Takımım paketi alındı | cost |
| `push_enable` | Web bildirimi açıldı | — |
| `referee_match_click` | Hakem sayfasındaki sıradaki maç kartından maça geçiş (reklam → hakem → maç) | slot, referee_id, match_id |

## Açık sorular (kullanıcıda)

- Search Console: aylık tıklama, indekslenen maç sayfası, en çok tıklanan sorgular → tabloya yaz.
- Reels / bio bağlantılarında UTM: `?utm_source=instagram&utm_medium=social&utm_campaign=<seri>` (kayıt kaynağı
  zaten `SignupAttributionSync` ile tutuluyor).
- Analiz başına maliyet: AI bütçe kayıtlarından aylık toplam ÷ üretilen analiz.
- Sportmonks sözleşmesi: ticari kullanım, logo, AI türev içerik.

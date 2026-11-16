# Futbol Kuralları içerik merkezi

Kaynak: "Futbol Kuralları İçerik Planı" (16 Kasım 2026). İçerik `src/content/futbolKurallari.ts`, sayfalar
`src/pages/futbol-kurallari/`, görünüm `src/components/RulesArticle/`.

## Yayında olanlar (hafta 1–4 uzun içerikleri + #13)

| # | Sayfa | URL |
|---|-------|-----|
| 1 | Futbol Kuralları: 17 kuralın rehberi (hub) | `/futbol-kurallari` |
| 13 | 2026-27 sezonunda ne değişti? | `/futbol-kurallari/2026-27-degisiklikler` |
| 25 | Futbolun en ilginç 15 kuralı | `/futbol-kurallari/ilginc-kurallar` |
| 18 | VAR hangi durumlarda müdahale eder? | `/futbol-kurallari/var` |
| 2 | Ofsayt kuralı nedir? | `/futbol-kurallari/ofsayt` |

Her sayfada: ilk paragrafta net cevap, soru biçiminde H2, SSS + FAQPage, Article, BreadcrumbList, "Son güncelleme",
iç bağlantılar (hakemler, diğer rehberler). Sitemap (`sayfalar`), `llms.txt` ve footer'da bağlantı var.

## Yeni makale ekleme

1. `RULE_ARTICLES` dizisine kayıt ekle (`slug`, `title` ≤ 60 karakter + marka, `description` ≤ 155, `lead`, `sections`, `faq`).
2. Satır içi biçim: `**kalın**`, `[etiket](/yol)` — yalnız site içi yol; test, bağlantının var olan bir sayfaya gittiğini denetler
   (yeni hedef eklerken `futbolKurallari.test.ts` içindeki `known` kümesini güncelle).
3. Sitemap, llms.txt ve "Diğer kural rehberleri" kartları otomatik güncellenir.

## Sıradaki konular (takvim)

| Hafta | Uzun içerik | Kısa soru-cevap |
|------|-------------|-----------------|
| 2 | — | #26 Taçtan gol olur mu? |
| 3 | — | #14 5 saniye kuralı |
| 4 | — | #32 Kornerde ofsayt var mı? |
| 5 | #4 Elle oynama kuralı | #16 Kaleci 8 saniye |
| 6 | #3 Penaltı kuralları | #17 Ağız kapatma sarı kart |
| 7 | #5 Kart nedenleri listesi | #27 En az kaç oyuncu? |
| 8 | #8 Maç süresi rehberi | #15 10 saniye kuralı |
| 9 | #36 Futbol sözlüğü (`/futbol-sozlugu/[terim]`) | #28 Santradan gol |
| 10 | #9 Saha ölçüleri | #29 Top hakeme çarparsa |
| 11 | #33 Tarihi değiştiren kurallar | #30 Kaleci gol atabilir mi? |
| 12 | Sezon ortası veri raporu (Scor3 verisiyle) | #19 Sakatlık 1 dakika kuralı |

Kalan fikirler: #6 direkt/endirekt serbest vuruş, #7 avantaj, #10 oyuncu değişikliği, #11 geri pas, #12 hakem topu,
#20 serinleme molası, #21 yalnız kaptan, #22 vücut kamerası / yarı otomatik ofsayt, #23 Süper Lig yabancı kuralı,
#24 penaltıda çift vuruş, #31 kendi kalesine serbest vuruş, #34 maç tatili, #35 yedek kırmızı kart.

## Yayın öncesi teyit (plandan)

- **Ağız kapatma:** IFAB'da ek madde, yarışmanın tercihi. TFF sarı kart açıkladı — güncel TFF hakem talimatıyla teyit.
- **VAR korner incelemesi:** IFAB'da isteğe bağlı; Süper Lig'de aktif olduğu yalnız haber kaynağında — TFF MHK duyurusuyla teyit.
- **Saha ölçüleri, top ağırlığı:** IFAB Kural 1–2 güncel kitaptan bir kez daha kontrol.
- **Hakem topu (Kural 8) ve penaltıda çift vuruş:** 2026-27 değişikliği olarak geçiyor; IFAB 2026/27 değişiklik belgesiyle
  hangi sezona ait olduğunu ve penaltı (Kural 14) / penaltı atışları (Kural 10) ayrımını teyit.
- Her yaz IFAB değişikliklerinden sonra metni ve `updated` / `updatedIso` alanlarını güncelle.

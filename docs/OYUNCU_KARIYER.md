# Oyuncu sayfası — Kariyer kartı (2026-10-09)

Kullanıcı isteği: "Oyuncuların kariyer geçmişi: hangi takımda kaç maç oynadı, kaç gol attı."

## Ne yapıldı

- `/players/[id]` ana sütununda, Detaylı İstatistikler'in altında **Kariyer** kartı: Sezon (azalan) · Takım (logo +
  `/teams/{id}` bağlantısı) · Turnuva · M · G · A.
- Gruplar: **Lig** önce, **Kupa ve uluslararası** ayrı; her grubun ara toplamı (iki grup varsa), **Genel toplam**,
  2+ takımda **Takım bazında** toplamlar (en son takım önce).
- Veri: oyuncu sayfasının mevcut `players/{id}` çağrısı (`PLAYER_PROFILE_INCLUDE`, proxy'de 30 dk cache). **Yeni
  Sportmonks isteği yok.** Saf türetim `src/utils/playerCareer.ts`, kart `src/components/PlayerProfile/Career.tsx`.
- Aynı sezonda iki takım (transfer) → ayrı satırlar; tablo ters kronolojik olduğu için sezon içinde sonraki takım üstte.
- Mobil (<640 px): Turnuva sütunu gizlenir, turnuva adı takımın altında ikinci satır; M/G/A ekranda kalır, yatay
  kaydırma gerekmiyor (390 px'te `scrollWidth == clientWidth`). Daha dar ekranda tablo kendi içinde kayar.
- Erişilebilirlik: `caption`, `scope="col"/"row"/"rowgroup"`, kısaltmalar `<abbr title>`, kaydırma bölgesi
  odaklanabilir + ayrı etiketli. axe (wcag2a/aa/21aa + best-practice) iki temada, 1280 ve 390 px'te 0 ihlal.
- TR/EN: `public/locales/{tr,en}/player.json` → `career.*`.

## Kararlar

- **`has_values:false` / detaysız satırlar GÖSTERİLMEZ** ("—" ile de değil). Gerekçe: 4 oyuncuda 8 böyle satır var;
  çoğu oyuncunun o sezon o takımda HİÇ olmadığı sahte kayıtlar — Osimhen "Galatasaray Şampiyonlar Ligi 2023/24"
  (o sezon Napoli'deydi), Osimhen "Napoli Avrupa Ligi 2018/19" (Charleroi'daydı), Kerem "Benfica Şampiyonlar Ligi
  2023/24" ve "Galatasaray Avrupa Ligi 2018/19". Geri kalanlar kadroda olup oynamadığı turnuvalar (0 maç). "—" ile
  göstermek kullanıcıya yanlış kariyer bilgisi verirdi.
- **Detayı olup maç sayısı (321) olmayan satır gösterilir**, maç hücresi "—" ve toplama katılmaz; kartın altında
  dipnot çıkar. Tek örnek: Uğurcan, Trabzonspor UEFA Avrupa Ligi 2015/16 (yalnız 90 dk; lineup verisi 1 maç diyor).
  Sahaya çıktığına dair kanıt yoksa (maç da dakika da yok) satır gizlenir.
- **Gol/asist detayı yoksa 0.** Sportmonks sıfır değerli tipi yanıttan atıyor: ham yanıttaki her eksik gol/asist,
  maç bazlı lineup verisinde 0 çıktı (aşağıdaki tablo).
- **Gol = `total`** (penaltı dahil; `goals` alt alanı penaltısız — Osimhen 2025/26 ŞL: total 15 = 13 + 2 pen.).
- **Lig/kupa ayrımı `isCup`, artık Sportmonks `league.sub_type` ile.** Eski ad regex'i "Copa Del Rey"i lig sanıyordu
  (sezon seçicide Lamine'nin Copa Del Rey satırı lig gibi sıralanıyordu). Plandaki 34 lig: 28 `domestic`,
  2 `domestic_cup` (Copa Del Rey, Turkish Cup), 4 `cup_international` (UEFA). Regex yedeğine
  copa/coppa/coupe/pokal/beker/taça/trophy eklendi (`compareData.pickCurrentSeasonId` de bunu kullanıyor).
- **Kapsam notu kartta sabit:** "Yalnızca veri planımızın kapsadığı turnuva ve sezonlar sayılır; eski yerel lig
  sezonları ve milli takım maçları bu tabloda yer almaz." Toplam satırı "Genel toplam" (kariyer toplamı değil).
- **Kart ekrana yaklaşınca (600 px) çizilir** (`CareerWhenNear`, IntersectionObserver; yoksa hemen). Bkz. Lighthouse.

## Veri doğruluğu (2026-10-09, ham Sportmonks yanıtı)

### 1) Sayfa ↔ ham yanıt (hücre hücre)

Yerel üretim derlemesinden tablo DOM'u okundu, ham `players/{id}?include=<PLAYER_PROFILE_INCLUDE>` yanıtından
bağımsız Python koduyla beklenen satırlar/toplamlar üretildi ve karşılaştırıldı.

| Oyuncu | Profil | Ham satır | Gösterilen | Gizlenen (hv=false) | Hücre uyuşmazlığı | Toplamlar (M/G/A) |
|---|---|---|---|---|---|---|
| Victor Osimhen (455805) | çok takım | 16 | 12 | 4 | yok | 102/78/17 ✔ |
| Uğurcan Çakır (201739) | Türkiye ligi, aynı sezon 2 takım | 16 | 15 | 1 | yok | 110/0/0 ✔ |
| Lamine Yamal (37656179) | tek kulüp | 9 | 9 | 0 | yok | 114/48/47 ✔ |
| Kerem Aktürkoğlu (534383) | ek kontrol | 18 | 15 | 3 | yok | 132/38/31 ✔ |

Grup ara toplamları ve takım toplamları da ham yanıttan bağımsız hesapla aynı.

### 2) Maç sayısı type_id eşlemesi (playerStatTypes.ts)

`details.type` ile doğrulandı: 321 = `APPEARANCES` ("Appearances"), 322 = `LINEUPS` (ilk 11), 52 = `GOALS`,
79 = `ASSISTS`, 119 = `MINUTES_PLAYED`, 118 = `RATING`. Eşleme doğru; maç sayısı için 322 (ilk 11) KULLANILMIYOR —
"maç sayısı eksik" türü şikâyetlerin klasik nedeni bu karışıklıktır, bizde yok.

### 3) Sezon toplamı ↔ maç bazlı veri

`players/{id}?include=lineups.fixture;lineups.details&filters=lineupDetailTypes:119,52,79` ile her (sezon, takım)
için "dakikası > 0 maç sayısı / gol / asist" sayıldı ve sezon toplamlarıyla karşılaştırıldı. Verisi olan 51 satırın
46'sı birebir; 5 fark (Sportmonks'un kendi verisinde, bizim kodda değil):

| Satır | Sezon toplamı (321/52) | Maç bazlı | Not |
|---|---|---|---|
| Osimhen, Süper Lig 2025/26 | G 15 | G 16 | toplam 1 gol eksik |
| Osimhen, Türkiye Kupası 2024/25 | M 3 (251 dk) | M 4 (278 dk) | toplam 1 maç eksik |
| Kerem, Avrupa Ligi 2025/26 | G 6 | G 7 | toplam 1 gol eksik |
| Uğurcan, Avrupa Ligi 2015/16 | M yok (90 dk) | M 1 | sayfada "—" + dipnot |
| Kerem, Galatasaray Şampiyonlar Ligi 2024/25 | M 2 | 0 | ön eleme maçlarının lineup'ı yok; toplam doğru görünüyor |

Fark ±1 düzeyinde ve tek yönlü değil. Sayfa Sportmonks'un sezon toplamını gösteriyor (sezon seçicisiyle tutarlı).

### 4) EN BÜYÜK RİSK: plan kapsamı (kariyer "eksik" görünür)

Yerel ligler planda yalnızca **2024/25'ten itibaren** erişilebilir (`seasons?filters=seasonLeagues:564,600,384` →
her lig için 2024/25, 2025/26, 2026/27). UEFA kulüp turnuvaları (Euro Club Tournaments eklentisi) eski sezonlarıyla
geliyor. Sonuç:

- Osimhen: Napoli Serie A, Lille Ligue 1, Wolfsburg/Charleroi YOK; tabloda Napoli yalnız Avrupa kupalarıyla (20 maç).
  Lineup verisinde planın dışında kalan (fixture=null) 260 oynanmış maç var; tabloda 102 maç.
- Lamine Yamal: La Liga 2023/24 yok (UEFA 2023/24 var).
- Milli takım maçları planda yok.

Bu yüzden kartta kapsam notu var ve toplam "Genel toplam" diye adlandırıldı. Transferler kartında görünen ama
Kariyer'de olmayan kulüpler bu kapsamdan kaynaklanır.

## Lighthouse (yerel üretim, mobil, `/players/455805`)

| | Perf (medyan) | LCP sim. | CLS | Erişilebilirlik | İlk yük JS / CSS (localhost, gz) |
|---|---|---|---|---|---|
| Temel (origin/main 1a65ec7) | 86 | 4164 ms | 0,018 | 96 | 415,7 / 46,0 KB |
| Kariyer (son hâl) | 86 | 4159 ms | 0,018 | 96 | 417,4 / 46,4 KB |

İlk denemede (kart profil verisiyle aynı render'da) medyan 85,5 → 80, simüle LCP ~4,3 → ~5,4 sn düştü; **gözlenen
LCP aynıydı (~300 ms)**. Neden: profil render'ı ağırlaşınca Next'in ana sayfa prefetch'leri (14 KB CSS +
`_next/data` JSON'ları) fotoğraf (LCP) isteğinin ÖNÜNE kayıyor, Lantern bunları LCP'ye sayıyor. Kart ekrana
yaklaşınca çizilecek şekilde ertelenince fark kayboldu (6+3 koşu). CLS 0,018 temelde de var (kart kaynaklı değil).

## Yeniden üretme

- Ham yanıtlar: `GET /players/{id}?include=<PLAYER_PROFILE_INCLUDE>`; lineup çapraz kontrolü yukarıdaki istek.
- Testler: `src/utils/playerCareer.test.ts` (toplama, aynı sezon iki takım, veri olmayan sezon, Copa Del Rey),
  `src/components/PlayerProfile/Career.render.test.tsx`, `i18nEnglish.render.test.tsx`. Kırpılmış gerçek
  fixture'lar: `src/services/sportmonks/__fixtures__/playerCareer{Ugurcan,LamineYamal}.json`.

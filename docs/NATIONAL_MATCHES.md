# Milli maçlar (API-Football) — ilk aşama

Durum: kod hazır, bayrak KAPALI. Lig maçları (Sportmonks) davranışı değişmedi.

## Açma
- `NATIONAL_MATCHES_ENABLED=1` (sunucu env) + `API_FOOTBALL_KEY` (Pro, 7500/gün). Kapalıyken 2e9 üstü id'ler "bulunamadı".
- Örnek: `/matches/2001528905` (Türkiye 1-4 İtalya, UNL, AF fixture 1528905).

## Kimlik
Uygulama id'si = AF id + 2_000_000_000 (maç, takım, lig, oyuncu). `src/services/apiFootball/ids.ts`. Migration yok.
Kapsam dışı (sonraki aşama): favori takım/lig `Int[]` alanları artık 2e9+ değer alabilir — yazan/okuyan yerlerde bilinmeli.

## Akış
Tarayıcı → `/api/national/matches/[id]` (BFF) → `src/server/apiFootball/nationalMatch.ts` (SWR, taze 60 sn) → `client.ts`
(günlük iç bütçe 5000/7500) → mapper (`src/services/apiFootball/mapper.ts`). SSR: `resolveMatchPage` içinde ayrı dal.

## Bilerek gizli (milli maçta)
Anlatım, AI Analiz, Trivia sekmeleri; baskı şeridi; hakem puanı; puan durumu kutusu; H2H/form; OG paylaşım görseli; canlı yoklama.
Veri yok: forma rengi, xG, hava, TV, hakem id/istatistiği, derbi, toplam skor.

## Sonraki aşama
Canlı skor (AF `fixtures?live=all` + `/api/matches/[id]/live` dalı), maç listesi / ana sayfa, puan durumu, takım sayfaları,
OG görseli, AI analiz için AF bağlamı.

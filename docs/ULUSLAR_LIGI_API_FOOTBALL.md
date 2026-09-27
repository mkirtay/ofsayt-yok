# Uluslar Ligi (API-Football) — Keşif Notu

**Durum (2026-09-27):** Askıda. Ücretsiz plan 2026-27 sezonuna erişim vermiyor; ücretli plana geçilmeyecek. Kod yazılmadı.

## Keşif bulguları (2026-09-25)

| Konu | Bulgu |
|---|---|
| Kaynak | `https://v3.football.api-sports.io`, header `x-apisports-key`, env `API_FOOTBALL_KEY` (sadece sunucu) |
| Plan | Free, günde 100 istek |
| League id | **5** — UEFA Nations League, `type: Cup`, logo `https://media.api-sports.io/football/leagues/5.png` |
| Sezonlar | 2018, 2020, 2022, 2024, 2026 (current: 2026-09-24 → 2026-11-17) |
| Kapsam (metadata) | events, lineups, statistics (maç + oyuncu), standings, top scorers: `true`; injuries: `false` |
| 2026 erişimi | Yok: `{"plan":"Free plans do not have access to this season, try from 2022 to 2024."}` |

Harcanan istek: 5 (2'si askıya alınmış eski anahtarla, 3'ü yeni anahtarla).

## Yapılmayanlar

- Türkiye team id'si ve 2026-27 maçları
- Bitmiş/yaklaşan maçta events/lineups/statistics/players (rating) içeriği
- `/standings` grup yapısı

## Yeniden açılırsa

1. Pro plan (veya 2026 sezonunu açan plan) alınır; `/status` ile doğrulanır.
2. Keşfe Adım 1.3'ten devam: `fixtures?league=5&season=2026` (Türkiye maçları + team id), bitmiş bir maçta `fixtures/events|lineups|statistics|players?fixture=`, `standings?league=5&season=2026`. Mapper testleri için yanıt örnekleri saklanır.
3. Uygulama planı: Sportmonks'a dokunmadan ayrı modül `src/services/apiFootball/`, proxy `/api/apifootball/...`, ayrı Redis anahtar öneki; `NATIONS_LEAGUE_ENABLED` bayrağı (varsayılan false); maç detayı `/uluslar-ligi/mac/[fixtureId]`; cache TTL — fikstür 10 dk, bitmiş maç 24 sa, puan durumu 30 dk, canlı 60 sn; hata olursa yalnızca Uluslar Ligi bloğu gizlenir.

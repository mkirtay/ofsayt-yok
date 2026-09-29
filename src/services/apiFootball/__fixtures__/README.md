# API-Football test fixture'ları

Hepsi 2026-09-29'da `v3.football.api-sports.io`'dan alınan GERÇEK cevaplardır (değiştirilmedi, yalnızca sıkıştırıldı).
Anahtar Free plandaydı; bu yüzden güncel sezon yerine 2024/25'in aynı türden maçları kullanıldı (şema sezondan bağımsız).
Bağlam ve bulgular: `docs/API_FOOTBALL_MIGRATION.md`.

## Maç detayı (`fixtures?id=` — events + lineups + statistics + players tek cevapta)

| Dosya | Maç | Test ettiği |
|---|---|---|
| `fixtureSuperLigGsTs_1237986.json` | Galatasaray 4-3 Trabzonspor, Süper Lig 2024 | 18 istatistik, penaltı/kendi kalesine/VAR, sırasız `90+10`/`90+8` olayları |
| `fixtureUclFinal_1374812.json` | PSG 5-0 Inter, UCL finali | grid yönü (4-3-3 vs 3-5-2), girip çıkan oyuncu (Bisseck 54'→62') |
| `fixtureNationsLeagueTurIta_1528905.json` | Türkiye 1-4 İtalya, 28.09.2026, UNL A-2 | istenen gerçek maç; 16 istatistik (xG yok) |
| `fixtureNationsLeagueTurHun_1316553.json` | Türkiye 3-1 Macaristan, UNL play-off | 4-2-3-1 vs 3-4-3 grid; `venue.id:null` |
| `fixtureTurkishCupFinal_1373028.json` | Trabzonspor 0-3 Galatasaray, Kupa finali | kadro var ama formasyon/grid/pos/istatistik/reyting YOK |
| `fixtureTurkishCupR4Pen_1315108.json` | Bursaspor 2-2 Vanspor (pen. 6-7), Kupa 4. tur | uzatma + seri penaltı; `score` olaylarla çelişiyor; 52 satırlık bozuk seri penaltı |
| `fixturesLiveAll_20260929.json` | `fixtures?live=all`, 16 canlı maç | `status.elapsed/extra`, canlı cevapta `events[]` |

Doğrulanan kurallar:
- `subst` olayında **`player` = çıkan, `assist` = giren** (Sportmonks'ta tersi).
- `grid "satır:sütun"` içinde **sütun 1 = takımın sol kanadı** (Sportmonks `formation_field`'da sütun 1 = sağ).

## Lig/sezon

`standingsSuperLig2024` (tek grup, 19 takım), `standingsUcl2024LeaguePhase` (36'lık tek tablo), `standingsNationsLeague2024Groups`
(14 grup), `topscorersSuperLig2024` / `topassists…` / `topyellowcards…` / `topredcards…` (≤20 satır),
`leaguesTurkeyCoverage` / `leaguesUclCoverage` / `leaguesNationsLeagueCoverage` (sezon bazlı `coverage` bayrakları;
Türkiye Kupası 2026: lineups/istatistik/oyuncu `false`).

## Takım/oyuncu

`headToHeadGsTs` (36 maç, sırasız), `playersSquadGalatasaray`, `playersTeamSeasonGalatasaray2024_page1` (sayfa 1/4),
`teamStatisticsGalatasaray2024`, `coachsGalatasaray`, `playerProfileOsimhen`, `playerSeasonOsimhen2024`, `playerSeasonsOsimhen`,
`transfersOsimhen` (bonservis `type` içinde string), `trophiesOsimhen`, `sidelinedOsimhen`, `injuriesUclFinal`,
`countries` (171 ülke; `"Türkiye"`/`"Côte d'Ivoire"` adlarıyla eşleşmiyor).

## `freePlanErrors.json`

Free planın `season`, `ids`, `last`, `date` parametrelerindeki gerçek hata metinleri.

## `sportmonksPair/`

Aynı 4 maçın Sportmonks cevabı (`fixtures/{id}?include=participants;scores;state;periods;league;venue;referees.referee;round;stage;
events;statistics;lineups.player.nationality;lineups.details;formations`). `subscription`/`rate_limit` silindi; boyut için
`lineups.details` yalnızca reyting (type 118) satırına, `lineups.player` birkaç alana indirildi. `comparison.json` yan yana özet.

| AF | SM |
|---|---|
| 1237986 | 19172147 |
| 1374812 | 19391309 |
| 1373028 | 19397484 |
| 1315108 | 19326542 |

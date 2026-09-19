# Sportmonks test fixture'ları

Bu klasördeki tüm JSON dosyaları `docs/SPORTMONKS_MIGRATION.md`'de kayıtlı GERÇEK API
response'larından birebir kopyalanmıştır (sentetik/uydurma veri yok). Her dosyanın
başında hangi Pass/bölümden geldiği belirtilir — aşağıdaki liste özet:

- `inplayFixture.json` — Pass 1, `getAllLiveMatches` bölümü (fixture 19874789).
- `scoresInplay.json` — Aynı fixture'ın `scores[]` alanı (tek gerçek scores örneği —
  rapor `CURRENT`/`2ND_HALF` satırlarını da SAYIYOR ama tam JSON'unu hiç basmıyor,
  bu yüzden sadece `1ST_HALF` satırları gerçek veri olarak mevcut).
- `periodsFinished.json` — Pass 2, `time (canlı dakika göstergesi)` bölümü, bitmiş
  maç örneği (`ticking:false`).
- `periodsLive.json` — Pass 3 "Soru 1" tablosundaki üçüncü (son) ölçümün gerçek
  değerleri (`minutes:11, seconds:41, ticking:true`, `started:1789660953`) — raporda
  tam bir JSON bloğu olarak değil bir tabloda verilmiş, ama her alan değeri birebir
  rapordan alınmıştır.
- `venueTurkishCup.json` — Pass 2, `location/venue` bölümü (fixture 19874792).
- `refereesTurkishCup.json` — Pass 2, `referee` bölümü (fixture 19874792, 4 kayıt).
- `roundLaLiga.json` — Pass 2, `round` bölümü (fixture 19732690).
- `stageKnockout.json` — Pass 3 "Soru 3", Şampiyonlar Ligi knockout aşaması
  `stage.name` değerleri (5 gerçek maçtan).
- `superLigFixture.json` — 2026-09-18, Faz 2 lig-id doğrulama turu (bkz.
  `sportmonksProviderFlag.ts` "Doğrulama turu 2"), Sportmonks `league_id:600`
  ("Super Lig") fixture 19746621 (Fenerbahçe 2-3 Beşiktaş, bitmiş maç) —
  `resolveSportmonksLeagueId(6)===600` eşlemesini ve `getFixturesByCompetition`'ın
  gerçek bir Türkiye Süper Lig maçına doğru map'lendiğini test etmek için. Ayrıca
  `scores[]`'ta gerçek `CURRENT` satırları içeren TEK fixture — önceki
  `scoreDerivation.test.ts`'teki `it.todo` (CURRENT dalı hiç gerçek veriyle
  test edilememişti) artık bu fixture'la kapatılabilir (bu görevin kapsamı
  dışında bırakıldı, ayrı bir iş kalemi).

## Faz 3 (Katman-2/3 — maç detay, H2H, sıralama, kadro) — 2026-09-18

Aşağıdakilerin hepsi bu fazın "kırmızı kart doğrulama turu"nda (fixture
19732740, La Liga, Celta de Vigo 1-2 Osasuna — Marcos Alonso kırmızı kart,
VAR/VAR_CARD olayları) ve standings/topscorers/squads/seasons/head-to-head
için ayrıca atılan gerçek isteklerde toplandı. `typeDictionaries.ts`'e bu
turda eklenen 4 yeni gerçek type_id de aynı maçtan geliyor: `EVENT_TYPES[10]`
(VAR), `EVENT_TYPES[1697]` (VAR_CARD), `STATISTIC_TYPES[83]` (Redcards — Pass
5'in çözemediği `red_cards` alanı), `STATISTIC_TYPES[27267]` (Tackles Won).

- `celtaVigoFixture.json` — fixture 19732740 özeti: `participants`, TÜM 17
  gerçek `events[]` (goller, 8 değişiklik, sarı kart, kırmızı kart, VAR,
  VAR_CARD dahil), ve `statistics[]`'ten 7 temsili `type_id` (34 korner, 45
  topa sahip olma, 56 faul, 83 kırmızı kart, 84 sarı kart, 86 isabetli şut,
  27267 kazanılan müdahale) × home/away = 14 satır.
- `celtaVigoLineups.json` — aynı fixture'ın `include=lineups.player` cevabından
  (46 satırlık tam listeden) her takım için pozisyon başına 1 starter + 2
  bench, toplam 12 gerçek satır — `resolveLocation`/pozisyon gruplama/foto
  (`player.image_path`) testleri için.
- `standingsLaLiga.json` — `GET /standings/seasons/27965?include=participant;
  details.type` (La Liga). 2 satır: FC Barcelona (1. sıra, TÜM 22 gerçek
  `details[]` kaydı — Overall/Home/Away × 6 + Goal Difference + 3 Points
  satırı, yazım hatalı `"Overal Goals Scored"` dahil) ve Real Madrid (2. sıra,
  `details` YOK — pivot fonksiyonunun eksik-veri fallback'ini test etmek için).
- `topscorersGoals.json` — `GET /topscorers/seasons/27965?filters=
  seasonTopscorerTypes:208`, ilk 3 satır (Raphinha 9 gol dahil).
- `topscorersCards.json` — aynı endpoint, `filters=seasonTopscorerTypes:83,84`
  (kombine filtre — GERÇEK istekle "birlikte çalışıyor mu" diye ayrıca test
  edildi, doğrulandı). Mario Martín (player_id 37601802) hem `type_id:83`
  (1 kırmızı) hem `type_id:84`de (3 sarı) göründüğü için BİLİNÇLİ OLARAK dahil
  edildi — `getTopDisciplinary`'nin oyuncu bazlı birleştirme (merge) mantığını
  gerçek, çakışan bir örnekle test etmek için.
- `squadBarcelona.json` — `GET /squads/teams/83?include=player`, ilk 4 satır.
- `seasonsLaLiga.json` — `GET /leagues/564?include=seasons`, 3 sezon (Pass 4
  ile aynı veri, bu turda tazelendi) — `is_current:true` (2026/2027) dahil.
- `headToHeadBarcaMadrid.json` — `GET /fixtures/head-to-head/83/3468?
  include=participants;scores;state` (FC Barcelona – Real Madrid), ilk 4
  sonuç, `scores[]` dahil (form/W-D-L türetme testleri için gerçek skor
  gerekiyordu — `getTeamsHead2Head`'in `deriveMatchFormLetter`'ı).
- `teamLastMatchesRealMadrid.json` — `GET /fixtures/between/2026-06-21/
  2026-09-18/3468` (Real Madrid, parametre sırası: start/end/team_id — Pass
  4'teki düzeltmenin bu turda tekrar doğrulanması), 7 gerçek maç.

## Faz 4 (Doğrulama — kalan kontrat testleri/açık noktalar) — 2026-09-18

- `groupEuropaLeague.json` — `GET /fixtures/between/2022-09-01/2022-12-01?
  filters=fixtureLeagues:5&include=participants;group;state` (2022/23 Avrupa
  Ligi grup aşaması, Zürich 0-1 Arsenal, fixture 18674352, `group.name:"Group
  A"`) — `mapSportmonksFixtureToMatch`'in daha önce HİÇ test edilmemiş
  `group_name`/`group_id` dalını kapatmak için (Pass 3 Soru 2'nin metinde kalan
  örneğinin taze/gerçek karşılığı).
- `standingsGroupedEuropaLeague.json` — `GET /standings/seasons/20090?
  include=participant` (aynı 2022/23 sezonu), 2 farklı `group_id`'den
  (247770=Arsenal'in grubu, 247772) 2'şer satır — `getCompetitionTableFull`'ın
  `group_id` filtresi daha önce hiç test edilmemişti (mevcut fixture'ların
  hepsi `group_id:null`'dı).
- `attemptsOnGoalVerification.json` — iki bağımsız maçın (fixture 19746621
  Süper Lig + fixture 19732740 La Liga) `include=statistics` çıktısından
  `type_id` 41/42/49/50/54/58/86 satırları — `MatchStatsData.attempts_on_goal`
  için Pass 5'in belirsiz bıraktığı 42 ("Shots Total") vs 54 ("Goal Attempts")
  sorusunu KESİNLEŞTİRMEK için: `42 = 41+58+86 = 49+50` (4/4 takım-satırında
  sıfır sapma), `54` bu toplamla hiç örtüşmüyor.
- `squadBarcelonaHistoric.json` — `GET /squads/seasons/25659/teams/83?
  include=player` (FC Barcelona, 2025/2026 sezonu geçmiş kadrosu) — güncel
  kadro (`squadBarcelona.json`) ile AYNI şekli varsaydığımız ama hiç ayrıca
  doğrulanmamış geçmiş-kadro endpoint'i için. Gerçekte BENZER ama AYNI DEĞİL:
  `captain`/`start`/`end` yok, ayrı bir kota havuzundan (`PlayerStatistic`)
  sayılıyor.

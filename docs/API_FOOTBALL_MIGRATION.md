# Sportmonks → API-Football geçişi: keşif, veri testi ve plan

**Tarih:** 2026-09-29 · **Kapsam:** kod değişikliği yok; bu belge + `src/services/apiFootball/__fixtures__/` (gerçek cevaplar).
**Anahtar güvenliği:** `API_FOOTBALL_KEY` / `SPORTMONKS_API_KEY` yalnızca `.env.local`'dan okundu, hiçbir log/dosya/commit'e yazılmadı
(fixture klasöründe anahtar izi taraması temiz). Sportmonks cevaplarından `subscription`/`rate_limit` alanları silinerek kaydedildi.

---

## 0. Önce okunması gerekenler (engelleyiciler)

1. **`.env.local`'daki API-Football anahtarı Ultra değil, Free.** `GET /status` → `plan:"Free"`, `limit_day:100`, 10 istek/dk.
   Free planın gerçek hataları (`__fixtures__/freePlanErrors.json`):
   - `season=2026` → *"Free plans do not have access to this season, try from 2022 to 2024."*
   - `ids=` → *"Free plans do not have access to the Ids parameter."*
   - `last=` → *"…do not have access to the Last parameter."*
   - `date=` yalnızca **bugün ±1 gün** (2026-09-28…30).

   Sonuç: 2026/27 Süper Lig, Şampiyonlar Ligi ve Türkiye Kupası maçları **bu anahtarla çekilemiyor**. Doğrulama 2024/25'in aynı türden
   maçlarıyla yapıldı (cevap şeması sezondan bağımsız). **28 Eylül Türkiye–İtalya ise tarih penceresine girdiği için gerçek haliyle çekildi.**
   `fixtures?ids=` (canlı detay toplu çekimi) Ultra anahtarı gelince tek istekle yeniden doğrulanmalı (bkz. §2.6).
2. **Sportmonks deneme süresi 2 gün sonra bitiyor.** Canlı `subscription` alanı: `"Growth - Trialing until 2026-10-01 13:21:31"`
   (+ `Euro Club Tournaments`). 1 Ekim'de ücretliye dönmezse site 1–9 Ekim arası veri alamaz ve "geri dönüş yolu" da kalmaz.
   **Karar gerekiyor:** ya Sportmonks'u bir ay ücretli tut (geri dönüş sigortası), ya da 1 Ekim'den itibaren API-Football'a erken geç
   (bkz. §6 Faz 0).
3. **ID çakışması gerçek bir risk.** API-Football fixture id'leri (ör. `1528905`) eski livescore-api.com id'leriyle (ör. `1853411`)
   **aynı büyüklükte**. Takım id'leri küçük tam sayılar ve iki sağlayıcıda da çakışıyor (API-Football Galatasaray=645; Sportmonks
   Fenerbahçe=88, Beşiktaş=554…). Veritabanına sağlayıcı alanı eklenmeden geçilirse eski bir analiz/yorum/tahmin yeni bir maça yapışabilir
   ve favoriler rastgele takımlara döner (§5).

**Kullanılan istek:** API-Football 43 (Free günlük 100'ün içinde; 4'ü plan hatası), Sportmonks 11.

---

## 1. Eşleşme tablosu

Kısaltmalar: **AF** = API-Football v3 (`v3.football.api-sports.io`), **SM** = Sportmonks v3.
AF'de "include" yoktur: `fixtures?id=` (ve Ultra'da `fixtures?ids=`, en fazla 20) **events + lineups + statistics + players**'ı tek cevapta döner.

### 1.1 `liveScoreService` fonksiyonları

| Fonksiyon | SM (bugün) | AF karşılığı | Not |
|---|---|---|---|
| `getAllLiveMatches` / `getLiveMatches` | `livescores/inplay` (sayfalı) | `fixtures?live=all` veya `fixtures?live=203-204-206-2-3-848-5-39-78-140-135-61-1` | Sayfalama yok, tek cevap. **Olaylar cevapta hazır** (`events[]`) — gündem botu ek istek atmaz. Kadro/istatistik yok → `fixtures?ids=`. |
| `getFixturesByDate` / `getTodayFixtures` / `getAllMatchesByDate` / `getMatchesByDate` | `fixtures/date/{d}` | `fixtures?date=YYYY-MM-DD&timezone=Europe/Istanbul` | Tek cevap, tüm ligler (28 Eyl: 94, 30 Eyl: 202 maç). Lig filtresi bizde. |
| `getFixturesByCompetition` / `getAllCompetitionHistoryMatches` | `fixtures/between/{a}/{b}?filters=fixtureLeagues:{id}` | `fixtures?league={id}&season={yıl}` (+ `from`/`to` ya da `round`) | SM'deki "filtre sessizce uygulanmadı" riski yok; `season` parametresi zorunlu. |
| `getCompetitionGroupFixtures` | `fixtures/between` + grup | `fixtures?league&season&round=` ; tur listesi `fixtures/rounds?league&season` | Grup adı fixture'da yok, puan tablosundaki `group` alanından. |
| `findMatchById` | `fixtures/{id}?include=…` | `fixtures?id={id}` | Tek istek her şeyi getirir. |
| `findMatchByTeamIds` | `fixtures/between/…/{team}` | `fixtures/headtohead?h2h={a}-{b}&next=1` / `&last=1` | `last`/`next` yalnızca ücretli planda. |
| `getTeamHistoryMatches` / `getTeamLastMatches` | `fixtures/between/{-89g}/{bugün}/{team}` | `fixtures?team={id}&last=10` (ya da `&season=`) | |
| `getTeamUpcomingFixtures` | `teams/{id}?include=upcoming…` | `fixtures?team={id}&next=10` | "Saat belli değil" → AF'de `status.short="TBD"`. SM'deki `00:00 + has_odds` kuralı gerekmiyor. |
| `getTeamsHead2Head` | `fixtures/head-to-head/{a}/{b}` + 2× `between` | `fixtures/headtohead?h2h={a}-{b}` | GS–TS: 36 maç, **tarih sırasız geliyor** → bizde sıralanmalı. Tüm turnuvalar (Lig/Kupa/Süper Kupa) karışık. |
| `getMatchWithEvents` | `…;events` | `fixtures?id=` → `events[]` | §1.3 |
| `getMatchStats` | `…?include=statistics` | `fixtures?id=` → `statistics[]` (ya da `fixtures/statistics?fixture=`) | §1.4 |
| `getMatchLineups` | `…lineups.player.nationality;lineups.details` | `fixtures?id=` → `lineups[]` + `players[]` | §1.5 |
| `getSeasonsList` | `leagues/{id}?include=seasons` | `leagues?id={id}` → `seasons[]` (her sezonda `coverage`) | `coverage` bayrakları UI'da "veri yok" durumunu önceden bilmemizi sağlar. |
| `getCompetitionTableFull` / `getLeagueTable` | `standings/seasons/{sid}?include=participant;details.type` + pivot | `standings?league={id}&season={yıl}` | Pivot gerekmez: `all/home/away.{played,win,draw,lose,goals.for/against}`, `points`, `goalsDiff`, `form`, `description`. **Gruplar:** `standings` bir dizi dizisi — Uluslar Ligi 2024: 14 grup (`group:"League B, Group 4"`), UCL 2024 lig aşaması tek tablo (36). |
| `getTopScorers` | `topscorers/seasons/{sid}?filters=seasonTopscorerTypes:208` (+209) | `players/topscorers?league&season` + `players/topassists` | **En fazla 20 oyuncu** (gerçek: 20/19). Oyuncunun o ligdeki M/dk/şut/pas/reyting'i cevapta hazır. |
| `getTopDisciplinary` | `…seasonTopscorerTypes:83,84` + birleştirme | `players/topyellowcards` + `players/topredcards` | İkisi de ≤20 (gerçek: 18/18). Birleştirme `player.id` ile aynı kalır. |
| `getTopScorerAppearances` | takım başına `squads/seasons/{sid}/teams/{tid}?include=player.statistics.details` | **gerek yok** — `players/topscorers` satırında `games.appearences` var | N istek → 0 ek istek. |
| `getTeamSquads` | `squads/teams/{id}?include=player` | `players/squads?team={id}` | Yalnızca güncel kadro; `position` = Goalkeeper/Defender/Midfielder/Attacker, uyruk yok. |
| `getTeamSquadStats` / `getTeamTopScorers` (M/G/A/SK/KK) | `squads/seasons/…?include=player.statistics.details` | `players?team={id}&season={yıl}` (sayfalı, 20/sayfa; GS 2024: 4 sayfa) | Oyuncu × turnuva satırı: `games.appearences`, `goals.total/assists`, `cards.yellow/yellowred/red`, `games.position`, `games.rating`. `league.id` ile lig süzülür. **Uyruk burada var** (`player.nationality`). |

### 1.2 Maç özeti alanları (`sportmonksFixtureMapper`)

| `Match` alanı | SM | AF | Doğrulama |
|---|---|---|---|
| `id` | `id` | `fixture.id` | |
| `status` (4 kova) | `state_id` (26 durum) | `fixture.status.short` | Eşleme: `TBD,NS,PST`→NOT STARTED · `1H,2H,ET,P,LIVE`→IN PLAY · `HT,BT,SUSP,INT`→HALF TIME BREAK · `FT,AET,PEN,CANC,ABD,AWD,WO`→FINISHED. (SM tablosundaki kararlarla aynı anlam.) |
| `time` (canlı dakika) | `periods[].ticking` → `minutes` | `status.elapsed` + `status.extra` | Canlıda: `1H:41`, `2H:57`; bitmişte `FT elapsed:90 extra:11`. Etiket: `extra ? "90+4'" : "57'"`. Saniye yok (SM'de vardı). |
| `date`/`scheduled` | `starting_at` (UTC string) | `fixture.date` (ISO, `timezone` parametresiyle) + `timestamp` | `timezone=Europe/Istanbul` verilirse dönüşüm AF'de. |
| `scores.score` (MS) | `CURRENT` | `goals.home/away` | **Toplam skor her zaman `goals`'tan.** |
| `scores.ht_score` (İY) | `1ST_HALF` | `score.halftime` | |
| `scores.ft_score` | `2ND_HALF` | `score.fulltime` | ⚠ Uzatmalı maçta 90' skoru olmalı; bkz. veri kalitesi notu. |
| `scores.et_score` | `ET` | `score.extratime` (**yalnızca uzatmada atılan goller**) | Bursaspor–Vanspor: `goals 2-2`, `extratime 1-0`. |
| `scores.ps_score` | `PENALTY_SHOOTOUT` | `score.penalty` | 6-7 iki sağlayıcıda aynı. |
| `round` / `stage` | `round.name` / `stage.name` | `league.round` tek string | `"Regular Season - 16"` → round=16, stage=Regular Season; `"League B - 2"`, `"Play-offs A/B"`, `"4th Round"`, `"Final"`, `"Group Stage - 3"`. Ayrıştırıcı: `/^(.*) - (\d+)$/` → stage + round, eşleşmezse tamamı stage. |
| `referee` | `referees[type 6].referee` (4 hakem) | `fixture.referee` (yalnızca orta hakem, kısaltılmış) | Milli maçta `"Michael Oliver"`, ligde `"K. Sağlam"`; bazen `"Rohit Saggi, Norway"` (ülke virgülle). **Yardımcı hakem/VAR bilgisi yok.** |
| `location` | `venue.{name,city_name,capacity}` | `fixture.venue.{id,name,city}` | Kapasite yok (`venues?id=` ile ayrıca alınabilir, 30 gün cache). Uluslar Ligi 2024 maçlarında `venue.id:null`. |
| `competition` | `league` + `sub_type` | `league.{id,name,logo,country,flag,season}` + `leagues?id` → `league.type` (`League`/`Cup`) | `is_cup` doğrudan `type`'tan. |
| `country` | `league.country` | `league.country` + `league.flag` | |
| `home`/`away` | `participants[meta.location]` | `teams.home/away.{id,name,logo,winner}` | |
| `group_name` | `group.name` | standings `group` alanı | Fixture'da grup yok. |

### 1.3 Olaylar (`mapSportmonksEvents`)

| SM `type_id` | AF `type` / `detail` |
|---|---|
| 14 Goal | `Goal` / `Normal Goal` |
| 15 Own Goal | `Goal` / `Own Goal` |
| 16 Penalty | `Goal` / `Penalty` |
| 17 Missed Penalty | `Goal` / `Missed Penalty` (maç içi) |
| 22/23 Seri penaltı kaçan/atılan | `Goal` / `Missed Penalty` \| `Penalty` + **`comments:"Penalty Shootout"`**, `time.elapsed:120, extra:N` |
| 18 Substitution | `subst` / `Substitution N` |
| 19/20/21 kartlar | `Card` / `Yellow Card` (gözlendi) · `Red Card`, `Second Yellow card` (AF dokümanı; bu maçlarda gözlenmedi) |
| 10 VAR | `Var` / `Penalty confirmed`, `Goal Disallowed - offside` (gözlendi; diğer `detail` değerleri serbest metin) |

**Oyuncu değişikliği yönü — 4 maç, 39 değişiklikte doğrulandı (GS–TS 9, PSG–Inter 10, TÜR–MAC 10, TÜR–İTA 10):**
**AF'de `player` = ÇIKAN, `assist` = GİREN.** Her örnekte `player` ilk 11'de, `assist` yedekte. Tek "istisna" gibi görünen
PSG–Inter 62' (`player: Bisseck [yedek]`) aslında 54'te girip 62'de sakatlanarak çıkan Bisseck — kural yine tutuyor.
**SM'de tersi:** `player_id` = giren, `related_player_id` = çıkan (aynı maçlarda yan yana doğrulandı). Bugünkü `EventTimeline`
yalnızca `event.player.name`'i basıyor → adaptör **`assist`'i `player`'a** yazmazsa çıkan oyuncu "giren" gibi görünür.
Öneri: `MatchEvent`'e `related_player` ekleyip ikisini de göstermek.

Diğer olay farkları:
- **AF olaylarında `id` yok.** `MatchEvent.id` ve gündem botunun `externalKey = goal:{fixtureId}:{eventId}` anahtarı sentetik olmalı:
  `goal:{fixtureId}:{teamId}:{elapsed}:{extra ?? 0}:{sıra}`. AF sonradan golcüyü/dakikayı düzeltirse çift taslak riski →
  bot, aynı takım + aynı dakika için "düzeltme" olarak eşleştirmeli.
- **Sıralama güvenilmez:** GS–TS'de `90+10` olayı `90+8`'den önce geliyor → `elapsed*100 + extra` ile sırala.
- **Seri penaltı verisi alt turlarda bozuk:** Bursaspor–Vanspor (Kupa 4. tur) 16 atış için **52 satır** (39 "Missed Penalty").
  Seri penaltı olaylarını (`comments==="Penalty Shootout"`) `player.id + detail` ile tekilleştir; skor için yalnızca `score.penalty`'ye güven.
- **Asist bilgisi** gollerde `assist` alanında geliyor (SM'de ayrı olay yoktu) — bonus.

### 1.4 Maç istatistikleri (`STAT_FIELD_TYPE_IDS`)

AF bir maçta **16–18 tür** döndürüyor (lig/UCL: 18; TÜR–İTA: 16, xG yok ama "Free Kicks" var). SM aynı maçlarda **35–43 tür**
(Kupa 4. tur: SM 11, AF 0).

| `MatchStatsData` alanı | SM type_id | AF `type` | Durum |
|---|---|---|---|
| `shots_on_target` | 86 | `Shots on Goal` | ✅ |
| `shots_off_target` | 41 | `Shots off Goal` | ✅ |
| `attempts_on_goal` | 42 | `Total Shots` | ✅ |
| `shots_blocked` | 58 | `Blocked Shots` | ✅ |
| `corners` | 34 | `Corner Kicks` | ✅ |
| `offsides` | 51 | `Offsides` | ✅ |
| `possesion` | 45 | `Ball Possession` (`"58%"` → 58) | ✅ string parse |
| `fauls` | 56 | `Fouls` | ✅ |
| `saves` | 57 | `Goalkeeper Saves` | ✅ |
| `yellow_cards` / `red_cards` | 84 / 83 | `Yellow Cards` / `Red Cards` | ✅ (`null` → 0) |
| `free_kicks` | 55 | `Free Kicks` | ⚠ bazı maçlarda var |
| `substitutions` | 59 | — | 🔁 olaylardan say |
| `penalties` | 47 | — | 🔁 olaylardan say (maç içi `Penalty` + `Missed Penalty`) |
| `attacks` / `dangerous_attacks` | 43 / 44 | — | ❌ **AI prompt'u `dangerous attacks` kullanıyor** → prompt'tan çıkar |
| `goal_kicks` / `throw_ins` / `treatments` | 53 / 60 / 87 | — | ❌ |
| *(yeni)* | — | `expected_goals`, `goals_prevented`, `Total passes`, `Passes accurate`, `Passes %`, `Shots insidebox/outsidebox` | ➕ **xG SM planımızda yoktu**, AF'de var |

### 1.5 Kadro (`mapSportmonksLineups`)

| `LineupPlayer` | SM | AF | Not |
|---|---|---|---|
| `id`, `name` | `player_id`, `player.display_name` | `lineups[].startXI/substitutes[].player.{id,name}` | AF kısaltılmış ad ("F. Muslera"); tam ad `players[].player.name`'de. |
| `shirt_number` | `jersey_number` | `player.number` | |
| `substitution` | `type_id 11/12` | `startXI` / `substitutes` | |
| `position` (G/D/M/F) | `position_id 24–27` | `player.pos` `G/D/M/F` | Kupa finalinde `pos:null`. |
| `pos_code` (detaylı) | `player.detailed_position_id` | **yok** | §3.1 — formation + grid'den türet. |
| `formation_row/col` | `formation_field "r:c"` | `player.grid "r:c"` | ⚠ **sütun yönü ters** (aşağıda). |
| formasyon etiketi | `formations[]` | `lineups[].formation` | Kupa finalinde `null`. |
| `photo` | `player.image_path` | `https://media.api-sports.io/football/players/{id}.png` (kota harcamaz) | `players[].player.photo`. |
| `rating` | `details[type 118]` | `players[].statistics[0].games.rating` (string) | GS–TS: AF 29, SM 31 oyuncu; değerler yakın ama farklı model (Mertens AF 8.9 / SM 8.52, Muslera 6.5 / 5.92). |
| `nationality{name,flag}` | `player.nationality` | **kadroda yok** | §3.6 |
| teknik direktör | — | `lineups[].coach.{id,name,photo}` | ➕ |
| forma renkleri | — | `lineups[].team.colors` | ➕ saha görünümü için |

**Grid sütun yönü — 4 maç, 8 takımda doğrulandı:** AF'de **sütun 1 = takımın SOL kanadı**, en büyük sütun = SAĞ.
Örnekler: PSG 4-3-3 `2:1 Nuno Mendes (SB) … 2:4 Hakimi (SĞB)`, `4:1 Kvaratskhelia … 4:3 Doué`; Inter 3-5-2 `3:1 Dimarco … 3:5 Dumfries`;
Macaristan `3:1 Kerkez … 3:4 Bolla`; TÜR–İTA'da İtalya `2:1 Ruggeri … 2:4 Kayode`, Türkiye `3:1 Elmalı … 3:4 Oğuz Aydın`.
**SM'de tersi** (aynı maç: Hakimi `2:1`, detailed_position 154=Sağ bek). `Lineup/index.tsx` SM'e göre yazıldığı için adaptör
**satır içinde sütunu aynalamalı** (`col' = satırdakiOyuncuSayısı + 1 − col`); böylece UI'ya dokunmadan kanatlar doğru tarafta kalır.

### 1.6 Oyuncu, transfer, kupa, sakat/cezalı

| Özellik | SM | AF | Not |
|---|---|---|---|
| Profil (`playerProfile.ts`) | `players/{id}?include=…` | `players/profiles?player=` (kimlik, boy/kilo, doğum, uyruk, forma no, mevki) + `players?id=&season=` (turnuva bazlı sezon istatistiği) | Tercih edilen ayak **yok**. |
| Sezon listesi | `statistics.season` | `players/seasons?player=` (Osimhen: 2015–2026) | |
| Sezon istatistik grupları (`PLAYER_STAT_GROUPS`) | 39 type_id | `games` (M, ilk 11, dk, reyting), `shots.total/on`, `goals.total/assists/conceded/saves`, `passes.total/key/accuracy`, `tackles.total/blocks/interceptions`, `duels.total/won`, `dribbles.attempts/success/past`, `fouls.drawn/committed`, `cards`, `penalty.won/commited/scored/missed/saved` | **Karşılığı yok:** 580/581 büyük şans, 98/99 orta, 107 hava topu, 101 uzaklaştırma, 94 top kaybı, 194 gol yemeden, 214/215 takım G/B, 27255. |
| Maç maç reyting geçmişi (`playerLineups.ts`, `/api/players/[id]/matches`, `/vs`) | `players/{id}?include=lineups.fixture…` (tek istek) | **Tek uçta yok** — yalnızca `fixtures/players?fixture=` (maç başına) | §3.7 — kendi `PlayerMatchStat` tablomuz. |
| Transferler | `transfers.*` | `transfers?player=` → `{date,type,teams.in/out}` | Bonservis `type` içinde string: `"€ 70M"`, `"Loan"`, `"N/A"` → parse. |
| Kupalar | kullanılmıyor | `trophies?player=` / `?coach=` → `{league,country,season,place}` | ➕ yeni; id yok, string. |
| Sakat/cezalı | kullanılmıyor | `sidelined?player=` (geçmiş) · `injuries?fixture=` / `?league&season` / `?date=` (maç öncesi eksikler: `type:"Missing Fixture"`, `reason:"Knee Injury"`) | ➕ AI analizine "eksikler" girdisi. Süper Lig `injuries:true`, 1. Lig/Kupa `false`. |
| Teknik direktör | — | `coachs?team=` | ➕ |
| Takım sezon istatistiği | — | `teams/statistics?league&season&team` → `form`, `goals.for/against.average`, `clean_sheet`, `failed_to_score`, `biggest`, `lineups` (en çok kullanılan dizilişler), `cards` dakika dağılımı | ➕ AI bağlamı için hazır metrikler (bugün 10 maçtan türetiliyor). |
| Takım arama (`useTeamSearch`) | `teams/search/{q}` | `teams?search=` (min 3 harf) | Öneri: takipteki liglerin takımlarını DB'ye alıp aramayı yerelde yapmak. |
| Favoriler (`FavoritesTab`) | `teams/{id}`, `leagues/{id}` | `teams?id=`, `leagues?id=` | Logo URL'leri deterministik: `media.api-sports.io/football/teams/{id}.png` → istek gerekmez. |

### 1.7 AI analiz bağlamı (`buildMatchAnalysisContext` → `analysisPrompt.ts`)

| Prompt girdisi | Bugün | AF |
|---|---|---|
| Takım adları, lig, tarih, skor, İY, hakem, stadyum | `Match` | `fixtures?id=` (hakem yalnızca orta hakem) |
| G/B/M, maç başı gol, gol yemeden oranı, KG oranı, iç/dış saha galibiyet, form | son 10 maçtan türetiliyor | Aynı hesap `fixtures?team&last=10` ile **veya** `teams/statistics` hazır alanları (1 istek/takım) |
| Sıra/puan/averaj | `getCompetitionTableFull` | `standings` |
| H2H toplamları, son 3 karşılaşma | `getTeamsHead2Head` | `fixtures/headtohead` (sırala) |
| Canlı: topla oynama, şut, korner, **tehlikeli atak**, kart | `getMatchStats` | Tehlikeli atak **yok** → prompt şablonundan çıkar, yerine **xG** ekle |
| Oran sinyali | `match.odds` (SM doldurmuyordu) | `odds` (lig `coverage.odds:false` — değişmez) |
| *(yeni, önerilen)* eksik oyuncular | — | `injuries?fixture=` |

`events` ve `lineups` bağlamda var ama prompt'a hiç yazılmıyor — adaptör sırasında bunları taşımaya gerek yok.

---

## 2. Gerçek istekle doğrulama

### 2.1 Seçilen maçlar

| Tür | AF id | SM id | Maç | Neden bu maç |
|---|---|---|---|---|
| Süper Lig (bitmiş) | 1237986 | 19172147 | Galatasaray 4-3 Trabzonspor (16.12.2024) | 7 gol, penaltı, kendi kalesine, VAR, 90+10 olayı |
| Şampiyonlar Ligi (bitmiş) | 1374812 | 19391309 | PSG 5-0 Inter (Final, 31.05.2025) | 4-3-3 vs 3-5-2 → grid yönü için ideal |
| Uluslar Ligi — **gerçek hedef maç** | **1528905** | — (SM planında yok) | **Türkiye 1-4 İtalya (28.09.2026, League A - 2)** | İstenen maç; Free tarih penceresine girdi |
| Uluslar Ligi (yedek) | 1316553 | — | Türkiye 3-1 Macaristan (Play-off, 20.03.2025) | 4-2-3-1 vs 3-4-3 |
| Türkiye Kupası (final) | 1373028 | 19397484 | Trabzonspor 0-3 Galatasaray (14.05.2025) | Kupada üst düzey maç |
| Türkiye Kupası (alt tur) | 1315108 | 19326542 | Bursaspor 2-2 Vanspor, pen. 6-7 (4. tur) | Uzatma + seri penaltı + zayıf kapsam |

Her maç için tek istek: `fixtures?id=` (events/lineups/statistics/players dahil). SM tarafı mevcut include setiyle çekildi.
Yan yana özet: `__fixtures__/sportmonksPair/comparison.json`.

### 2.2 Yan yana sonuçlar

| | GS–TS (Lig) | PSG–Inter (UCL) | TS–GS (Kupa finali) | Bursaspor–Van (Kupa 4. tur) | TÜR–İTA (UNL) |
|---|---|---|---|---|---|
| Olay sayısı AF / SM | 23 / 25 | 20 / 22 | 19 / 19 | 67 (52'si bozuk seri pen.) / 36 | 18 / — |
| İstatistik türü AF / SM | 18 / 43 | 18 / 40 | **0** / 35 | **0** / 11 | 16 / — |
| Reytingli oyuncu AF / SM | 29 / 31 | 30 / 32 | **0** / 32 | 0 / 0 | 46 / — |
| Formasyon AF / SM | 4-2-3-1 ×2 / aynı | 4-3-3, 3-5-2 / aynı | **null** / 4-2-3-1 ×2 | 4-2-3-1 ×2 (iki takımda da birebir aynı grid — şüpheli) / aynı | 3-4-3, 4-3-3 |
| Grid'li ilk 11 AF / SM | 22 / 22 | 22 / 22 | **0** / 22 | 22 / 22 | 22 |
| Hakem | 1 / 4 kişi | 1 / 1 | 1 / 4 | 1 / 4 | 1 |
| Stadyum | "RAMS Park" / "Rams Park" (+kapasite) | aynı | aynı | **farklı stat** (AF: Yüzüncü Yıl Atatürk Sütaş, SM: Matlı) | Bursa Büyükşehir |
| Round/Stage | `"Regular Season - 16"` / round 16 + stage | `"Final"` / stage Final | `"Final"` | `"4th Round"` | `"League A - 2"` |

### 2.3 Değişiklik yönü

Bkz. §1.3: **AF `player`=çıkan, `assist`=giren**, SM'de tersi. 4 maçta 39/39 tutarlı.

### 2.4 Grid sütun yönü

Bkz. §1.5: **AF sütun 1 = sol**, SM'de sütun 1 = sağ. 8 takımda (ev + deplasman) tutarlı. Adaptörde satır içi aynalama.

### 2.5 Veri kalitesi bulguları (adaptör kuralları)

1. **Alt tur kupa maçlarında `score` nesnesi olaylarla çelişebiliyor.** Bursaspor–Vanspor: 4 golün hepsi 65–89'da (olaylar ve SM ile
   uyumlu, 90' skoru 2-2), ama AF `score.fulltime 1-2`, `score.extratime 1-0`. Kural: MS = `goals`; İY = `score.halftime`;
   `ft/et` yalnızca `status ∈ {AET, PEN}` iken ve `fulltime + extratime == goals` tutarlıysa gösterilir.
2. Seri penaltı olayları tekrarlı (§1.3).
3. Kupa finalinde bile formasyon/grid/pos/istatistik/reyting yok (§3.2).
4. `players[]` içinde oynamayan yedeklerin `minutes:null, rating:null` gelmesi normal (GS–TS: 42 satırdan 11).

### 2.6 Canlı veri şekli (`fixtures?live=all`, 2026-09-29, 16 maç)

`status:{short:"2H",elapsed:57,extra:null}`, `goals`, `score.halftime` dolu, **`events[]` dahil**, lineups/statistics yok.
Canlı detay için Ultra'da `fixtures?ids=a-b-…` (≤20). Free'de reddedildiği için **Ultra anahtarı gelince ilk iş**:
bir hafta sonu canlı penceresinde `fixtures?live=all` → id'ler → `fixtures?ids=` ile 20'lik parti; cevabın `fixtures?id=` ile aynı
şekilde olduğunu ve dakika/olay tazeliğini (AF: ~15 sn) ölç.

### 2.7 Kaydedilen test fixture'ları

`src/services/apiFootball/__fixtures__/` — 31 AF cevabı (değiştirilmeden, sıkıştırılmış JSON) + `sportmonksPair/` (aynı 4 maçın SM
cevabı; `lineups.details` yalnızca reyting (118) satırına indirildi) + `freePlanErrors.json`. Liste için klasördeki `README.md`.

---

## 3. Kaybolan/zayıflayan özellikler ve UI çözümü

### 3.1 Detaylı mevki kodları (`pos_code`: SB/STP/SĞB/DOS/OOS/SLK/SĞK/SF…)
AF kadroda yalnızca `G/D/M/F` + `formation` + `grid` veriyor. **Maça özgü rolü diziliş + grid'den türet** (bugün okunan
`lineups.player.detailed_position_id` oyuncu varlığının profil mevkisi, maçtaki rolü değil — türetme bu açıdan daha isabetli olabilir).
Kurallar (AF sütun 1 = sol):
- Satır 1 → KL.
- Savunma satırı (satır 2): 4 veya 5 kişi → ilk = SLB, son = SĞB, ortadakiler STP; 3 kişi → hepsi STP.
- Son satır: 1 → SF; 2 → SF, SF; 3 → SLK, SF, SĞK.
- Aradaki satırlar: 2 ara satır varsa (4-2-3-1, 4-1-4-1…) ilk = DOS (1–2 kişi) / MO (3+); ikinci = 3 kişi → SLK, OOS, SĞK; 4 kişi → SLO, MO, MO, SĞO.
  Tek ara satır (4-3-3, 4-4-2, 3-5-2): 5 kişi → SLKB, MO, MO, MO, SĞKB; 4 kişi → SLO, MO, MO, SĞO; 3 kişi → MO.
- Grid yoksa (kupa, bazı alt ligler) → yalnızca G/D/M/F rozeti; `formation` yoksa saha değil liste görünümü (`buildFormationLayout`'un
  zaten var olan `position` yedeği; `pos` de yoksa tek "Kadro" listesi, forma no sırası).
- Kadro sayfası (`TeamDetailView` detaylı mevki) → `Kaleci/Defans/Orta saha/Forvet` gruplamasına iner. Maç kartlarında son maçlardaki
  en sık türetilmiş rol ileride `PlayerMatchStat`'tan gösterilebilir.

### 3.2 Türkiye Kupası'nda kadro/istatistik/reyting yokluğu
Lig kapsaması (`leagues?id=206`) **2026 sezonu: `lineups:false, statistics_fixtures:false, statistics_players:false, players:false,
top_scorers:false`**. 2024'te bayrak `true` olsa da finalde bile formasyon/grid/istatistik/reyting gelmedi (SM aynı maçta 35 istatistik
+ 32 reyting veriyordu). UI:
- `leagues` `coverage`'ı günlük cache'le, maç sayfası sekmelerini buna göre aç/kapat ("Bu turnuva için istatistik sağlanmıyor"
  bilgi satırı; boş iskelet değil).
- Kadro geldiyse ama grid yoksa → liste görünümü (§3.1).
- Kupa krallığı: `top_scorers:false` → bizim `events` arşivimizden gol/asist sayımı (goller her zaman var).
- AI analizi: kupa maçında `liveStats` yok → prompt "istatistik yok" dalına düşmeli (bugün zaten `null` destekli).

### 3.3 16–18'e karşı 43 istatistik türü
Maç istatistik bileşeni yalnızca mevcut alanlarla çalışıyor; kaybolan 6 alan (`attacks`, `dangerous_attacks`, `goal_kicks`,
`throw_ins`, `treatments`, bazen `free_kicks`) satır olarak gizlenir (bileşen zaten `null` alanı atlıyor). Kazanılanlar
UI'ya eklenmeli: **xG** (öne çıkarılacak), pas sayısı/isabet %, ceza sahası içi/dışı şut, "kurtarılan gol" (goals_prevented).
Net etki: kullanıcı tarafında belki artı (xG).

### 3.4 Saatlik puan durumu
AF `standings` saatte bir güncelleniyor (`update` alanı). Maç bittikten ≤60 dk tablo eski kalabilir. Çözüm: **canlı/son biten
maçlardan puan tablosunu kendimiz projekte edelim** — `standings` cevabı + o ligde `update`'ten sonra biten/süren maçların
`goals`'ı → P/G/B/M/A/Y/Puan ve sıralama yeniden hesaplanır, satırda "canlı" işareti. Süper Lig'de eşit puanda önce ikili
averaj uygulandığı için projeksiyon yalnızca O/G/B/M/A/Y/Puan'ı günceller; eşit puanlı takımlar arasında AF'nin son sırası korunur.

### 3.5 20 oyunculuk krallık listesi
`topscorers/topassists/topyellowcards/topredcards` ≤20. Çoğu UI için yeterli (gündem botunun "krallıkta X. sıra" cümlesi de).
Daha uzun liste veya kupa: `players?league&season` (sayfalı, 20/sayfa; Süper Lig için onlarca sayfa — tahmin, ölçülmedi — günde 1 kez) ya da kendi
`PlayerMatchStat` toplamlarımız. MVP: 20 + "tam liste" düğmesini ertele.

### 3.6 Uyruk / bayrak için ek çağrı
Kadro cevabında uyruk yok; `players?team&season` ve `players/profiles` içinde **string** (`"Nigeria"`, `"Türkiye"`, `"Côte d'Ivoire"`).
Bayrak: `countries` (171 kayıt, `{name, code, flag}`), haftalık cache. ⚠ İsimler eşleşmiyor: `"Türkiye"` ve `"Côte d'Ivoire"`
`countries` listesinde yok (orada `"Turkey"`…) → küçük bir takma ad tablosu (`Türkiye→TR`, `Côte d'Ivoire→CI`, …). Oyuncu→uyruk
eşlemesi `players?team&season` senkronundan (takım başına günde 1–4 istek) `Player` tablosuna yazılır; kadroda istek atılmaz.

### 3.7 Oyuncu maç geçmişi / reyting grafiği / "rakibe karşı" (bugün SM tek istek)
AF'de oyuncu bazlı maç listesi yok. Çözüm: biten her takipli maçın `players[]`'ını `PlayerMatchStat(provider, fixtureId, playerId,
teamId, minutes, rating, goals, assists, …)` tablosuna yaz (zaten `fixtures?ids=` ile çekiyoruz, ek istek yok). Geriye dönük dolum:
13 lig × ~300 maç ÷ 20 = **~200 istek** (Ultra'da tek seferlik, önemsiz). Bu, 3.5 ve 3.2'deki kupa krallığını da besler.

### 3.8 Diğer küçük kayıplar
Tercih edilen ayak, oyuncu doğum şehri (var: `birth.place`), yardımcı hakemler, stat kapasitesi (ek `venues` çağrısıyla var),
canlı dakikada saniye. Kazanımlar: xG, teknik direktör, forma renkleri, sakat/cezalı, kupalar, oran (plan dışı değil ama lig
kapsamında yok), `predictions`.

---

## 4. Mimari

### 4.1 Katmanlar

```
Tarayıcı ──► /api/football/<kaynak>  (BFF: yalnızca normalize model, Cache-Control, hata kodu; ham cevap / kota YOK)
                 │
SSR/sunucu ──────┤
                 ▼
          FootballDataService  (liveScoreService'in dışa açık fonksiyon imzaları korunur)
                 │   provider seçimi: DATA_PROVIDER=apifootball|sportmonks  (sunucu env, NEXT_PUBLIC değil)
        ┌────────┴─────────┐
  ApiFootballAdapter   SportmonksAdapter (bugünkü mapper'lar, geri dönüş için olduğu gibi)
        │
  cachedFetch(key, ttl)  → Upstash Redis (+ mevcut 500'lük bellek LRU) ; tekil uçuş (in-flight dedupe) ; yalnız 2xx yazılır
        │
  apiFootballHttp  → x-apisports-key başlığı, x-ratelimit-* başlıklarını okuyup quotaMonitor'a (Sentry) yazar, dışarı vermez
```

- **Normalize modeller** (`src/models/`): mevcut `Match`, `MatchEvent`, `MatchStatsData`, `LineupPlayer`, `MatchLineupData`,
  `CompetitionTableData`, `TopScorerEntry` korunur; eklenenler: `MatchEvent.related_player`, `MatchStatsData.expected_goals/passes…`,
  `Match.provider` + `Match.key` (`"af:1528905"`), `Standing`, `PlayerSeasonLine`, `Transfer`, `Trophy`, `Sidelined`, `Coverage`.
  UI yalnızca bu modelleri görür; `competitionLogo.ts`/`leagueLogo.ts`/`config/leagues.ts`'teki `cdn.sportmonks.com` URL'leri ve
  SM lig id'leri (`600`, `2286`…) sağlayıcı-bağımsız bir `LeagueKey` (`"tr-super-lig"`) + `{sm: 600, af: 203}` eşleme tablosuna taşınır.
- **Tarayıcı artık sağlayıcıyı bilmez.** Bugünkü `/api/sportmonks/[...path]` her yolu/parametreyi geçiriyor ve **ham SM JSON'unu
  `subscription` ve `rate_limit` dahil tarayıcıya veriyor** (catalog: `src/pages/api/sportmonks/[...path].ts:74,80,84`). Yeni BFF
  beyaz listeli, sabit kaynaklı uçlar sunar (`/api/football/live`, `/fixtures?date=`, `/match/[key]`, `/standings/[league]`, …);
  sağlayıcı hata metni yerine kendi hata kodumuz döner. Geçişten sonra `/api/sportmonks` kapatılır (geri dönüşte yalnızca sunucu kullanır).
- **Bayrak:** mevcut `NEXT_PUBLIC_SPORTMONKS_ENABLED` deseni tarayıcıda da dallandığı için public. BFF'ye geçince bayrak yalnızca
  sunucuda okunur → `DATA_PROVIDER` (varsayılan `sportmonks`, geçişte `apifootball`). Geri dönüş = env değişikliği + redeploy;
  Sportmonks kodu ve mapper'ları silinmez.

### 4.2 Uç nokta bazında TTL ve günlük istek tahmini (cache'li, tek anahtar)

Takipli lig seti: Süper Lig, 1. Lig, Türkiye Kupası, 5 büyük lig, UCL/UEL/UECL, Uluslar Ligi, Dünya Kupası (~13 lig).
AF dokümanına göre canlı fikstür verisi ~15 sn'de bir güncellenir (Ultra ile ölçülecek, §2.6); daha kısa TTL kotayı boşa harcar.

| Kaynak (AF çağrısı) | TTL | Gerekçe | İstek/gün (yoğun gün) |
|---|---|---|---|
| Canlı liste `fixtures?live=<13 lig>` | **15 sn** (canlı maç yokken 5 dk) | AF tazeliği | ≤ 5.760 (gerçekte ~12 saat canlı → ~2.900) |
| Canlı detay `fixtures?ids=` (20'li parti, yalnızca canlı takipli maçlar) | **30 sn** | olay/kadro/istatistik | eşzamanlı ~20 maç → 1 parti × 2.880 = ≤ 2.900 |
| Günlük liste `fixtures?date=` | bugün 2 dk (canlı overlay ayrı), dün/yarın 30 dk, ±7 gün 6 sa | | ~ 720 + 100 = ~820 |
| Biten maç detayı `fixtures?id=` | **FT+2 saat sonra kalıcı** (Redis 30 gün + `PlayerMatchStat`/DB) | değişmez | ~ 150 (günün maçları) + uzun kuyruk ~ 300 |
| Puan durumu `standings` | canlı maç varken 5 dk (+ §3.4 projeksiyon), yoksa 1 sa | AF saatlik | 13 × ~100 = ~1.300 |
| Krallık ×4 (`topscorers/assists/yellow/red`) | 3 sa | | 4 × 13 × 8 = ~420 |
| Kadro `players/squads` | 24 sa | | ~ 260 takım, talep üzerine ~150 |
| Takım oyuncu istatistiği `players?team&season` (M/G/A/SK/KK + uyruk) | 12 sa | sayfalı (~3) | ~ 150 takım × 3 × 2 = ~900 |
| Oyuncu profili + sezonlar + transfer + kupalar + sakatlık | 24 sa (transfer/kupa 7 gün) | talep üzerine | ~ 400 oyuncu × 3 = ~1.200 |
| H2H `fixtures/headtohead` | 24 sa (maç günü 1 sa) | | ~ 200 |
| Takım son/sonraki maçlar `fixtures?team&last/next` | 30 dk / 1 sa | | ~ 400 |
| `teams/statistics` (AI bağlamı) | 6 sa | | ~ 200 |
| `injuries?date=` (tüm ligler tek istek) | 1 sa | | 24 |
| `leagues` (coverage/sezonlar), `countries`, `venues` | 24 sa / 7 gün / 30 gün | | ~ 30 |
| Takım arama | yerel DB (takipli lig takımları), bulunamazsa `teams?search=` 24 sa | | ~ 100 |
| Gündem botu, AI analizi, matchSnapshot | yukarıdaki cache'leri paylaşır | | 0 ek |
| **Toplam (yoğun hafta sonu, üst sınır)** | | | **~ 15.000 / gün ≈ Ultra kotasının %20'si** |

Dakika tepe noktası: canlı 4 + detay 2–4 + talep patlamaları (cache miss) → **< 60/dk** (sınır 450/dk). Geriye dönük
`PlayerMatchStat` dolumu (~200) ve takım/oyuncu senkronu gece çalışır. Cache olmasa istek sayısı trafiğe bağlı olur (sayfa görüntülemesi ×
2–4) ve 75.000 bir derbi gecesinde aşılabilir — cache katmanı bu yüzden adaptörle **aynı işte** yapılmalı.

Ek korumalar: tekil uçuş (aynı anahtara eşzamanlı 100 istek → 1 AF çağrısı), `stale-while-revalidate` (AF hata verirse son iyi veri
+ `X-Data-Stale`), `x-ratelimit-requests-remaining` < %10 → Sentry uyarısı ve talep üzerine uçlarda TTL ×4 "tasarruf modu".

---

## 5. Veritabanı

### 5.1 Sağlayıcı id'sine bağlı kolonlar (`prisma/schema.prisma`)

| Model.kolon | Tip / indeks | Yazan | Geçiş etkisi |
|---|---|---|---|
| `MatchAnalysis.matchId` | String, `@@unique([matchId, matchStatus])` | `api/matches/[id]/analysis.ts` | ⚠ AF id ile eski livescore id'si çakışabilir → yanlış analiz gösterimi / unique ihlali |
| `MatchAnalysis.homeTeamId/awayTeamId/competitionId` | String? | aynı | `findMatchByTeamIds` yedeği yanlış takıma gider |
| `PredictionRecord.matchId` | String, index | `lib/predictionRecords.ts` | AI başarı istatistiği (`ai-istatistikleri`) karışır |
| `UserPrediction.matchId` | String, `@@unique([matchId, userId])` | `api/matches/[id]/poll.ts` | çakışmada kullanıcı "zaten oy verdin" görür |
| `MatchComment.matchId` | String, index | (yazan yok) | düşük risk |
| `MatchTrivia.matchId` | String, `@@unique([matchId, matchStatus])` | `api/matches/[id]/trivia.ts` | yanlış trivia |
| `CreditTransaction.matchId` | String?, index | `lib/credits.ts` | kredi geçmişinde maç bağlantısı yanlış maça gider (bakiye etkilenmez) |
| `Post.matchId` / `Post.teamId` / `Post.externalKey` | String? / Int? / unique `goal:{fixture}:{event}` | gündem gönderileri, bot | rozetler yanlış maça; AF olaylarında id yok (§1.3) |
| `MatchSnapshot.fixtureId` (PK) + `homeTeamId/awayTeamId/leagueId` (Int) + `homeLogo/awayLogo` | | `matchSnapshot.ts` | PK çakışması; logolar `cdn.sportmonks.com` → trial bitince kırılabilir |
| `GundemBotDraft.fixtureId` (Int) / `eventId` / `externalKey` | | `bot/tick.ts` | aynı |
| `User.favoriteTeamIds` / `favoriteLeagueIds` | `Int[]` | `api/user/favorites.ts`, localStorage `oy_fav_club_teams` | ⚠ **kesin bozulur** — SM takım id'leri AF'de başka takımlar |

Not: bugün bile eski livescore id'leri ile SM id'leri aynı kolonlarda, ayırt edici alan olmadan duruyor.

### 5.2 Öneri — "sağlayıcı-nitelikli anahtar" (şimdi) + iç kimlik (sonra)

**Şimdi (lig dönüşünden önce, küçük ve geri alınabilir):**
1. `enum DataProvider { LIVESCORE SPORTMONKS API_FOOTBALL }`; maç id'si tutan her tabloya `provider DataProvider` kolonu.
   Unique'ler `@@unique([provider, matchId, matchStatus])` / `@@unique([provider, matchId, userId])` olur.
   Geri doldurma kuralı: `matchId::bigint >= 10_000_000` → `SPORTMONKS`, altı → `LIVESCORE` (SM id'leri 8 hane, livescore 7 hane;
   sıfır belirsizlik — migration öncesi `SELECT` ile doğrulanmalı).
2. Uygulama kodunda maç kimliği tek tip olur: `MatchKey = "af:1528905" | "sm:19172147" | "ls:1853411"`. URL'ler:
   yeni maçlar `/matches/turkiye-italya-af1528905`; eski SEO URL'leri (`…-19172147`, öneksiz) SM/livescore olarak çözülür ve eski
   analiz/yorum/tahmin sayfaları okunur kalır (canlı veri yerine DB'deki analiz + `MatchSnapshot`).
   `/teams/[id]` ve `/players/[id]` için aynı: öneksiz id = eski sağlayıcı → `EntityMap` üzerinden AF karşılığına 301.
3. `EntityMap(kind TEAM|LEAGUE|PLAYER, provider, externalId, canonicalKey)` tablosu. Takipli 13 ligin ~260 takımı için SM↔AF eşlemesi
   ad + ülke + (varsa) kuruluş yılı ile otomatik, belirsizler elle (~1 saat). Favoriler bu tabloyla tek seferlik dönüştürülür
   (DB) ve istemcide localStorage için `/api/user/favorites/migrate` ile.
4. `MatchSnapshot` logoları: `logo` yerine `teamId + provider` tut, URL'yi sunumda üret (AF logo URL'i deterministik).

**Sonra (lig döndükten sonra):** `Fixture/Team/League/Player` iç tabloları (`id` bizim, `EntityMap` dış id'leri tutar), tüm
uygulama tabloları iç id'ye bağlanır. Bir sonraki sağlayıcı değişikliği = yalnızca yeni `EntityMap` satırları. Şimdi yapmak
10 günlük pencereye sığmaz (her liste çağrısında upsert + tüm URL'ler), `provider` + `MatchKey` bunu daha sonra kayıpsız mümkün kılar.

---

## 6. 9 Ekim'e fazlı plan

Bugün 29 Eylül (Salı) → 9 Ekim (Cuma) = **8 iş günü + 1 hafta sonu**. Süreler tek geliştirici + Claude için iş günü.

| Faz | İçerik | Süre | Bitiş |
|---|---|---|---|
| **0. Kararlar** | Ultra anahtarı `.env.local` + Vercel'e (Free ile hiçbir güncel sezon çekilemiyor). Sportmonks trial'ı (1 Ekim 13:21 UTC): 1 ay ücretli (önerilen — geri dönüş sigortası) mi, bırak mı. Takipli lig listesi kesinleşir. | 0,5 | 30 Eyl |
| **1. DB + kimlik** | `provider` kolonları + backfill migration, `MatchKey` tipi, unique'lerin güncellenmesi, `EntityMap` + takım eşleme betiği, favori dönüşümü. **AF'den bağımsız, önce prod'a çıkabilir** (tüm satırlar `SPORTMONKS`/`LIVESCORE`). | 1,5 | 2 Eki |
| **2. Çekirdek adaptör + cache** | `apiFootballHttp` (kota başlıkları → Sentry), `cachedFetch` (Redis + LRU + tekil uçuş + SWR), `ApiFootballAdapter` Katman-1: canlı, tarih, lig fikstürü, maç detayı (durum/dakika/skor/round/hakem/stat), `DATA_PROVIDER` seçimi, BFF uçları. Birim testleri `__fixtures__` üzerinde (oyuncu değişikliği yönü, grid aynalama, seri penaltı tekilleştirme, skor tutarlılığı). | 2,5 | 6 Eki |
| **3. Katman-2/3** | Olaylar, istatistik (+xG), kadro (grid aynalama, türetilmiş mevki, liste yedeği, coverage kapıları), puan durumu (gruplar + canlı projeksiyon), krallıklar, kadro M/G/A/SK/KK, oyuncu profili/transfer, H2H, takım son/sonraki, AI bağlamı (tehlikeli atak → xG). `PlayerMatchStat` + geriye dönük dolum. | 2,5 | 8 Eki (hafta sonu dahil) |
| **4. Yan sistemler** | Gündem botu (canlı `events` + sentetik anahtar + düzeltme eşleşmesi), `matchSnapshot`, takım arama (yerel), `FavoritesTab`, lig logoları/`LeagueKey` konfigürasyonu, sitemap, `/api/sportmonks` proxy'nin kapatılması. | 1 | 8 Eki |
| **5. Gölge çalıştırma + geçiş** | Preview'da `DATA_PROVIDER=apifootball`; 3–5 Ekim hafta sonu canlı maçlarla SM çıktısıyla karşılaştırma (skor/dakika/olay farkı raporu), kota panosu. 8 Eki akşamı prod'da bayrak değişimi, 9 Eki lig maçları izlenir. Geri dönüş: env → `sportmonks` + redeploy (SM ücretliyse). | 1 (+ izleme) | 9 Eki |

**Toplam ≈ 9 iş günü, pencere 8 iş günü + hafta sonu → sıkı.** Kaydırılabilecekler (9 Ekim'den sonraya):
§3.4 canlı puan projeksiyonu, §3.7 geriye dönük `PlayerMatchStat` dolumu (ileriye dönük yazım yeterli), trofeler/sakatlık UI'ı,
takım arama yerel indeksi (AF `teams?search=` ile başla), iç kimlik tabloları (§5.2 "sonra").
**Kaydırılamayanlar:** Faz 1 (id çakışması veri bozar), oyuncu değişikliği yönü + grid aynalama (ekranda açıkça yanlış görünür),
cache katmanı (kota), coverage kapıları (kupa maçlarında boş sekmeler).

Sportmonks 1 Ekim'de ücretliye dönmezse: Faz 2'nin Katman-1 kısmı öne çekilip 3 Ekim'de "yalnızca skor/fikstür" ile AF'ye geçilir,
detay sekmeleri Faz 3 bittikçe açılır.

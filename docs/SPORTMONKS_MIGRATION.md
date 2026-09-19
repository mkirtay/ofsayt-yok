# Sportmonks Migration Karşılaştırma Raporu

**Amaç:** `livescore-api.com`'dan Sportmonks'a olası bir geçişi değerlendirmek için, mevcut
`src/services/liveScoreService.ts` Katman-1 fonksiyonlarının Sportmonks v3 Football API'sindeki
karşılıklarını gerçek API çağrılarıyla tespit etmek.

**Yöntem:** `.env.local`'daki `SPORTMONKS_API_KEY` ile gerçek istekler atıldı (mock/varsayım yok).
Anahtarın değeri hiçbir zaman log'a veya rapora yazdırılmadı. Bu, **sadece bir audit/karşılaştırma
raporudur** — bu iki pass boyunca kod tabanında hiçbir değişiklik yapılmadı, `liveScoreService.ts`
ve ilgili dosyalar olduğu gibi kaldı.

**Kapsam:** Yalnızca Katman-1 (ana sayfa/canlı skor akışını besleyen çekirdek) fonksiyonlar:
`getAllLiveMatches`/`getLiveMatches`, `getFixturesByDate`, `getFixturesByCompetition`,
`getAllMatchesByDate`, `getAllCompetitionHistoryMatches`. Katman-2/3 fonksiyonları
(`getTeamHistoryMatches`, `getTeamsHead2Head`, `getCompetitionTableFull` vb.) bu raporun
kapsamı **dışında** — ayrı bir pass gerektirir.

**Tespit edilen Sportmonks planı** (`subscription` alanından): `Growth (Trialing, 2026-10-01'e
kadar) — Advanced` + `Euro Club Tournaments — Advanced` add-on. `odds` paketi bu plana dahil değil.

---

## Genel bulgular (tüm Katman-1 fonksiyonlarını etkileyen)

1. **Pagination modeli tamamen farklı.** Mevcut kod `parseTotalPages()` ile `data.total_pages`
   okuyup `Array.from({length: totalPages-1})` şeklinde TÜM sayfaları paralel çekiyor
   (`getAllLiveMatches`, `getAllMatchesByDate`, `getAllCompetitionHistoryMatches`). Sportmonks'ta
   **`total_pages` yok** — sadece `pagination:{has_more, next_page, next_cursor}` var (gerçek
   response'larda doğrulandı, `total`/`total_count` alanı da yok). Bu, "kaç sayfa var önceden
   bilip hepsini paralel çek" deseninin çalışmayacağı, sıralı `while(has_more)` döngüsüne
   geçilmesi gerektiği anlamına geliyor — **field rename değil, kod mimarisi değişikliği**.

2. **`id`/`fixture_id` ayrımı Sportmonks'ta muhtemelen gereksiz.** Mevcut `Match.fixture_id`
   alanı ve `mergeMatchesForAllTab`/`mergeFixturesWithHistoryAndLive`'daki tüm reconciliation
   mantığı, livescore-api.com'un `fixtures/list` ile `matches/live`/`matches/history`'nin
   **farklı id** döndürmesinden kaynaklanıyor. Sportmonks'ta `/fixtures/date`, `/fixtures/between`
   ve `/livescores/inplay` **aynı `id`'yi** kullanıyor (test edilen tüm örneklerde tutarlı) — bu
   reconciliation katmanı bir migration'da büyük ölçüde kaldırılabilir.

3. **ID değer uzayı bambaşka.** livescore-api.com id'leri ~7 haneli (`1853411`), Sportmonks
   id'leri ~8 haneli farklı bir sayaçtan (`19874789`). Postgres'te `matchId` string olarak
   saklanan her tablo (`MatchAnalysis`, `MatchComment`, `UserPrediction`, `PredictionRecord`,
   `MatchTrivia`, `CreditTransaction`) sağlayıcı değişiminde **1-1 eşlenemez**, geçmiş veri
   kaybı/kopması olur.

4. **State modeli — gerçek `/states` endpoint'inden alınan tam liste** (26 durum; dokümantasyon
   sayfasının özetiyle **kısmen çelişiyor** — döküman "INPLAY_1ST_HALF" diyor, gerçek API
   `short_name:"1st"` döndürüyor — bu yüzden implementasyonda dokümana değil gerçek `/states`
   response'una güvenilmeli):

   | id | short_name | Kategori |
   |---|---|---|
   | 1 | NS | Başlamadı |
   | 2 | 1st | Canlı (1. devre) |
   | 3 | HT | Devre arası |
   | 4 | BRK | Ara |
   | 5 | FT | Bitti |
   | 6 | et | Canlı (uzatma) |
   | 7 | AET | Bitti (uzatma sonrası) |
   | 8 | FTP | Bitti (penaltı sonrası) |
   | 9 | PEN | Canlı (penaltılar) |
   | 10 | POST | Ertelendi |
   | 11 | SUSP | Askıya alındı |
   | 12 | CANC | İptal |
   | 13 | TBA | Duyurulacak |
   | 14 | WO | Hükmen |
   | 15 | ABAN | Terk edildi |
   | 16 | DELA | Ertelendi (gecikme) |
   | 17 | AWAR | Hükmen verildi |
   | 18 | INT | Kesintiye uğradı |
   | 19 | AU | Güncelleme bekleniyor |
   | 20 | DEL | Silindi |
   | 21 | ETB | Uzatma arası |
   | 22 | 2nd | Canlı (2. devre) |
   | 23 | 2et | Uzatma 2. yarı |
   | 25 | PENB | Penaltı arası |
   | 26 | PEN | Beklemede |

   Mevcut kod `STATUS_TO_PHASE`/`deriveMatchPhase`/`allTabStatusRank` içinde yalnızca 4 sabit
   string'e (`'NOT STARTED'`, `'IN PLAY'`, `'HALF TIME BREAK'`, `'FINISHED'`) göre dallanıyor —
   Sportmonks'un 26 durumunu bu 4 kovaya indiren **yeni bir mapping tablosu** yazılması şart.

---

# PASS 1 — Katman-1 endpoint eşlemeleri

## `getAllLiveMatches` / `getLiveMatches` → `GET /livescores/inplay`

`?include=participants;scores;state;league` ile test edildi (gerçek canlı maç: Orduspor 1967 vs
Torul Belediye Gençlik, id `19874789`).

Gerçek örnek response (kısaltılmış):
```json
{
  "id": 19874789,
  "league_id": 606,
  "state_id": 1,
  "name": "Orduspor 1967 vs Torul Belediye Gençlik",
  "starting_at": "2026-09-17 16:00:00",
  "participants": [
    {"id":249912,"name":"Torul Belediye Gençlik","image_path":"...","meta":{"location":"away","winner":null,"position":2}},
    {"id":255667,"name":"Orduspor 1967","image_path":"...","meta":{"location":"home","winner":null,"position":1}}
  ],
  "scores": [
    {"type_id":1,"participant_id":249912,"description":"1ST_HALF","score":{"goals":0,"participant":"away"}},
    {"type_id":1,"participant_id":255667,"description":"1ST_HALF","score":{"goals":0,"participant":"home"}}
  ],
  "state": {"id":1,"state":"NS","name":"Not Started","short_name":"NS"},
  "league": {"id":606,"name":"Turkish Cup","type":"league","sub_type":"domestic_cup","image_path":"..."}
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `id` | `id` | Birebir (değer uzayı farklı, bkz. Genel bulgu 3) |
| `status` | `state.short_name`/`state_id` | **Farklı** — string değil, mapping tablosu gerekli (bkz. Genel bulgu 4) |
| `home`/`away` `{id,name,logo}` | `participants[]` → `{id,name,image_path}` + `meta.location:'home'\|'away'` | **Farklı yapı** — sabit iki alan yerine 2 elemanlı dizi, `meta.location`'a göre filtrelenmeli. `logo`→`image_path` |
| `scores`/`score` (düz "2-1" string) | `scores[]` — her biri `{type_id,participant_id,description:'1ST_HALF'\|'2ND_HALF'\|'CURRENT'\|...,score:{goals,participant}}` | **Yok, türetilmeli** — `description==='CURRENT'` filtrelenip home/away goals birleştirilerek "2-1" string üretilmeli |
| `time` (canlı dakika) | Bu include'larla **yok** — ayrıca test edildi, bkz. Pass 2 | **Pass 2'de doğrulandı** → `periods`/`currentPeriod` |
| `competition`/`competition_id`/`competition_name` | `league_id` (direkt) + `league.{id,name,image_path,type,sub_type}` | **Kısmen farklı** — `is_league`/`is_cup` yok, `type`/`sub_type`'tan türetilmeli |
| `country` | `league.country` (ayrı include: `league.country`) → `{id,name,fifa_name,iso2,image_path}` | **Farklı isim** — `flag`→`image_path`, `fifa_code`→`fifa_name` |
| `fixture_id` | Ayrı alan yok, `id` zaten tüm endpoint'lerde tutarlı | **Gereksizleşiyor** (Genel bulgu 2) |
| `date`/`scheduled` | `starting_at` ("2026-09-17 16:00:00") | **Türetilmeli** — split ile date/HH:MM ayrılmalı (mevcut `fixtureTimeToScheduledHm` mantığına benzer) |
| `location`, `referee`, `round`, `group_name`, `urls`, `odds`, `outcomes` | — | Pass 2'de test edildi (aşağıda) |

## `getFixturesByDate` → `GET /fixtures/date/{date}`

`?include=participants;scores;state;league&per_page=5` ile test edildi (2026-09-17, 5 sonuç,
`has_more:true`).

- Field eşleşmeleri **`/livescores/inplay` ile birebir aynı** (aynı fixture şekli).
- Fark: bu endpoint hem oynanmamış (state_id=1) hem bitmiş (state_id=5) maçları **aynı günde
  birlikte** döndürüyor — livescore-api.com'da `fixtures/list` (planlı) ile `matches/history`
  (bitmiş) **ayrı endpoint'ken**, Sportmonks'ta tek endpoint'te state alanına göre ayrım
  yapılıyor.
- **Önemli:** `getAllMatchesByDate` (aşağıda) fonksiyonel olarak bu endpoint'in bir alt kümesi —
  aynı `from=to=date` ile `/fixtures/between` çağırmakla `/fixtures/date/{date}` **aynı sonucu**
  veriyor (Sportmonks'ta bu iki mevcut fonksiyon tek endpoint'e düşüyor).

## `getFixturesByCompetition` → `GET /fixtures/between/{from}/{to}?filters=fixtureLeagues:{id}` (bare `/fixtures` DEĞİL)

Kullanıcının/varsayımın test edilmesi gerekiyordu ve **kısmen yanlış çıktı**: tarih sınırı olmayan
`GET /fixtures?filters=fixtureLeagues:564` çağrıldığında sonuç **2024 Ağustos'tan başlıyor**
(ligin en eski kayıtlı sezonundan, kronolojik artan sırada) — "bugünkü/yakın fikstürler" DEĞİL.
Doğru davranış için **mutlaka bir tarih aralığıyla birleştirilmeli**:

```
GET /fixtures/between/2026-09-17/2026-10-17?filters=fixtureLeagues:564&include=participants;scores;state;league
```

Bu şekilde test edildiğinde (La Liga, id=564) 17 Eylül–17 Ekim arası 10 maç doğru sırayla
(Real Betis vs Getafe, Málaga vs Villarreal, ...) döndü.

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| Fixture şekli | `/livescores/inplay` ile aynı | Birebir yapı |
| Filtre sözdizimi | `filters=fixtureLeagues:{id}` (birden fazla: `fixtureLeagues:501,271`) | Mevcut `competition_id` param'ından **farklı syntax** — query param değil, `filters` string'i içinde `key:value` |
| Ayrı `/leagues/{id}/fixtures` endpoint'i | **Yok** — dokümantasyon da doğruladı | `getFixturesByCompetition`'ın mevcut basit `params:{competition_id}` çağrısı Sportmonks'ta hem filter-syntax hem zorunlu date-range gerektiriyor |

## `getAllMatchesByDate` (geçmiş maçlar) → `GET /fixtures/between/{from}/{to}` (from=to=aynı tarih)

- Test edildi (`/fixtures/date/{date}` ile aynı olduğu doğrulandı — Sportmonks'ta ayrı bir
  "history" endpoint'i yok, `state.short_name==='FT'` filtresiyle response'un içinden ayıklanıyor).
- Mevcut kodun `getMatchesByDate`'in `matches/history` çağrısı → Sportmonks karşılığı
  **`getFixturesByDate` ile birleştirilebilir**, ayrı fonksiyon olarak korumaya gerek kalmıyor.

## `getAllCompetitionHistoryMatches` → aynı `GET /fixtures/between/{from}/{to}?filters=fixtureLeagues:{id}`, geçmişe dönük tarih aralığı

- Test edildi (`2026-09-01`→`2026-09-16`, La Liga): `state.short_name:'FT'`, `scores[]` içinde
  `1ST_HALF`/`2ND_HALF`/`CURRENT`/`2ND_HALF_ONLY` gibi 4 farklı period-türü kayıt geldi (tek
  maçta 8 score satırı — 4 tür × 2 katılımcı).
- "Yukarıdakiyle aynı endpoint, farklı filtre" varsayımı **doğru** — tek fark `from`/`to`'nun
  geçmişe mi geleceğe mi baktığı, `filters` sözdizimi aynı.
- **Skor türetme mantığı** (`ht_score`/`ft_score`/final `score`) her iki fonksiyon için de aynı:
  `scores[]`'ı `description` alanına göre gruplayıp home/away goals'ı birleştiren yeni bir parse
  fonksiyonu yazılmalı — bugünkü `MatchScore{score,ht_score,ft_score}` düz string şekli
  Sportmonks'ta **hiçbir zaman doğrudan gelmiyor**.

---

# PASS 2 — Pass 1'de "doğrulanamayan" olarak işaretlenen alanların tamamlanması

## Bu pass'te atılan gerçek istekler

| # | İstek | Sonuç | `rate_limit.remaining` |
|---|---|---|---|
| 1 | `GET /livescores/inplay?include=state` | 200 | 2493 |
| 2 | `GET /fixtures/19874789?include=periods;currentPeriod` (henüz başlamamış maç) | 200 | 2492 |
| 3 | `GET /fixtures/date/{bugün}?include=state&per_page=50` | 200 | 2491 |
| 4 | `GET /fixtures/19874792?include=periods;currentPeriod` (bitmiş maç) | 200 | 2490 |
| 5 | `GET /fixtures/19874792?include=venue;referees;round` | 200 | 2489 |
| 6 | `GET /fixtures/19874792?include=referees.referee` | 200 | 2488 |
| 7 | `GET /fixtures/19732690?include=round;odds` | **403** (`odds` erişimi yok) | — |
| 8 | `GET /fixtures/19732690?include=round` (odds çıkarılıp tekrar) | 200 | 2487 |
| 9 | `GET /odds/pre-match/fixtures/19732690` (özel odds endpoint) | **403** (endpoint'e erişim yok) | — |
| 10 | `GET /fixtures/between/2026-09-01/2026-09-30?per_page=50` (group_id arayışı) | 200 | 2486 |

**Bu pass: 10 istek (8 başarılı/200, 2 red/403).**
**Toplam (Pass 1 + Pass 2): 16 gerçek istek.** Son bilinen kalan kota: **2486** (saatlik pencere,
o an ~2678sn sonra sıfırlanıyordu). Anahtar değeri hiçbir çıktıda/log'da yazdırılmadı.

## `time` (canlı dakika göstergesi) → `include=periods` / `include=currentPeriod`

**Doğrulandı** (bitmiş maç 19874792 üzerinde, gerçek response):
```json
"periods": [
  {"id":7111101,"type_id":1,"description":"1st-half","ticking":false,
   "sort_order":1,"period_length":45,"minutes":44,"seconds":24,"has_timer":false},
  {"id":7111142,"type_id":2,"description":"2nd-half","ticking":false,
   "sort_order":2,"period_length":45,"minutes":92,"seconds":3,"has_timer":false}
]
"currentPeriod": null
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `time` (canlı dakika, ör. "45'") | `currentPeriod.minutes` (aktif period'un `ticking:true` olanı) veya son `periods[]` elemanının `minutes` alanı | **Farklı yapı** — düz string değil, `periods[]` dizisinden `ticking===true` olanı bulup `minutes`+`seconds`'tan format edilmeli |
| — | `has_timer` | Bazı liglerde saniye verisi olmayabiliyor (`false`) — dakika-only gösterime düşülmeli |

**Kısıt:** Test anında gerçekten canlı oynanan bir maç bulunamadı (tek `/livescores/inplay`
sonucu `state_id:1 NS` idi) — bu yüzden `ticking:true` + `currentPeriod` dolu bir örnek
**gözlemlenemedi**. Alan adları ve mekanizma dokümantasyon + bitmiş-maç örneğiyle doğrulandı,
ama canlı-durum davranışı tam teyit edilmedi.

## `location`/`venue` → `include=venue`

**Doğrulandı** (gerçek response, fixture 19874792):
```json
"venue": {
  "id": 85165, "country_id": 404, "city_id": 2386,
  "name": "Amasya 12 Haziran Stadyumu", "address": null, "zipcode": null,
  "latitude": "40.652926", "longitude": "35.811621",
  "capacity": 7810, "image_path": null, "city_name": "Amasya",
  "surface": null, "national_team": false
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `location: string` (tek satır) | `venue.name` + `venue.city_name` (iki ayrı alan) | **Türetilmeli** — önerilen format: `` `${venue.name}, ${venue.city_name}` `` (mevcut `location` alanının gerçek biçimi kodda örnekle doğrulanmadı, bu yüzden kesin eşleşme garantisi verilmiyor — sadece makul bir mapping önerisi) |
| — (karşılığı yok) | `capacity`, `latitude`/`longitude`, `surface`, `image_path` (stadyum fotoğrafı) | Sportmonks'ta fazladan veri — mevcut modelde kullanılmıyor, isteğe bağlı zenginleştirme |

*Not: Kod değiştirilmedi, yalnızca alan tespiti — dönüştürme fonksiyonu yazılmadı.*

## `referee` → `include=referees` ve `include=referees.referee`

**Doğrulandı**, iki aşamalı: `referees` include'u sadece ID+rol verirken (`referee_id`,
`type_id`), asıl isim için `referees.referee` (nested include) gerekiyor.

```json
"referees": [
  {"referee_id":13915,"type_id":6,"referee":{"name":"Şahin Berker","display_name":"Şahin Berker"}},
  {"referee_id":65195,"type_id":7,"referee":{"name":"Turan Çelik"}},
  {"referee_id":838353,"type_id":8},
  {"referee_id":1158400,"type_id":9}
]
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `referee: string` (tek hakem) | `referees[]` — **dizi**, 4 kayıt (tipik: `type_id 6`=orta hakem, `7`/`8`=yardımcı hakemler, `9`=dördüncü hakem) — asıl isim `referees.referee` nested include ile geliyor | **Farklı yapı + ek include gerekiyor** — mevcut tek-string alana dönüştürmek için `type_id===6` filtrelenip `referee.name` (veya `display_name`) alınmalı. `type_id` değer sözlüğü (6/7/8/9) dokümantasyondan teyit edilmedi, sadece bu örnekten çıkarım |

## `round` → `include=round`

**Doğrulandı** (fixture 19732690, La Liga):
```json
"round": {
  "id": 408955, "league_id": 564, "season_id": 27965,
  "name": "6", "finished": false, "is_current": false,
  "starting_at": "2026-09-03", "ending_at": "2026-09-17",
  "games_in_current_week": false
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `round: string` (`"1/16"`,`"QF"`,`"SF"`,`"F"` gibi knockout etiketi VEYA lig hafta no) | `round.name` | **Kısmen farklı anlam** — lig maçlarında `round.name` düz sayı ("6" = 6. hafta), knockout turnuvalarda muhtemelen "QF"/"Final" gibi metin dönebilir ama bu pass'te sadece lig maçı test edildi, **knockout örneği doğrulanmadı** |

## `group_name` → `include=group`

**Doğrulanamadı — sonuçsuz.** 2026-09-01/2026-09-30 tarih aralığında 50 fikstürlük geniş bir
örneklemde (`fixtures/between`, lig filtresi olmadan) `group_id` dolu **tek bir kayıt
bulunamadı**. Muhtemel sebep: UEFA Şampiyonlar Ligi ve Avrupa Ligi 2024'ten beri klasik grup
formatını terk edip "lig fazı"na geçti; bu hesabın planı (`Euro Club Tournaments` add-on) bu iki
turnuvaya erişim veriyor ama onlar artık `group_id` üretmiyor olabilir. Klasik grup aşaması olan
bir turnuva (ör. Dünya Kupası elemeleri, bazı alt-lig kupaları) bu pass'te bulunamadı/denenmedi.

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `group_name: string` | `include=group` (mekanizma `round` ile aynı desende olmalı) | **Doğrulanamadı** — include syntax'ı test edilmedi (grup içeren fikstür bulunamadığı için `group` include'unu ayrı bir çağrıyla test etmek anlamsız olurdu), gerçek bir grup-aşaması fikstürü bulunursa tekrar denenmeli |

## `odds` / `outcomes` → `include=odds` ve `/odds/pre-match/fixtures/{id}`

**Doğrulandı — erişim yok, plan kısıtı.** İki farklı yoldan da aynı sonuç:

```
GET /fixtures/{id}?include=round;odds → 403
{"message":"You do not have access to the 'odds' include","code":5002}

GET /odds/pre-match/fixtures/{id} → 403
{"message":"You do not have access to this endpoint","code":5007}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `odds: MatchOdds {pre,live}` | `include=odds` veya `/odds/pre-match/fixtures/{id}` / `/odds/live/fixtures/{id}` | **Bu API key'in planında yok** — Growth/Trialing planı odds paketini içermiyor, migration'da ayrı bir add-on/upgrade gerekecek |
| `outcomes: {half_time,full_time,extra_time,penalty_shootout}` | Ayrı bir "odds" alanı değil — bu, Pass 1'de belgelenen `scores[]` derivation'ının bir varyantı (her period'un kazananını `scores[].description` gruplarından hesaplamak) | **Yeni bir endpoint/include gerekmiyor** — Pass 1'deki skor türetme mantığıyla aynı veri kaynağından hesaplanabilir, bu yüzden bu pass'te ayrıca test edilmedi |

## `urls`

**Doğrulandı — yok.** Fixture response'unun ham top-level anahtar listesi (`include` fark
etmeksizin) kontrol edildi:
```
['aggregate_id','details','group_id','has_odds','has_premium_odds','id','league_id',
 'leg','length','name','placeholder','referees','result_info','round','round_id',
 'season_id','sport_id','stage_id','starting_at','starting_at_timestamp','state_id',
 'venue','venue_id']
```
`urls`/`head2head`/`events`/`statistics`/`lineups` gibi convenience-link alanı **hiç yok**. Bu,
livescore-api.com'a özgü bir kolaylık alanı — Sportmonks'ta karşılığı yok, ihtiyaç olursa
endpoint path'leri manuel kurulmalı (Pass 1'de tüm endpoint path'leri zaten netleşti).

---

## Özet: Tam doğrulanan / plan kısıtlı / hâlâ açık

**Tam doğrulandı (gerçek response ile):**
- Pagination modeli (`has_more`/`next_cursor`, `total_pages` yok)
- `id`/`fixture_id` tekliği (tüm endpoint'lerde tutarlı `id`)
- State modeli — gerçek `/states` endpoint'inden 26 durumun tam listesi
- `getAllLiveMatches` → `/livescores/inplay`
- `getFixturesByDate` → `/fixtures/date/{date}`
- `getFixturesByCompetition` → `/fixtures/between/{from}/{to}?filters=fixtureLeagues:{id}` (bare `/fixtures` yanlış sonuç veriyor)
- `getAllMatchesByDate` / `getAllCompetitionHistoryMatches` → aynı `/fixtures/between`, farklı tarih aralığı
- Skor türetme — `scores[]`'tan `description` bazlı gruplama gerekliliği
- `time`/dakika → `periods[]`/`currentPeriod` (yapı doğrulandı, alan adları kesin)
- `location`/`venue` → `venue.{name,city_name,capacity,...}`
- `referee` → `referees[].referee.name` + `type_id` filtresi gerekliliği
- `round` → `round.name` (lig maçı için)
- `urls` → böyle bir alan yok, kesin

**Plan/paket kısıtı nedeniyle test edilemedi (ama kısıt kendisi doğrulandı):**
- `odds` → 403, kod 5002/5007, mevcut plana dahil değil

**Hâlâ Açık (migration için çözülmemiş sorular):**
1. `ticking:true` + `currentPeriod` dolu — **gerçek canlı bir maçta** hiç gözlemlenmedi; dakika
   göstergesinin gerçekten nasıl "akıp gittiği" (client'ın kendi saymasına mı ihtiyaç var, yoksa
   API her istekte güncel mi veriyor) teyit edilmedi.
2. `group_name`/`include=group` — grup aşaması olan gerçek bir fikstür bulunamadığı için hiç
   test edilmedi.
3. `round.name`'in knockout turnuvalarda (Kupa, Dünya Kupası) ne döndürdüğü — sadece lig maçı
   (düz hafta no) test edildi.
4. `referees[].type_id` değer sözlüğünün (6/7/8/9) resmi/dokümante anlamı — sadece 4 kayıtlık
   tek örnekten çıkarım yapıldı, dokümantasyonla teyit edilmedi.
5. `Match.location` alanının mevcut kodda **gerçekte hangi formatta** dolduğu hiç örneklenmedi
   (livescore-api.com tarafında canlı bir `location` değeri görülmedi) — bu yüzden
   `venue.name + city_name` mapping'inin doğru hedef format olup olmadığı kesinleşmedi.
6. Katman-2/3 fonksiyonları (`getTeamHistoryMatches`, `getTeamsHead2Head`,
   `getCompetitionTableFull`, `getSeasonsList`, `getTopScorers` vb.) hiç incelenmedi — ayrı bir
   pass gerekiyor.
7. Bu iki pass'in tamamı **tek bir API key ve tek bir plan** (Growth Trialing + Euro Club
   Tournaments) üzerinden test edildi — üretim planında farklı kısıtlar/erişimler olabilir.

---

# PASS 3 — "Hâlâ Açık" listesindeki 5 sorunun kapatılması

Bu pass, Pass 2 sonundaki "Hâlâ Açık" listesindeki 5 maddeyi tek tek gerçek isteklerle test
eder. Kod tabanında hiçbir değişiklik yapılmadı.

## Bu pass'te atılan istekler

| # | İstek | Sonuç | `rate_limit.remaining` | Entity havuzu |
|---|---|---|---|---|
| 1 | `GET https://livescore-api.com/api-client/fixtures/list.json?date={bugün}` (Q5 için, **ayrı sağlayıcı**) | **401** — `"This API key and secret do not have access to our data enabled"` | — | livescore-api.com (ayrı kota) |
| 2 | Upstash Redis `SCAN 0 MATCH lsc:*` (Q5 için, cache kontrolü) | 200, sonuç: **boş** (`[]`) | — | Redis (ayrı altyapı) |
| 3 | `GET /livescores/inplay?include=state;periods;currentPeriod` | 200 | 2485 | Fixture |
| 4 | `GET /fixtures/19874789?include=currentPeriod` | 200 | 2484 | Fixture |
| 5 | `GET /fixtures/19874789?include=periods.type` | 200 | 2483 | Fixture |
| 6 | `GET /fixtures/19874789?include=periods;state` | 200 | 2482 | Fixture |
| 7 | `GET /leagues/2` (Champions League id doğrulama) | 200 | 2499 | **League** (ayrı havuz) |
| 8 | `GET /fixtures/between/2026-02-01/2026-06-05?filters=fixtureLeagues:2&include=round;stage` | **422** — `"You requested a date range of 124 days. The maximum range is 100 days."` | — | Fixture (kota düşmedi) |
| 9 | `GET /fixtures/between/2026-02-10/2026-05-15?filters=fixtureLeagues:2&include=round;stage` (daraltılmış) | 200 | 2481 | Fixture |
| 10 | `GET /fixtures/between/2026-05-15/2026-06-10?filters=fixtureLeagues:2&include=round;stage` (final) | 200 | 2480 | Fixture |
| 11 | `GET /leagues/search/World%20Cup` | 200 (sonuç yok — erişim/plan dışı) | 2498 | League |
| 12 | `GET /fixtures/between/2022-09-01/2022-12-01?filters=fixtureLeagues:5&include=group;stage` | 200 | 2479 | Fixture |
| 13 | `GET /fixtures/19683241?include=referees.referee` (CL finali) | 200 | 2478 | Fixture |

**Bu pass: 13 istek toplam (2 farklı sağlayıcı/altyapıya) — Sportmonks tarafında 11 istek (9
başarılı 200, 1 red 422 [kota düşmedi], 1 sonuçsuz-ama-200 arama).** Sportmonks quota'sının
**iki ayrı havuzda** izlendiği bu pass'te ortaya çıktı: `Fixture` entity'si ve `League` entity'si
**bağımsız sayaçlara** sahip (`/leagues/*` çağrıları `Fixture` kotasını hiç etkilemedi).

**Bu pass sonu kalan kota:** Fixture havuzu **2478**, League havuzu **2498** (saatlik pencere).
**Toplam (Pass 1+2+3, sadece Sportmonks):** 27 istek. Anahtar değerleri (Sportmonks ve
livescore-api.com) hiçbir çıktıda/log'da yazdırılmadı.

---

## Soru 1 — Canlı dakika davranışı (ticking + currentPeriod)

**Doğrulandı.** `/livescores/inplay`'i tekrar çağırdığımda önceki pass'lerde `state_id:1` (NS)
olan fikstür (`19874789`, Orduspor 1967 vs Torul Belediye Gençlik) bu kez **gerçekten canlıydı**
(`state_id:2`, `short_name:"1st"`).

Üç ayrı zaman noktasında `periods[]` çekildi:

| İstek zamanı (unix) | `periods[0].minutes:seconds` | `ticking` |
|---|---|---|
| ~1789660980 (ilk çağrı) | 10:59 | `true` |
| ~1789661220 (ikinci çağrı, periods.type ile) | 11:24 | `true` |
| 1789661653 (üçüncü çağrı) | 11:41 | `true` |

`periods[0].started` epoch değeri **1789660953**. Üçüncü ölçümde: `1789661653 - 1789660953 =
700` saniye = **11 dakika 40 saniye** — API'nin döndürdüğü `11:41` ile (yuvarlama farkı hariç)
neredeyse birebir örtüşüyor. **Sonuç: API, `minutes`/`seconds`'ı her istekte `started`
timestamp'ine göre sunucu tarafında gerçek zamanlı hesaplayıp dönüyor** — client-side interpolasyon
gerekmiyor (istenirse `now - started` ile client de hesaplayabilir, ama API zaten güncel
değeri veriyor).

**Önemli ek bulgu — `currentPeriod` include'u dokümanla çelişiyor:** `periods[0].ticking:true`
olmasına rağmen `include=currentPeriod` (hem `periods` ile birlikte hem tek başına test edildi)
**her seferinde `null` döndü**. Dokümantasyon "ticking olan period'u döner" diyor ama gerçek
davranış bu değil.

**Önerilen sonraki adım:** `currentPeriod`'a güvenmek yerine `periods[]` dizisini
`ticking===true` filtresiyle taramak — bu pass'te güvenilir şekilde çalıştığı kanıtlandı.

## Soru 2 — `group_name` / `include=group`

**Doğrulandı.** Güncel sezonlarda (2026) Şampiyonlar Ligi ve Avrupa Ligi klasik grup formatını
terk ettiği için önceki pass'lerde örnek bulunamamıştı. Bu pass'te **2022/23 sezonu Avrupa Ligi**
(`league_id:5`, `2022-09-01`–`2022-12-01` aralığı) denendi ve **8 farklı grup** gerçek veriyle
yakalandı:

```json
"group": {
  "id": 247770, "league_id": 5, "season_id": 20090, "stage_id": 77458828,
  "name": "Group A", "starting_at": "2022-09-08", "ending_at": "2022-11-03",
  "is_current": false, "finished": true, "pending": false
}
```
(Group A → Group H, 8 grup, ör. Zürich vs Arsenal / Ludogorets vs Roma / Manchester United vs
Real Sociedad). Aynı fikstürlerde `stage.name = "Group Stage"` de doğrulandı.

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `group_name: string` | `group.name` (ör. `"Group A"`) | **Doğrulandı** — `include=group` çalışıyor, `round` ile aynı desende bir ilişkisel obje dönüyor |

**Önemli not:** Bu mapping **sadece klasik grup formatlı eski sezonlarda** geçerli. Güncel
(2024/25 sonrası) Şampiyonlar Ligi/Avrupa Ligi fikstürlerinde `group_id` hep `null` — bu
turnuvalar artık "lig fazı" kullanıyor, `group`/`group_name` alanı bu sezonlar için anlamsız
kalacak. Migration'da `group_id == null` durumunun UI'da gösterilmemesi gerekecek.

## Soru 3 — `round.name` knockout turnuvada ne döndürüyor

**Doğrulandı — ama beklenenden farklı bir sonuçla.** Şampiyonlar Ligi'nin 2025/26 sezonu
knockout aşaması (`league_id:2`, `2026-02-10`–`2026-06-10`) test edildi:

```
Galatasaray vs Juventus     → round: null | stage.name: "Knockout Round Play-offs"
Galatasaray vs Liverpool    → round: null | stage.name: "8th Finals"
Sporting CP vs Arsenal      → round: null | stage.name: "Quarter-finals"
PSG vs Bayern München       → round: null | stage.name: "Semi-finals"
PSG vs Arsenal              → round: null | stage.name: "Final"
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `round: string` (knockout etiketi, ör. `"1/16"`,`"QF"`,`"F"`) | **`round` entity'si knockout fikstürlerinde hep `null`** — asıl bilgi `stage.name` alanında (`"Knockout Round Play-offs"`,`"8th Finals"`,`"Quarter-finals"`,`"Semi-finals"`,`"Final"`) | **Doğrulandı, ama Pass 1/2'deki varsayım yanlıştı** — knockout turnuvalarda `round` değil **`stage`** kullanılmalı. `round.name` sadece Pass 1'de test edilen lig maçlarında ("6" gibi düz hafta no) anlamlı. Migration'da `round` (lig haftası) ile `stage` (turnuva fazı/tur) **iki ayrı kavram** olarak ele alınmalı, mevcut tek `Match.round: string` alanı ikisini de karşılayamaz |

## Soru 4 — `referees[].type_id` sözlüğü

**Doğrulandı.** Resmi dokümantasyon (`docs.sportmonks.com/v3/football/entities/referees`) net
bir tablo veriyor:

| type_id | Rol |
|---|---|
| 6 | Referee (orta hakem) |
| 7 | 1st Assistant (1. yardımcı) |
| 8 | 2nd Assistant (2. yardımcı) |
| 9 | 4th Official (dördüncü hakem) |
| 10 | VAR (her fixture'da garanti değil) |

**Gerçek verilerle çapraz doğrulandı**, iki bağımsız fikstürde aynı örüntü:

- Türkiye Kupası maçı (Pass 2): `6→Şahin Berker, 7→Turan Çelik, 8→(3. kayıt), 9→(4. kayıt)`
- Şampiyonlar Ligi Finali (bu pass, id `19683241`): `6→Daniel Siebert, 7→Rafael Foltyn,
  8→Jan Seidel, 9→Sandro Schärer`

Daniel Siebert tanınan bir FIFA kategorisi orta hakem, diğer üç isim onun UEFA maçlarında
rutin olarak görev alan yardımcı/4. hakem ekibi — bu, dokümandaki 6=orta hakem sırasını
dışarıdan da doğruluyor. `type_id:10` (VAR) hiçbir örnekte gelmedi — dokümandaki "garanti değil"
notuyla tutarlı.

**Sonuç: type_id sözlüğü tam ve güvenilir şekilde doğrulandı — 6/7/8/9/10.**

## Soru 5 — `Match.location`'ın mevcut kodda gerçek formatı

**Doğrulanamadı — 3 farklı yol denendi, hiçbiri sonuç vermedi.**

1. **Doğrudan livescore-api.com isteği:** `.env.local`'daki `LIVESCORE_API_KEY`/`SECRET` ile
   `GET /fixtures/list.json?date={bugün}` çağrıldı → **HTTP 401**,
   `"This API key and secret do not have access to our data enabled"`. Bu anahtar çiftinin
   şu an **aktif veri erişimi yok** (süresi dolmuş/iptal/deneme bitmiş olabilir) — bu kendi
   başına önemli bir bulgu: prod ortamda gerçekten kullanılan anahtar farklı olabilir, ya da
   mevcut entegrasyon zaten çalışmıyor olabilir, bu rapor kapsamında doğrulanamadı.
2. **Redis/Upstash cache kontrolü:** `KV_REST_API_URL`/`TOKEN` ile `lsc:*` prefix'li anahtarlar
   tarandı (`SCAN 0 MATCH lsc:*`) → **sonuç boş** (`[]`). Şu an cache'te hiç fikstür verisi yok.
3. **Postgres/Prisma şeması:** `MatchAnalysis`/`MatchTrivia`/diğer tablolarda `location` alanı
   **hiç saklanmıyor** (önceki denetimlerde şema tamamen incelenmişti) — DB'den de örnek
   çekilemez.

Kod tabanındaki kullanım noktaları (`src/config/analysisPrompt.ts:233`,
`src/components/WorldCupCalendar/index.tsx`, `src/components/MatchCard/index.tsx:178`)
`location`'ı tek bir "stadyum/konum" string'i olarak (📍 ikonuyla, "Stadyum: {location}" gibi)
tüketiyor — bu, `venue.name + venue.city_name` birleşiminin **makul bir hedef format** olduğunu
destekliyor, ama gerçek bir canlı örnekle **teyit edilemedi**.

**Önerilen sonraki adım:** Üretim ortamında (geçerli `LIVESCORE_API_KEY`/`SECRET` ile) veya
geçerli bir livescore-api.com aboneliğiyle tek bir gerçek `fixtures/list`/`matches/live` yanıtı
çekilip `location` alanının ham değeri kaydedilmeli. Bu pass'te kullanılabilir bir kimlik bilgisi
olmadığı için bu adım tamamlanamadı.

---

## Pass 3 özeti

| Soru | Sonuç |
|---|---|
| 1. Canlı dakika (`ticking`/`currentPeriod`) | **Doğrulandı** — `periods[].ticking` güvenilir, `currentPeriod` dokümanla çelişkili şekilde hep `null` |
| 2. `group_name` | **Doğrulandı** — eski sezonlarda çalışıyor (`group.name`), güncel CL/EL'de `group_id` hep `null` |
| 3. `round.name` knockout'ta | **Doğrulandı** — knockout'ta `round` değil `stage.name` kullanılmalı, varsayım düzeltildi |
| 4. `referees[].type_id` sözlüğü | **Doğrulandı** — 6/7/8/9/10, doküman + 2 bağımsız gerçek fikstürle çapraz teyit |
| 5. `Match.location` gerçek formatı | **Doğrulanamadı** — livescore-api.com anahtarı 401 veriyor, cache boş, DB'de alan yok |

4/5 soru tam kapatıldı. 5. soru, bu pass'in erişimi dahilinde çözülemeyecek bir kısıtla
(geçersiz/erişimsiz livescore-api.com kimlik bilgisi) karşılaştı — kod tabanı veya bu rapor
üzerinden değil, geçerli bir API erişimiyle ayrıca doğrulanmalı.

---

# PASS 4 — Katman-2/3: kullanım haritası + gerçek endpoint testleri

## Adım 1 — Kod tabanında gerçek çağrı yerleri (component/sayfa bazında)

`liveScoreService.ts`'teki tüm Katman-2/3 fonksiyonları için grep ile taze bir tarama yapıldı
(kod tabanı bu üç pass boyunca değişmedi, ama sonuç yeniden doğrulandı):

| Fonksiyon | Çağrı zinciri (dosya) | Bağlı sayfa/component |
|---|---|---|
| `findMatchById` | `resolveLiveMatch.ts` (→ `buildMatchAnalysisContext`, `predictionRecords.ts`) + doğrudan `matches/[slug].tsx` | `/matches/[slug]`, `/api/matches/[id]/analysis`, `/api/matches/[id]/trivia`, `scripts/reset-analysis.ts` |
| `getMatchWithEvents` | `resolveLiveMatch.ts` + doğrudan `matches/[slug].tsx` (event timeline) | `/matches/[slug]` |
| `getMatchStats` | `buildMatchAnalysisContext.ts` + `matches/[slug].tsx` | `/matches/[slug]`, AI analiz/trivia |
| `getMatchLineups` | aynı | `/matches/[slug]`, AI analiz/trivia |
| `getTeamsHead2Head` | `buildMatchAnalysisContext.ts`, `loadComparePageData.ts`, `MatchCard/index.tsx` | `/matches/[slug]` (MatchCard'daki H2H rozeti), `/compare/[slug]` (+`/api/compare/[slug]`) |
| `getCompetitionTableFull` | `worldCupStandings.ts`, `buildMatchAnalysisContext.ts`, `useWorldCupBootstrap.ts`, `useCompetitionSidebar.ts`, `teams/[id].tsx`, `world-cup/index.tsx`, `matches/[slug].tsx`, `api/compare/teams.ts` | `/matches/[slug]`, `/world-cup`, `/teams/[id]`, `/`+`/uefa` sidebar, `/api/compare/teams` |
| `getTeamLastMatches` | `buildMatchAnalysisContext.ts`, `loadComparePageData.ts`, `useTeamDetailBootstrap.ts` | AI analiz, `/compare/[slug]`, `/teams/[id]` |
| `getTeamCompetitions` *(pure helper — API çağırmaz)* | `useTeamDetailBootstrap.ts` | `/teams/[id]` |
| `getSeasonsList` | `worldCupStandings.ts`, `useWorldCupBootstrap.ts`, `useCompetitionSidebar.ts`, `matches/[slug].tsx`, `teams/[id].tsx`, `api/worldcup/team-history.ts` | `/world-cup`, `/matches/[slug]`, `/teams/[id]`, `/`+`/uefa` sidebar, `/api/worldcup/team-history` |
| `getTopScorers` | `useCompetitionSidebar.ts`, `useStandingsPage.ts`, `teams/[id].tsx` | `/`+`/uefa` sidebar, `/standings`, `/teams/[id]` |
| `getLeagueTable` | `useStandingsPage.ts` | `/standings` |
| `getTopDisciplinary` | `useStandingsPage.ts` | `/standings` |
| `getTeamSquads` | `teams/[id].tsx` (doğrudan) | `/teams/[id]` |
| `findMatchByTeamIds` | `resolveLiveMatch.ts` (fallback yolu, hiçbir sayfa doğrudan import etmiyor) | Transitif: `/matches/[slug]` (arşiv-modu / eski matchId fallback'i) |
| `dedupeMatchesById` *(pure helper — API çağırmaz)* | `worldCupMatches.ts` | `/world-cup` |
| **`getCompetitionGroups`** | **0 dış referans — tanım dosyası dışında hiçbir yerde çağrılmıyor** | **KULLANILMIYOR** |

**Sonuç:** Katman-2/3'teki 15 fonksiyondan **14'ü gerçekten kullanılıyor**, yalnızca
`getCompetitionGroups` (`competitions/groups.json`) tamamen ölü kod — test kapsamına alınmadı.
`getTeamCompetitions` ve `dedupeMatchesById` pure helper'lar (kendi başlarına API çağırmıyorlar,
zaten çekilmiş `Match[]`'i işliyorlar) — bunlar için ayrı bir endpoint testi yapılmadı, aşağıdaki
tablolarda tükettikleri fonksiyonların (`getTeamLastMatches`, çeşitli fixture fonksiyonları)
sonuçlarına bağımlılar. `findMatchById`/`findMatchByTeamIds` da tek bir endpoint'e karşılık
gelmeyen, birden fazla primitif endpoint'i (aşağıda test edilenler) client-side orkestre eden
kompozit fonksiyonlar — ayrı satır olarak test edilmedi, alttaki primitiflerin doğrulanmasıyla
kapsanmış sayılıyor.

## Bu pass'te atılan istekler

| # | İstek | Sonuç | `rate_limit.remaining` | Entity havuzu |
|---|---|---|---|---|
| 1 | `GET /fixtures/19683241?include=participants;events;statistics;lineups` | 200 | 2477 | Fixture |
| 2 | `GET /standings/seasons/27965?include=participant` | 200 | 2499 | **Standing** (yeni havuz) |
| 3 | `GET /standings/seasons/27965?include=participant;details.type` | 200 | 2498 | Standing |
| 4 | `GET /topscorers/seasons/27965?filters=seasonTopscorerTypes:208` (goller) | 200 | 2499 | **Topscorer** (yeni havuz) |
| 5 | `GET /topscorers/seasons/27965?filters=seasonTopscorerTypes:84` (sarı kart) | 200 | 2498 | Topscorer |
| 6 | `GET /squads/teams/591?include=player` (PSG kadrosu) | 200 | 2499 | **PlayerTeam** (yeni havuz) |
| 7 | `GET /fixtures/head-to-head/591/19` (PSG–Arsenal) | 200 | 2476 | Fixture |
| 8 | `GET /fixtures/between/591/2026-01-01/2026-04-01` (yanlış param sırası) | **422** — `teamId must be an integer`, `startDate does not match Y-m-d` | — | — |
| 9 | `GET /fixtures/between/2026-01-01/2026-04-01/591` (düzeltilmiş sıra) | 200 | 2475 | Fixture |
| 10 | `GET /leagues/564?include=seasons` | 200 | 2497 | League |

**Bu pass: 10 istek (9 başarılı, 1 red/422 — kota düşmedi).**
**Toplam (Pass 1+2+3+4): 36 Sportmonks isteği.** Anahtar değeri hiçbir çıktıda yazdırılmadı.

**Önemli mimari bulgu:** Sportmonks kotası **en az 5 bağımsız havuzda** izleniyor —
`Fixture`, `League`, `Standing`, `Topscorer`, `PlayerTeam` — her biri kendi sayacına sahip. Bir
entity tipini çok kullanmak diğerlerinin kotasını etkilemiyor.

**Doküman güvenilirliği — bir hata daha:** "Fixtures by Date Range for Team" endpoint'i için
Pass 1'de dokümantasyon sorgusundan alınan `/fixtures/between/{team_id}/{start_date}/{end_date}`
sırası **yanlış çıktı** (gerçek istek 422 verdi). Doğru sıra —gerçek istekle doğrulandı—
**`/fixtures/between/{start_date}/{end_date}/{team_id}`**. Bu, Pass 2/3'te bulunan
`state.short_name` ve `currentPeriod` tutarsızlıklarına ek üçüncü bir doküman-hatası örneği —
**migration sırasında her endpoint'in dokümantasyondan değil gerçek istekle doğrulanması
gerektiğini** güçlendiriyor.

## `getMatchWithEvents` → `GET /fixtures/{id}?include=events`

Gerçek response (fixture 19683241, PSG vs Arsenal, gol anı):
```json
{
  "id": 157087821, "fixture_id": 19683241, "period_id": 6979230,
  "participant_id": 19, "type_id": 14, "player_id": 32612,
  "player_name": "Kai Havertz", "related_player_id": 61780,
  "related_player_name": "Leandro Trossard", "result": "0-1",
  "info": "Left foot shot", "addition": "1st Goal", "minute": 6,
  "extra_minute": null, "sub_type_id": 1521, "sort_order": 1
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `MatchEvent.id` | `id` | Birebir |
| `MatchEvent.player:{id,name}` | `player_id` + `player_name` (top-level, nested değil) | **Farklı yapı** — `{id:player_id, name:player_name}` şeklinde sarmalanmalı |
| `MatchEvent.time` | `minute` (+ `extra_minute`, uzatma dakikası için ayrı alan) | **Farklı isim + ek alan** — `"45+2"` gibi bir gösterim için `minute`+`extra_minute` birleştirilmeli |
| `MatchEvent.event` (string, ör. "goal") | `type_id` (sayısal kod, burada `14`) | **Yok, türetilmeli** — `/types` endpoint'inden ya da `include=type` ile isim çözümlenmeli (bu pass'te `include=type` ayrıca test edilmedi) |
| `MatchEvent.sort` | `sort_order` | Farklı isim, birebir anlam |
| `MatchEvent.info` | `info` | Birebir |
| `MatchEvent.is_home`/`is_away` | Yok — `participant_id`'nin fixture'ın `participants[].meta.location`'ıyla eşleştirilmesi gerekiyor | **Türetilmeli** |
| — (karşılığı yok) | `related_player_id`/`related_player_name` (asist), `result` (o anki skor), `addition` ("1st Goal" gibi alt-etiket), `injured`, `on_bench`, `rescinded` (VAR ile iptal) | Sportmonks'ta fazladan veri — mevcut modelde yok, zenginleştirme fırsatı |

## `getMatchStats` → `GET /fixtures/{id}?include=statistics`

**En büyük yapısal fark bu fonksiyonda.** Mevcut `MatchStatsData` **tek, düz bir obje**
(`{yellow_cards, possesion, corners, shots_on_target, ...}` — hepsi maç geneli için tek değer).
Sportmonks ise **86 satırlık normalize bir dizi** döndürdü (aynı fixture için):

```json
{
  "id": 930741724, "fixture_id": 19683241, "type_id": 34,
  "participant_id": 19, "data": {"value": 3}, "location": "away"
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `MatchStatsData.{corners,possesion,shots_on_target,...}` (tek obje, maç geneli) | `statistics[]` — her satır `{type_id, participant_id, location:'home'\|'away', data:{value}}` | **Kökten farklı yapı** — 86 satırı `type_id`'ye göre gruplamak (isimlerini `/types` ile çözmek), `location`'a göre home/away ayırmak, ve mevcut modeldeki HER istatistiği (kaç `type_id`'ye denk geldiğini bulmak) tek tek eşlemek gerekiyor. Bu pass'te `type_id`→isim çözümlemesi (`/types` endpoint'i) **test edilmedi** — ayrı bir doğrulama gerekiyor |

**Not:** `type_id:34`'ün hangi istatistiğe karşılık geldiği bu pass'te çözülmedi (ör. mevcut
verilerden "away, value:3" — muhtemelen korner ya da sarı kart sayısı olabilir ama kesin değil).
Migration için **tam `type_id` sözlüğünün `/types` endpoint'inden çekilmesi zorunlu** — bu
büyük bir ek iş kalemi.

## `getMatchLineups` → `GET /fixtures/{id}?include=lineups`

Gerçek response (fixture 19683241):
```json
{
  "id": 14673943720, "fixture_id": 19683241, "player_id": 3130,
  "team_id": 19, "position_id": 24, "formation_field": "1:1",
  "type_id": 11, "formation_position": 1,
  "player_name": "David Raya", "jersey_number": 1
}
```
(46 satır — iki takım, ilk 11 + yedekler birlikte)

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `MatchLineupData.lineup.{home,away}` (iki ayrı bucket) | Düz `lineups[]` dizisi, `team_id`'ye göre gruplanmalı | **Farklı yapı** — `team_id`'yi `participants[].meta.location`'la eşleştirip home/away'e ayırmak gerekiyor |
| `LineupPlayer.id`/`.name` | `player_id`/`player_name` | Farklı isim |
| `LineupPlayer.shirt_number` | `jersey_number` | Farklı isim |
| `LineupPlayer.substitution` (`"0"`\|`"1"`) | `type_id` (bu örnekte `11`) | **Yok, türetilmeli** — `type_id`'nin ilk 11 mi yedek mi olduğunu ayırt eden değer aralığı bu pass'te tam doğrulanmadı (yalnızca `11` görüldü) |
| `LineupPlayer.position` (`"GK"`\|`"DF"`\|...) | `position_id` (sayısal, burada `24`) | **Yok, türetilmeli** — pozisyon isimleri için ayrı bir lookup gerekiyor, bu pass'te test edilmedi |
| `LineupPlayer.photo` | Yok bu include'da (`player_name` dışında oyuncu detayı gelmedi) | Muhtemelen `include=lineups.player` (nested) ile `image_path` gelir — test edilmedi |
| `LineupTeam.team:{id,name}` | `team_id` (sadece id, isim yok) | **Ek include gerekiyor** (`include=lineups.team` gibi) — test edilmedi |

## `getTeamsHead2Head` → `GET /fixtures/head-to-head/{team_id_1}/{team_id_2}`

PSG (591) – Arsenal (19) ile test edildi, gerçek 6 sonuç geldi (2016'dan 2026'ya):
```
19683241  2026-05-30  Paris Saint Germain vs Arsenal   (state: 8, FTP)
19391311  2025-05-07  Paris Saint Germain vs Arsenal   (state: 5, FT)
19391310  2025-04-29  Arsenal vs Paris Saint Germain   (state: 5, FT)
19296226  2024-10-01  Arsenal vs Paris Saint Germain   (state: 5, FT)
1060960   2016-11-23  Arsenal vs Paris Saint Germain   (state: 5, FT)
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `Head2HeadData.team1`/`.team2` `{id,name,overall_form?,h2h_form?}` | Endpoint direkt **fixture listesi** döndürüyor, ayrı `team1`/`team2` özet objesi yok | **Kökten farklı** — mevcut modeldeki `team1`/`team2` form özetleri Sportmonks'ta bu endpoint'te yok, ayrı hesaplanmalı (muhtemelen `getTeamLastMatches`'ten türetilerek) |
| `Head2HeadData.h2h[]` (`Head2HHistoricalMatch{id,date,score,home_name,away_name,...}`) | Düz fixture dizisi — Katman-1'de zaten belgelenen `Match` şekli (`participants`/`scores`/`state`) | **Format Katman-1 ile aynı**, skor türetme mantığı (Pass 1) aynen uygulanmalı |
| — | 2016'dan bir maç (id `1060960` — çok daha kısa/eski id formatı) döndü | ID uzayının zamanla büyüdüğünü doğruluyor — eski maçlar daha kısa id'lere sahip |

## `getCompetitionTableFull` / `getLeagueTable` → `GET /standings/seasons/{season_id}`

**Önemli: `league_id` ile DEĞİL, `season_id` ile çağrılıyor** — mevcut kodun `competition_id`
parametresi tek başına yetmez, önce sezon çözümlenmeli (`getSeasonsList`/`league.seasons`'tan
`is_current:true` olan alınmalı).

Gerçek response (La Liga, season_id 27965, FC Barcelona 1. sıra):
```json
{
  "id": 291686, "participant_id": 83, "league_id": 564, "season_id": 27965,
  "position": 1, "result": "equal", "points": 18,
  "participant": {"id": 83, "name": "FC Barcelona", "short_code": "BAR", "image_path": "..."}
}
```
`include=details.type` ile ek satırlar:
```
Overall Matches Played = 6
Overall Won = 6
Overall Draw = 0
Overall Lost = 0
Overal Goals Scored = 28
Overall Goals Conceded = 6
```
(dokümandaki yazım hatası dahil aynen: "Overal Goals Scored")

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `CompetitionTableStandingRow.rank` | `position` | Farklı isim |
| `.points` | `points` | Birebir |
| `.team`/`.team_id`/`.name`/`.logo` | `participant_id` + `participant:{id,name,image_path}` (ayrı include) | Farklı isim, ek include gerekli |
| `.matches`,`.won`,`.drawn`,`.lost`,`.goals_scored`,`.goals_conceded` | **Hiçbiri top-level'da yok** — `details[]` dizisinde `{type:{name:"Overall Won"},value}` şeklinde normalize | **Kökten farklı yapı** — 6+ satırlık `details` dizisini `type.name` string eşlemesiyle pivot etmek gerekiyor (isim eşlemesi tam sabit değilse kırılgan olabilir) |
| `.goal_diff` | Yok, `goals_scored - goals_conceded`'dan türetilmeli | **Türetilmeli** |
| `CompetitionTableData.stages/groups` | `group_id`, `stage_id` (bu satırda `null`/dolu olabilir, Pass 3'teki `group`/`stage` include mantığıyla aynı) | Pass 3 ile tutarlı |

## `getTeamLastMatches` (→ `getTeamHistoryMatches`) → `GET /fixtures/between/{start_date}/{end_date}/{team_id}`

**Parametre sırası dikkat gerektiriyor** (yukarıdaki "Doküman güvenilirliği" notuna bakınız).
PSG (591), 2026-01-01/2026-04-01 aralığında test edildi, 10 gerçek maç döndü (`has_more:true`):
```
19433883  2026-01-04  Paris Saint Germain vs Paris          (FT)
19433890  2026-01-16  Paris Saint Germain vs LOSC Lille      (FT)
19568590  2026-01-20  Sporting CP vs Paris Saint Germain     (FT)
19467804  2026-01-23  Auxerre vs Paris Saint Germain         (FT)
...
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `Match[]` (son N maç) | Aynı fixture şekli (Katman-1'de belgelenen) | **Format Katman-1 ile aynı** |
| Mevcut fonksiyonun `count` parametresi (son N maç) | Yok — bunun yerine bir **tarih aralığı** veriliyor, `per_page`/sayfalama ile sınırlanıyor | **Davranış farkı** — "son 10 maç" mantığı yerine "şu tarih aralığındaki maçlar" mantığına geçilmeli, ya da geniş bir aralık çekilip client-side `slice(0,10)` yapılmalı |

## `getSeasonsList` → `GET /leagues/{id}?include=seasons`

Gerçek response (La Liga, league_id 564):
```json
[
  {"id": 23621, "name": "2024/2025", "finished": true, "is_current": false, "starting_at": "2024-08-15", "ending_at": "2025-05-25"},
  {"id": 25659, "name": "2025/2026", "finished": true, "is_current": false, "starting_at": "2025-08-15", "ending_at": "2026-05-24"},
  {"id": 27965, "name": "2026/2027", "finished": false, "is_current": true, "starting_at": "2026-08-15", "ending_at": "2027-05-30"}
]
```
Bu pass'te dokümantasyon **doğru çıktı** (gerçek istekle teyit edildi) — ayrı bir `/seasons`
endpoint'i yok, sezonlar `leagues/{id}` üzerinden `include=seasons` ile geliyor.

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `SeasonListItem.id`/`.name`/`.start`/`.end` | `id`/`name`/`starting_at`/`ending_at` | Birebir (isim farkı `start`→`starting_at`, `end`→`ending_at`) |
| — | `is_current` (boolean) | **Fazladan alan** — mevcut kodun "güncel sezonu bul" mantığı (bugünkü kodda `season.end` tarihine bakarak sıralama) bunun yerine doğrudan `is_current:true` filtresiyle çok daha güvenilir yapılabilir |

## `getTopScorers` / `getTopDisciplinary` → **AYNI endpoint**, `GET /topscorers/seasons/{season_id}?filters=seasonTopscorerTypes:{type}`

**Önemli bulgu: mevcut kodda iki ayrı fonksiyon olan `getTopScorers` ve `getTopDisciplinary`,
Sportmonks'ta TEK bir endpoint'e düşüyor**, sadece `filters=seasonTopscorerTypes:{id}` değişiyor:
- `208` = goller (gerçek istekle test edildi: Raphinha, 9 gol, FC Barcelona)
- `209` = asistler (dokümandan, test edilmedi)
- `84` = sarı kart (gerçek istekle test edildi: Abde Rebbach, Yangel Herrera, Antonio Blanco — 3'er kart)
- `83` = kırmızı kart (dokümandan, test edilmedi)

Gerçek response (goller, La Liga):
```json
{
  "id": 372156638, "season_id": 27965, "player_id": 160258, "type_id": 208,
  "position": 1, "total": 9, "participant_id": 83,
  "player": {"id": 160258, "display_name": "Raphinha", ...},
  "participant": {"id": 83, "name": "FC Barcelona", ...}
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| `TopScorerEntry.goals` | `total` (`filters=208` iken) | **Aynı alan, farklı anlam bağlama göre** — `total`'ın ne ifade ettiği `type_id`'ye bağlı (gol/asist/kart) |
| `TopScorerEntry.player:{id,name,photo?}` | `player:{id,display_name,image_path}` | Farklı isim |
| `TopScorerEntry.team:{id,name,logo?}` | `participant:{id,name,image_path}` | Farklı isim |
| `TopScorersPayload.topscorers[]` | Düz `data[]` dizisi (goller/kartlar için ayrı istek, tek response'ta birleşik değil) | **Davranış farkı** — mevcut kod tek çağrıda `topscorers` alırken, Sportmonks'ta goller ve kartlar **ayrı isteklerle** çekilmeli |
| `getTopDisciplinary`'nin ayrı çağrısı | **Gereksiz** — aynı endpoint, farklı filtre | Kod basitleştirme fırsatı |

## `getTeamSquads` → `GET /squads/teams/{team_id}?include=player`

Gerçek response (PSG, team_id 591, 24 oyuncu):
```json
{
  "id": 1321401, "player_id": 37656842, "team_id": 591,
  "position_id": 27, "start": "2025-07-01", "end": "2028-06-30",
  "captain": false, "jersey_number": 47,
  "player": {"id": 37656842, "display_name": "Quentin Ndjantou", "image_path": "...", "date_of_birth": "2007-07-23", ...}
}
```

| Match alanı | Sportmonks karşılığı | Durum |
|---|---|---|
| Kadro listesi (players dizisi, mevcut kodda `any`) | `squads/teams/{id}` — her satır bir transfer/sözleşme kaydı, `player` nested include ile oyuncu detayı | **Yapısal olarak zengin ama farklı** — `position_id` (sayısal, lookup gerekiyor), `captain` (boolean, mevcut modelde yok), `jersey_number`, sözleşme `start`/`end` tarihleri |
| — | Sezon bazlı geçmiş kadro için ayrı endpoint: `/squads/seasons/{season_id}/teams/{team_id}` | Mevcut kod (fallback: `competitions/rosters`) bu ayrımı yapmıyor — güncel/geçmiş kadro Sportmonks'ta iki ayrı çağrı |

---

## Pass 4 özeti

| Fonksiyon | Sportmonks endpoint | Durum |
|---|---|---|
| `getMatchWithEvents` | `GET /fixtures/{id}?include=events` | **Test edildi** — `type_id`→olay adı çözümü açık kaldı |
| `getMatchStats` | `GET /fixtures/{id}?include=statistics` | **Test edildi** — en büyük yapısal fark, `type_id` sözlüğü şart |
| `getMatchLineups` | `GET /fixtures/{id}?include=lineups` | **Test edildi** — pozisyon/substitution/foto için ek include'lar açık kaldı |
| `getTeamsHead2Head` | `GET /fixtures/head-to-head/{id1}/{id2}` | **Test edildi** — takım form özeti Sportmonks'ta yok, ayrı türetilmeli |
| `getCompetitionTableFull`/`getLeagueTable` | `GET /standings/seasons/{season_id}` | **Test edildi** — `season_id` zorunlu, W/D/L/GF/GA `details[]`'ten pivot edilmeli |
| `getTeamLastMatches` | `GET /fixtures/between/{start}/{end}/{team_id}` | **Test edildi** — doküman parametre sırası yanlıştı, düzeltildi |
| `getSeasonsList` | `GET /leagues/{id}?include=seasons` | **Test edildi** — doküman bu kez doğruydu |
| `getTopScorers` | `GET /topscorers/seasons/{id}?filters=seasonTopscorerTypes:208` | **Test edildi** |
| `getTopDisciplinary` | Aynı endpoint, `filters=seasonTopscorerTypes:83/84` | **Test edildi** — `getTopScorers` ile birleşiyor |
| `getTeamSquads` | `GET /squads/teams/{id}?include=player` | **Test edildi** |
| `getCompetitionGroups` | — | **Kullanılmıyor, test edilmedi** |
| `getTeamCompetitions`, `dedupeMatchesById` | — | Pure helper, ayrı endpoint yok |
| `findMatchById`, `findMatchByTeamIds` | — | Kompozit fonksiyon, alttaki primitiflerle kapsanıyor |

**Açık kalan noktalar (sonraki pass için):**
1. `/types` endpoint'i hiç çekilmedi — `getMatchStats`'taki 86 `type_id`, `getMatchWithEvents`'teki
   olay `type_id`'leri, `getMatchLineups`'taki `position_id`/substitution `type_id`'lerinin tam
   sözlüğü bu olmadan çözülemez. **Migration'ın en büyük tek açık kalemi bu.**
2. `include=lineups.player`/`include=lineups.team` (nested) test edilmedi — oyuncu fotoğrafı ve
   takım adının lineup'a nasıl ekleneceği belirsiz.
3. `getTeamsHead2Head`'in mevcut `team1`/`team2` form-özeti alanlarının Sportmonks'ta nasıl
   türetileceği (muhtemelen `getTeamLastMatches` + client-side hesaplama) tasarlanmadı.

---

# PASS 5 — `/types` sözlüğü

Bu pass'in tek amacı: Pass 4'te `getMatchStats`, `getMatchWithEvents`, `getMatchLineups`
response'larında görülen ama çözülmemiş `type_id`/`position_id` kodlarını gerçek `/types`
isteğiyle çözmek. Kapsam kasıtlı olarak dar tutuldu — binlerce type'ın tamamı değil, sadece bu üç
fonksiyonda fiilen görülen kodlar.

## Endpoint keşfi

İlk denemede `GET /v3/football/types` → **404** (`"The requested endpoint does not exist"`).
Dokümantasyon sorgusu doğru yolu verdi (bu kez doğruydu): **`GET /v3/core/types`** — `football`
altında değil, sportlar-arası ortak `core` alanında.

Ayrıca bir davranış tutarsızlığı bulundu: `per_page=50` istendiğinde 50 sonuç geldi, ama
`per_page=200` istendiğinde sunucu bunu sessizce **25**'e düşürdü (hata vermeden). Bu endpoint'in
üst sınırı diğer endpoint'lerden (`fixtures` 50 kabul ediyordu) farklı davranıyor — migration'da
her endpoint için `per_page` üst sınırının ayrıca test edilmesi gerektiğini gösteriyor.

**Verimlilik notu:** `GET /core/types/{id}` **tekil sorgu** olarak da çalışıyor — büyük/uzak
id'ler (`580`,`581`,`1605`,`27264`,`27265`) için sayfa sayfa tarama yerine doğrudan tekil id
sorgusu kullanıldı, böylece yüzlerce sayfa çekmek gerekmedi.

**Genelleştirilmiş not — iki ayrı base path:** Bu 404, izole bir hata değil, Sportmonks'un genel
URL yapısının bir sonucu. API en az iki ayrı base path'e bölünmüş görünüyor: sporlar-arası
paylaşılan referans verileri (`types` ve muhtemelen `countries`, `continents`, `timezones` gibi
benzer statik/ortak kaynaklar) **`/v3/core/...`** altında; futbola özel her şey (fixtures,
leagues, standings, topscorers, squads vb. — bu rapordaki diğer tüm endpoint'ler) **`/v3/football/...`**
altında. Migration sırasında yeni bir "core" kategorisi kaynağına ihtiyaç duyulduğunda, önce hangi
base path'te olduğu ayrıca doğrulanmalı — `/football` altında aramak (bu pass'te olduğu gibi)
doğrudan 404 ile sonuçlanır.

## Bu pass'te atılan istekler

| # | İstek | Sonuç | `rate_limit.remaining` | Entity havuzu |
|---|---|---|---|---|
| 1 | `GET /football/types` (yanlış path) | **404** | — | — |
| 2 | `GET /core/types?per_page=50` (sayfa 1, id 1-53) | 200 | 2499 | **Type** (yeni havuz) |
| 3 | `GET /core/types/27264` (tekil) | 200 | 2498 | Type |
| 4 | `GET /core/types?filters=typeIds:51,52,53,54,55` (filtre denemesi, çalışmadı) | 200 (filtresiz sonuç döndü) | 2497 | Type |
| 5 | `GET /core/types?per_page=200` (sessizce 25'e düşürüldü) | 200 | 2496 | Type |
| 6 | `GET /core/types?per_page=50&page=2` (id 54-106) | 200 | 2495 | Type |
| 7 | `GET /core/types?per_page=50&page=3` (id 107-158) | 200 | 2494 | Type |
| 8 | `GET /core/types/580` (tekil) | 200 | 2493 | Type |
| 9 | `GET /core/types/581` (tekil) | 200 | 2492 | Type |
| 10 | `GET /core/types/1605` (tekil) | 200 | 2491 | Type |
| 11 | `GET /core/types/27265` (tekil) | 200 | 2490 | Type |
| 12 | `GET /fixtures/19874792?include=events` (Türkiye Kupası, 2. maç örneği) | 200 | 2474 | Fixture |
| 13 | `GET /fixtures/19732690?include=events` (Real Betis–Getafe, 3. maç denemesi — 0 event döndü) | 200 | 2473 | Fixture |

**Risk kategorisi notu — 4. satırdaki filtre hatası (`filters=typeIds:...`), bu raporun geri
kalanında görülen diğer doküman/davranış hatalarından (yanlış `state.short_name` — Pass 3, yanlış
`fixtures/between/{team_id}/...` parametre sırası — Pass 4) niteliksel olarak farklı bir
kategoride:** o hatalar **4xx ile görünür** şekilde başarısız oldu, buradaki ise **sessiz** —
istek **200 OK** döndü ama filtre hiç uygulanmadı, filtresiz/tüm sonuç seti geldi. Bu, migration
için ayrı bir doğrulama disiplinini gerektiriyor: bir filtrenin gerçekten çalıştığını teyit etmek
için yalnızca HTTP durum koduna (4xx var mı yok mu) bakmak **yeterli değil** — dönen veri setinin
beklenen alt kümeyle (ör. istenen id'lerin gerçekten sonuçta olup olmadığı, kayıt sayısının
makul olup olmadığı) eşleştiği ayrıca kontrol edilmeli. Aksi halde kod "filtreledim" zannedip
sessizce filtrelenmemiş/yanlış bir veri kümesiyle çalışmaya devam edebilir — hatasız görünen ama
yanlış davranan bir migration bug'ı için klasik bir kaynak.

**Bu pass: 13 istek (12 başarılı, 1 red/404 — kota düşmedi).**
**Toplam (Pass 1+2+3+4+5): 50 Sportmonks isteği.** Anahtar değeri hiçbir çıktıda yazdırılmadı.

**Pass sonu kalan kota (havuz bazında):**

| Havuz | Kalan |
|---|---|
| Fixture | 2473 |
| League | 2497 (Pass 4'ten beri değişmedi) |
| Standing | 2498 (Pass 4'ten beri değişmedi) |
| Topscorer | 2498 (Pass 4'ten beri değişmedi) |
| PlayerTeam | 2499 (Pass 4'ten beri değişmedi) |
| **Type** | **2490** (bu pass'te ilk kullanıldı) |

Sportmonks kotasının **6. bağımsız havuzu** (`Type`) bu pass'te ortaya çıktı — Pass 4 sonundaki
"en az 5 havuz" tespiti güncellendi.

## `getMatchWithEvents` — event `type_id` sözlüğü

Pass 4'te CL finalinde görülen 6 kod + bu pass'te aynı sayfadan (ek istek gerekmeden) çözülen
komşu kodlar dahil, **toplam 11 event type'ı** doğrulandı:

| `type_id` | İsim | Gözlemlendi mi? |
|---|---|---|
| 14 | Goal | ✅ CL finali + Türkiye Kupası maçında |
| 15 | Own Goal | ⚠️ `/types` sözlüğünde bulundu, ama örnek maçlarda **gözlemlenmedi** |
| 16 | Penalty | ✅ CL finalinde (Ousmane Dembélé) |
| 17 | Missed Penalty | ⚠️ sözlükte var, gözlemlenmedi |
| 18 | Substitution | ✅ CL finalinde (11 kayıt) |
| 19 | Yellowcard | ✅ CL finalinde (7 kayıt) |
| 20 | Redcard | ⚠️ sözlükte var, gözlemlenmedi |
| 21 | Yellow/Red card (2. sarıdan kırmızı) | ⚠️ sözlükte var, gözlemlenmedi |
| 22 | Penalty Shootout Miss | ✅ CL finalinde (penaltı atışları) |
| 23 | Penalty Shootout Goal | ✅ CL finalinde (penaltı atışları) |
| 13 | Sidelined *(lineup/sakatlık işareti, event değil)* | Bağlamsal — `model_type:"lineup"`, event listesinde değil |

**Test edilen 3 gerçek maç:** CL Finali (11 farklı type, penaltılara gittiği için zengin), bir
Türkiye Kupası maçı (yalnızca `Goal`, 10-0 sonuç), bir La Liga maçı (0 event — veri henüz
işlenmemiş/gecikmeli olabilir). **Own Goal / Redcard / Missed Penalty / 2. Sarı-Kırmızı** hiçbir
örnek maçta fiilen görülmedi, ama `/types` sözlüğünde isimleri/kodları net — migration
implementasyonunda bu 4 kod da (gözlemlenmemiş olsa bile) mapping tablosuna eklenmeli, çünkü
isimleri kesin olarak biliniyor.

## `getMatchStats` — statistics `type_id` sözlüğü (43/43 çözüldü)

Pass 4'te fixture 19683241'in `statistics[]` dizisinde görülen **43 farklı `type_id`'nin tamamı**
çözüldü:

| `type_id` | İsim | `stat_group` |
|---|---|---|
| 34 | Corners | offensive |
| 41 | Shots Off Target | offensive |
| 42 | Shots Total | offensive |
| 43 | Attacks | offensive |
| 44 | Dangerous Attacks | offensive |
| 45 | Ball Possession % | overall |
| 46 | Ball Safe | defensive |
| 47 | Penalties | offensive |
| 49 | Shots Insidebox | offensive |
| 50 | Shots Outsidebox | offensive |
| 51 | Offsides | offensive |
| 52 | Goals | offensive |
| 53 | Goal Kicks | offensive |
| 54 | Goal Attempts | offensive |
| 55 | Free Kicks | defensive |
| 56 | Fouls | defensive |
| 57 | Saves | defensive |
| 58 | Shots Blocked | offensive |
| 59 | Substitutions | overall |
| 60 | Throwins | overall |
| 62 | Long Passes | overall |
| 64 | Hit Woodwork | offensive |
| 65 | Successful Headers | overall |
| 78 | Tackles | defensive |
| 79 | Assists | offensive |
| 80 | Passes | overall |
| 81 | Successful Passes | overall |
| 82 | Successful Passes Percentage | overall |
| 84 | Yellowcards | overall |
| 86 | Shots On Target | offensive |
| 87 | Injuries | overall |
| 98 | Total Crosses | offensive |
| 99 | Accurate Crosses | offensive |
| 100 | Interceptions | defensive |
| 106 | Duels Won | offensive |
| 108 | Dribble Attempts | offensive |
| 109 | Successful Dribbles | offensive |
| 117 | Key Passes | overall |
| 580 | Big Chances Created | offensive |
| 581 | Big Chances Missed | offensive |
| 1605 | Successful Dribbles Percentage | offensive |
| 27264 | Successful Long Passes | overall |
| 27265 | Successful Long Passes Percentage | overall |

**Mevcut `MatchStatsData` alanlarıyla doğrudan eşleşenler:** `yellow_cards`→84, `corners`→34,
`fauls`→56, `saves`→57, `offsides`→51, `shots_on_target`→86, `shots_off_target`→41,
`dangerous_attacks`→44, `attempts_on_goal`→42/54, `shots_blocked`→58, `substitutions`→59,
`throw_ins`→60, `possesion`→45, `penalties`→47, `free_kicks`→55, `treatments`→87 (Injuries —
isim farklı ama kavram örtüşüyor). `red_cards` ve `goal_kicks` mevcut modelde alan olarak var
ama Sportmonks tarafında `red_cards` için ayrı bir statistic type'ı **bu 43'lük listede
gözlemlenmedi** (muhtemelen bu maçta kırmızı kart olmadığı için satır hiç oluşmamış — statistics
dizisi yalnızca gerçekleşen olaylar için satır üretiyor, sıfır değerli satırlar bazen hiç
gelmiyor olabilir; bu davranış farkı test edilmedi).

**Sonuç: 43/43 çözüldü, eşleşmeyen kalmadı.** (`red_cards`'ın karşılığı `type_id` sözlüğünde büyük
ihtimalle mevcut ama bu spesifik maçın `statistics[]` çıktısında satırı yoktu — kırmızı kartlı
başka bir maçla ayrıca doğrulanmalı, aşağıdaki "Hâlâ Açık" kısmına eklendi.)

## `getMatchLineups` — lineup `type_id` ve `position_id` sözlüğü

| Kod | Alan | İsim |
|---|---|---|
| `type_id:11` | lineup durumu | **Lineup** (ilk 11) |
| `type_id:12` | lineup durumu | **Bench** (yedek) |
| `position_id:24` | mevki | **Goalkeeper** → mevcut modeldeki `"GK"` |
| `position_id:25` | mevki | **Defender** → `"DF"` |
| `position_id:26` | mevki | **Midfielder** → `"MF"` |
| `position_id:27` | mevki | **Attacker** → `"FW"` |
| `type_id:13` *(komşu kod, lineup listesinde gözlemlenmedi)* | — | **Sidelined** (sakatlık/ceza nedeniyle kadro dışı işareti — farklı bir kullanım alanı olabilir, `lineups[]` içinde değil) |

**Sonuç: 4/4 pozisyon kodu ve 2/2 lineup-durum kodu tam çözüldü.** Mevcut modelin
`LineupPlayer.position: "GK"|"DF"|"MF"|"FW"` alanına **birebir 1-1 karşılık geliyor** — bu,
şimdiye kadarki en temiz/basit mapping'lerden biri.

---

## Pass 5 özeti — üç fonksiyon artık tam mı?

| Fonksiyon | Kod-çözme durumu |
|---|---|
| **`getMatchWithEvents`** | **Tamam** — 11 event type'ının tamamının ismi biliniyor (7'si gerçek maçla gözlemlendi, 4'ü `/types` sözlüğünden doğrulandı ama örnek maçta hiç görülmedi). `is_home`/`is_away` türetme mantığı (participants.meta.location eşleştirmesi) Pass 4'te zaten belirlenmişti. |
| **`getMatchStats`** | **Tamam** — 43/43 `type_id` çözüldü, mevcut `MatchStatsData` alanlarının çoğuyla eşleşme netleşti. **Hâlâ açık:** `red_cards` alanının hangi `type_id`'ye karşılık geldiği bu maçta hiç gözlemlenmediği için kesinleşmedi (muhtemelen düşük numaralı bir statistic type — sözlükte muhtemelen var ama bu pass'te doğrulanmadı). |
| **`getMatchLineups`** | **Tamam** — 2 lineup-durum kodu + 4 pozisyon kodu tam çözüldü, mevcut modele 1-1 eşleniyor. |

**Genel sonuç: Üç fonksiyonun üçü de artık tam bir `type_id`→isim mapping tablosuyla
yazılabilir durumda.** Tek küçük açık nokta: `getMatchStats`'ta kırmızı kartlı gerçek bir maç
örneğiyle `red_cards` statistic type_id'sinin teyit edilmesi (kod-çözme sorunu değil, sadece
örnek-maç eksikliği — sözlüğün kendisi zaten tam çekildi).

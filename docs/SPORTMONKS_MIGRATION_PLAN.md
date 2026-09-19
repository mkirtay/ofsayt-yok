# Sportmonks Migration Planı

**Girdi:** `docs/SPORTMONKS_MIGRATION.md` (Pass 1-5, 50 gerçek Sportmonks isteği + gerçek
livescore-api.com/Redis/Postgres kontrolleri ile doğrulanmış audit raporu).

**Bu belge ne değildir:** Kod değildir. Hangi sırayla, hangi kararlarla, hangi riskleri
göze alarak kod yazılacağının planıdır. Hiçbir adımı uygulamaya geçmeden önce gözden
geçirilmesi öneriliyor — mevcut "audit/rapor önce, değişiklik sonra" çalışma tarzıyla tutarlı.

---

## Faz 0 — Kararlar (onaylandı)

### Karar 1 — Eski `matchId`'lere bağlı verilerin kaderi → **Geriye dönük hiçbir iş yapılmayacak**

`MatchAnalysis`/`MatchTrivia` (OpenAI `gpt-4.1-mini` ile üretilen kredi-sistemi analiz
içeriği), `MatchComment`, `UserPrediction`, `PredictionRecord`, `CreditTransaction`
tabloları livescore-api.com'un ~7 haneli id'lerine bağlıydı. **Karar: fuzzy eşleme yok,
arşivleme yok, hiçbir bağlama/taşıma çalışması yapılmayacak.** Eski kayıtlar oldukları
gibi kalır (silinmeleri de gerekmiyor, sadece yeni Sportmonks id'li maçlarla hiçbir
otomatik bağlantıları olmayacak); yeni sistem sıfırdan, sadece Sportmonks id'leriyle
ilerler. Bu, Faz 2/madde 6'yı basitleştiriyor — orada "eski kayıtları nasıl ele alalım"
sorusu artık yok, sadece "yeni kayıtlar yeni id ile yazılır" var.

**Ayrıca not:** Bu karar, AI-destekli maç analizi/trivia özelliğinin (kredi sistemi +
`gpt-4.1-mini`) zaten sıfırdan bir bağlama ihtiyacı olmadığını ortaya çıkardı — yani bu,
o özelliği daha iyi bir UI/fikirle **yeniden tasarlamak için doğal bir fırsat penceresi**.
Bu, API migration'ının bir parçası DEĞİL, kasıtlı olarak ayrı ve migration'ı bloke etmeyen
bir iş kalemi olarak Faz 7'ye not edildi — migration'ın kendisi bu yeniden tasarımı
beklemeden ilerleyebilir.

### Karar 2 — `odds` özelliği → **İptal edildi**

Mevcut plan (Growth/Trialing) `odds` paketini içermiyor (403, kod 5002/5007). **Karar:**
özellik migration'da tamamen kapatılıp/gizlenecek, ileride add-on alınırsa yeniden
değerlendirilir. Migration'ı bloke etmiyor, ayrı bir iş kalemi.

### Karar 3 — `round`/`stage` ayrımı → **İki ayrı alan tutulacak**

Lig maçında hafta bilgisi `round.name` (düz sayı), kupa/Şampiyonlar Ligi gibi
turnuvalarda tur bilgisi `stage.name` ("Quarter-finals" gibi metin). **Karar:**
`Match.round` ve `Match.stage` iki ayrı alan olarak tutulacak, UI hangisi doluysa onu
gösterecek (lig sayfalarında "6. Hafta", kupa sayfalarında "Çeyrek Final").

---

## Faz 1 — Ortak altyapı (herkesin üzerine kurulacağı temel)

Bu fonksiyonlar Katman-1 ve Katman-2/3'ün ikisi tarafından da kullanılacak, önce ve
tek seferde doğru yazılmalı — sonradan değiştirmek her tüketen fonksiyonu etkiler.

1. **Sportmonks HTTP client'ı** — iki ayrı base path'i (`/v3/football/...` ve
   `/v3/core/...`) sabit olarak tanımla (Pass 5'teki genelleştirilmiş not). Her istekten
   sonra `rate_limit.remaining`'i havuz bazında (Fixture/League/Standing/Topscorer/
   PlayerTeam/Type — en az 6 bağımsız havuz) logla/izle.
2. **Pagination loop'u** — `parseTotalPages()`/paralel-sayfa-çekme deseni tamamen kaldırılıp
   `while(has_more) { ...; page = next_page }` ile değiştirilmeli (sıralı, paralel değil).
   Not: `per_page` üst sınırı endpoint'e göre değişiyor (`fixtures` 50 kabul etti, `core/types`
   200 isteyince sessizce 25'e düştü) — her endpoint için ayrı doğrulanmalı, evrensel bir
   "güvenli per_page" varsayılmamalı.
3. **State mapping tablosu** — gerçek `/states` response'undaki 26 durumu, mevcut 4 kovaya
   (`NOT STARTED`/`IN PLAY`/`HALF TIME BREAK`/`FINISHED`) indiren bir sabit tablo. Dokümana
   değil Pass 2'de kayıtlı gerçek `short_name` değerlerine göre yazılmalı.
4. **Skor türetme fonksiyonu** — `scores[]`'ı `description` alanına
   (`1ST_HALF`/`2ND_HALF`/`CURRENT`/`2ND_HALF_ONLY`) göre gruplayıp
   `{score, ht_score, ft_score}` üreten tek bir parse fonksiyonu (Katman-1 ve Katman-2/3'te
   tekrar tekrar kullanılacak).
5. **Dakika/zaman türetme fonksiyonu** — `periods[]` dizisinden `ticking===true` olanı
   bulup `minutes`+`seconds`'tan format et. **`currentPeriod`'a güvenme** — Pass 3'te
   dokümanla çelişecek şekilde hep `null` döndüğü kanıtlandı.
6. **round/stage çözümleyici** — Karar 3 uyarınca **iki ayrı alan** (`Match.round` +
   `Match.stage`) üreten bir fonksiyon: lig maçında `round.name`'i `round` alanına,
   knockout'ta `stage.name`'i `stage` alanına yazar (ikisi aynı anda dolu olmaz).
7. **Statik type_id sözlükleri** — Pass 5'te çıkarılan 3 tablo (11 event type, 43 statistic
   type, 4 pozisyon + 2 lineup-durum kodu) **runtime'da `/core/types`'a her seferinde istek
   atmak yerine** kod içine statik bir sabit/JSON dosyası olarak gömülmeli. Bu, quota'yı
   büyük ölçüde koruyor (aksi halde her maç detayı görüntülemesi ek `/core/types` isteği
   gerektirebilirdi). `red_cards` istatistik type_id'si gibi gözlemlenmemiş kodlar
   implementasyon sırasında kırmızı kartlı gerçek bir maçla tamamlanmalı.
8. **Venue/konum formatlayıcı** — `` `${venue.name}, ${venue.city_name}` `` (Pass 3'te
   önerilen, ama eski format hiçbir yerde saklı olmadığı için doğrulanamayan bir tasarım
   kararı — kabul edilip ilerlenmeli, geri dönüp teyit etme şansı yok).
9. **Hakem formatlayıcı** — `referees[]` içinden `type_id===6` filtrelenip `referee.name`
   alınarak mevcut tek-string `referee` alanına dönüştürülmeli (dokümanla çapraz
   doğrulanmış sözlük: 6=orta hakem, 7/8=yardımcı, 9=dördüncü hakem, 10=VAR).
10. **Filtre doğrulama disiplini** — Pass 5'te bulunan sessiz-filtre-hatası riskine karşı:
    herhangi bir `filters=...` parametresi kullanan yeni bir çağrı yazıldığında, sadece
    HTTP durumuna değil, dönen veri setinin gerçekten filtrelenmiş olup olmadığına
    (örn. istenen id'lerin sonuçta var olup olmadığına) bakan bir assertion/test eklenmeli.

---

## Faz 2 — Katman-1 migration (canlı skor / ana sayfa akışı)

En yüksek trafikli, en kritik yol. Faz 1 tamamlanmadan başlanmamalı.

1. `getAllLiveMatches`/`getLiveMatches` → `/livescores/inplay`
2. `getFixturesByDate` → `/fixtures/date/{date}`
3. `getFixturesByCompetition` → `/fixtures/between/{from}/{to}?filters=fixtureLeagues:{id}`
   (bare `/fixtures` YANLIŞ sonuç veriyor — tarihsiz çağrı asla yazılmamalı)
4. `getAllMatchesByDate` + `getAllCompetitionHistoryMatches` → ikisi de `/fixtures/between`
   üzerine düşüyor, mevcut iki ayrı fonksiyon **tek bir primitif + farklı tarih aralığı**
   parametresine indirgenebilir (kod basitleştirme fırsatı).
5. `fixture_id`/`id` reconciliation katmanını (`mergeMatchesForAllTab`,
   `mergeFixturesWithHistoryAndLive`) büyük ölçüde kaldır — Sportmonks'ta tüm endpoint'ler
   aynı `id`'yi kullanıyor, bu katman livescore-api.com'a özgü bir sorunu çözüyordu.
6. Postgres yazma noktalarını yeni 8 haneli Sportmonks id'lerine göre güncelle. Karar 1
   uyarınca eski kayıtlarla herhangi bir bağlama/taşıma işlemi YAPILMAYACAK — bu adım
   sadece yeni gelen maçların yeni id ile yazılmasından ibaret, ek bir migration script'i
   gerekmiyor.

**Bu fazın çıkışı:** ana sayfa, canlı skor listesi, tarih bazlı fikstür sayfaları
Sportmonks'tan besleniyor, eski reconciliation kodu kaldırılmış.

---

## Faz 2 — Sonuç Raporu

Faz 2'nin kodu (`liveScoreService.ts`'teki 5 Katman-1 fonksiyonu, `NEXT_PUBLIC_
SPORTMONKS_ENABLED` bayrağı, `/api/sportmonks/[...path]` proxy'si) yazıldı. Bayrak
kapalıyken sıfır davranış değişikliği var — eski livescore-api.com kod yolu aynen duruyor.

### ⚠️ Açık nokta — lig id eşlemesi eksik (ÇÖZÜLDÜ — bkz. aşağıdaki tablo)

`getFixturesByCompetition`/`getAllCompetitionHistoryMatches` livescore-api.com'a özgü
`competition_id` alıyor (`config/leagues.ts`/`config/worldCup.ts`), Sportmonks tamamen
farklı bir id uzayı kullanıyor. İlk yazımda `sportmonksProviderFlag.ts`'teki
`resolveSportmonksLeagueId` yalnızca Şampiyonlar Ligi'ni (244→2, Pass 4) biliyordu —
diğer tüm id'ler (Türkiye ligleri dahil) ağ isteği atmadan boş dizi + `console.warn`
dönüyordu. Bu, flag açıkken Türkiye lig sayfalarının boş görünmesine yol açıyordu.

**Bu artık çözüldü** — 2026-09-18'de uygulamada gerçekten kullanılan TÜM
`competition_id` sabitleri tek tek gerçek Sportmonks isteğiyle (`GET /leagues/
search/{ad}` + `GET /core/countries/{id}` ile ülke teyidi + o lig id'siyle gerçek bir
`/fixtures/between?filters=fixtureLeagues:{id}` çekip takım adlarının tanıdık olduğunu
görerek) doğrulandı. Detaylı kanıt/yöntem notu `sportmonksProviderFlag.ts`'teki
"Doğrulama turu 2" JSDoc bloğunda.

**livescore-api.com `competition_id` → Sportmonks `league_id` eşleme tablosu:**

| Lig/Turnuva | livescore-api.com id | Sportmonks `league_id` | Durum |
|---|---|---|---|
| Şampiyonlar Ligi | 244 | 2 | Doğrulandı (Pass 4) |
| UEFA Avrupa Ligi | 245 | 5 | Doğrulandı (2026-09-18) |
| UEFA Konferans Ligi | 446 | 2286 | Doğrulandı (2026-09-18) |
| Trendyol Süper Lig | 6 | 600 | Doğrulandı (2026-09-18) |
| Trendyol 1. Lig | 344 | 603 | Doğrulandı (2026-09-18) |
| Türkiye Kupası | 347 | 606 | Doğrulandı (2026-09-18) |
| İngiltere Premier Lig | 2 | 8 | Doğrulandı (2026-09-18) |
| Almanya Bundesliga | 1 | 82 | Doğrulandı (2026-09-18) |
| İspanya La Liga | 3 | 564 | Doğrulandı (Pass 1 + 2026-09-18 teyit) |
| İtalya Serie A | 4 | 384 | Doğrulandı (2026-09-18) |
| Fransa Ligue 1 | 5 | 301 | Doğrulandı (2026-09-18) |
| Dünya Kupası | 362 | — | **Hâlâ doğrulanamadı** |

**Hâlâ eksik:** `WORLD_CUP_COMPETITION_ID` (362). `GET /leagues/search/World%20Cup`
(ve "FIFA World Cup"/"World Cup 2026"/"Dünya Kupası" varyasyonları) hep "no result / no
access" döndü — Pass 3'teki aynı bulgunun tekrarı. Bu hesabın planı (`Growth Trialing`
+ `Euro Club Tournaments` add-on) UEFA kulüp turnuvalarına erişim veriyor ama Dünya
Kupası ayrı bir add-on/plan gerektiriyor gibi görünüyor. `resolveSportmonksLeagueId`
bilinçli olarak bunun için tahmini bir id İÇERMİYOR — `/world-cup` sayfası flag açıkken
boş dönmeye devam edecek (fallback korunuyor), kesin çözüm için ayrı bir plan/anahtar
teyidi gerekiyor.

---

## Faz 3 — Katman-2/3 migration (maç detay + karşılaştırma + sıralama)

Pass 4'teki kullanım haritasına göre öncelik sırası (en çok sayfaya bağlı olan önce):

1. **Önce temizlik:** `getCompetitionGroups` — 0 dış referans, migration'a dahil etmeden
   sil (ölü kod).
2. **`getCompetitionTableFull`/`getLeagueTable`** → `/standings/seasons/{season_id}`.
   `league_id` yetmiyor, önce `getSeasonsList`'ten `is_current:true` sezon çözülmeli.
   `W/D/L/GF/GA` düz alan değil, `details[]` dizisinden `type.name` string eşlemesiyle
   pivot edilmeli (bu eşleme kırılgan olabilir, `details[].type.name` değerleri sabit
   metin karşılaştırmasına dayanıyor — testte "Overall Won" gibi görülen isimler tam
   kopyalanmalı, yazım hatası bile olsa — doküman örneğinde "Overal Goals Scored" gibi
   bir yazım hatası görülmüştü, gerçek response'a güvenilmeli).
3. **`getTeamsHead2Head`** → `/fixtures/head-to-head/{id1}/{id2}`. Takım form-özeti
   (`team1`/`team2` alanları) Sportmonks'ta yok, `getTeamLastMatches`'ten client-side
   türetilmeli.
4. **`getTeamLastMatches`** → `/fixtures/between/{start}/{end}/{team_id}` (parametre sırası
   dikkat: `{team_id}` en sonda, dokümanın ilk verdiği sıra yanlıştı). "Son N maç" mantığı
   yerine tarih aralığı mantığına geçmek gerekiyor — geniş bir aralık çekip client-side
   `slice(0, N)` ya da sabit bir "son 90 gün" gibi varsayılan pencere kullanılabilir.
5. **`getMatchStats`/`getMatchWithEvents`/`getMatchLineups`** — Faz 1'deki statik type
   sözlükleri burada devreye giriyor. Üçü de `/fixtures/{id}?include=statistics|events|
   lineups` üzerinden, `participant_id`/`team_id`'nin `participants[].meta.location` ile
   home/away'e eşleştirilmesi gerekiyor (üçünde de tekrar eden bir mantık — ortak bir
   `resolveLocation(participantId, fixture)` helper'ı yazılabilir).
6. **`getTopScorers` + `getTopDisciplinary`** → tek endpoint'e (`/topscorers/seasons/{id}?
   filters=seasonTopscorerTypes:{208|209|83|84}`) birleştir, iki fonksiyonu tek
   parametrik fonksiyona indir (kod basitleştirme).
7. **`getSeasonsList`** → `/leagues/{id}?include=seasons`. `is_current:true` filtresi
   mevcut "bugünün tarihine göre sezon bul" mantığından daha güvenilir, onun yerine geçmeli.
8. **`getTeamSquads`** → `/squads/teams/{id}?include=player`. Güncel/geçmiş kadro ayrımı
   için ayrı endpoint (`/squads/seasons/{season_id}/teams/{team_id}`) gerekiyor, mevcut
   kodun `competitions/rosters` fallback'i bu ayrımı yapmıyordu — yeni bir dallanma noktası.
9. **`getTeamCompetitions`/`dedupeMatchesById`/`findMatchById`/`findMatchByTeamIds`** —
   pure helper/kompozit fonksiyonlar, alttaki primitifler değiştikçe otomatik uyumlu
   kalmaları için imzaları (input/output tipleri) değişmemeli, iç mantıkları güncellenmeli.

**Test edilmemiş, implementasyon sırasında ayrıca doğrulanması gereken noktalar:**
`include=lineups.player`/`include=lineups.team` (nested include — oyuncu fotoğrafı ve
takım adı için), `getMatchStats`'ta `red_cards` type_id'si (kırmızı kartlı gerçek bir maçla).

---

## Faz 3 — Sonuç Raporu

Kod yazıldı: 9 madde de `NEXT_PUBLIC_SPORTMONKS_ENABLED` bayrağına bağlandı (Faz 2 ile
aynı bayrak, yeni bir flag icat edilmedi), flag kapalıyken sıfır davranış değişikliği var.

**Madde 1 — temizlik:** `getCompetitionGroups` silindi (0 dış referans doğrulandı).
`CompetitionGroupItem` TİPİ, `worldCupTable.ts` hâlâ kullandığı için korundu.

**Madde 5'te işaret edilen açık noktalar — ikisi de kırmızı kart doğrulama turunda
(2026-09-18, La Liga fixture 19732740, Celta de Vigo vs Osasuna, Marcos Alonso kırmızı
kart) GERÇEK istekle kapatıldı:**
- `include=lineups.player` gerçekten oyuncu fotoğrafını (`image_path`) veriyor —
  doğrulandı. `include=lineups.team` hiç gerekmedi: takım adı zaten üst seviye
  `participants[]`'tan (`team_id` → `participants[].id` eşleşmesiyle) çözülüyor, ekstra
  include gereksiz.
- `getMatchStats`'ta `red_cards` → `type_id:83` ("Redcards", `stat_group:"overall"`) —
  Pass 5'in "hâlâ açık" bıraktığı tek nokta artık `typeDictionaries.ts`'te.
- Bonus (istenmemiş ama aynı maçta gerçek veride görülen, atlanmadı): 2 event type_id
  daha (`10`="VAR", `1697`="VAR_CARD") ve 1 statistic type_id daha (`27267`="Tackles
  Won") — dördü de `typeDictionaries.ts`'e `observed:true` olarak eklendi.

**Madde 2 — standings pivotu, PLANDAN SAPMA (bilinçli, gerekçeli):** Bu bölümün kendisi
`type.name`'i (yazım hatası dahil) birebir kopyalayıp ona göre pivotlamayı öneriyordu.
Gerçek `GET /standings/seasons/27965?include=participant;details.type` isteğinde
`type.developer_name` alanının da var olduğu görüldü (`"OVERALL_SCORED"` gibi,
yazım hatasından bağımsız, makine-okur bir anahtar) — pivot `type.name` yerine bunun
üzerinden yapıldı (`standingsPivot.ts`), `type.name` sadece yedek yol olarak kaldı.
Migration'ın kendi ana dersiyle ("dokümana değil gerçek response'a güven") tutarlı bir
karar. `goal_diff` de ayrıca `OVERALL_GOAL_DIFFERENCE` (`type_id:179`) satırından direkt
geliyor, çıkarma işlemiyle türetmeye gerek kalmadı (fallback yine de korundu).

**Madde 7 — `getSeasonsList`, PLANDA ÖNGÖRÜLMEMİŞ bir imza uyumsuzluğu bulundu:**
Plan bu maddeyi tek satırla geçiyordu ama implementasyon sırasında ortaya çıktı:
livescore-api.com'un `/seasons/list.json`'ı GLOBAL bir sezon kimlik uzayı sunuyordu
(fonksiyon hiç `competitionId` almıyordu), Sportmonks'ta sezonlar ise lig-scoped
(`/leagues/{id}?include=seasons`). `GetSeasonsListOptions`'a opsiyonel `competitionId`
eklendi (geriye dönük uyumlu) ve bunu geçirebilen 6 çağıran dosya (`useCompetitionSidebar.ts`,
`matches/[slug].tsx`, `teams/[id].tsx`, `useWorldCupBootstrap.ts`, `worldCupStandings.ts`,
`api/worldcup/team-history.ts`) güncellendi. `competitionId` verilmeden çağrılırsa (artık
imkansız olmalı ama savunma amaçlı) boş dizi + `console.warn` döner — tahmini bir sezon
asla dönmez.

**Madde 3 — `getTeamsHead2Head` form türetme:** `overall_form` (`getTeamHistoryMatches`'ten)
ve `h2h_form` (H2H fixture listesinden) `deriveMatchFormLetter` ile W/D/L olarak türetiliyor
— sadece `status==='FINISHED'` VE parse edilebilir bir `"H-A"` skoru olan maçlar sayılıyor.

**odds:** Hiçbir alan/kod eklenmedi (zaten migration'da iptaldi, bu fazda da dokunulmadı).

**Eski matchId'li verilerle bağlama:** Hiç yapılmadı (Karar 1 ile tutarlı) — bu fazın
fonksiyonları zaten salt-okunur (maç detayı/istatistik/sıralama görüntüleme), Postgres
yazma noktası içermiyor.

**Hâlâ açık/doğrulanamayan noktalar:**
1. `attempts_on_goal` alanı için Pass 5'in verdiği iki adaydan (`42`="Shots Total" /
   `54`="Goal Attempts") `42` seçildi — bu bir VARSAYIM, iki alanın farklı bir maçta
   farklı davrandığı gösterilmedi.
2. `LineupPlayer.substitution`'ın `"0"`/`"1"` dışında bir üçüncü durumu (örn. maç
   içi biri çıkıp biri girmeden yapılan bir değişiklik) hiç test edilmedi — sadece
   `type_id:11` (starter) / `12` (bench) ayrımı kullanıldı.
3. Dünya Kupası (`WORLD_CUP_COMPETITION_ID`) hâlâ Sportmonks'a map'lenemediği için
   (Faz 2'nin bıraktığı açık nokta) `getSeasonsList`/`getCompetitionTableFull`/
   `getTopScorers` gibi bu fazın TÜM fonksiyonları da `/world-cup` sayfası için flag
   açıkken boş dönmeye devam ediyor — ayrı bir plan/anahtar teyidi gerekiyor.
4. `getTeamsHead2Head`'in `assists` (`type_id:209`) gibi Pass 4'te "dokümandan, test
   edilmedi" olarak işaretlenen tip id'leri bu fazda da gerçek istekle doğrulanmadı
   (kapsam dışıydı — `getTopScorers` sadece gol/kart filtreleriyle çalışıyor).

**Testler:** 6 yeni fixture (gerçek istekten, La Liga standings/topscorers/squads/seasons +
Barcelona-Real Madrid H2H + Real Madrid son maçlar) + kırmızı kart doğrulama fixture'ı
(Celta de Vigo vs Osasuna, events+statistics+lineups). 3 yeni test dosyası
(`standingsPivot.test.ts`, `participantLocation.test.ts`, `sportmonksKatman2Mapper.test.ts`)
+ 1 kapsamlı wiring testi (`liveScoreService.sportmonksKatman2.test.ts`, 17 test). Toplam
paket 20 dosya / 152 test geçti.

---

## Faz 4 — Doğrulama

Bu rapor boyunca dokümantasyonun en az 3 kez gerçekle çelişmesi (yanlış `state.short_name`,
yanlış parametre sırası, hep `null` dönen `currentPeriod`) tek bir dersi doğruluyor:
**hiçbir endpoint dokümana güvenilerek yazılmamalı, her biri gerçek bir sandbox isteğiyle
kontrat testine bağlanmalı.**

- Her Faz 2/3 fonksiyonu için: gerçek bir Sportmonks isteğiyle alınan örnek response'u
  sabit bir test fixture'ı olarak kaydet, parse fonksiyonunu ona karşı test et.
- Silent-filter riski (Faz 1/madde 10) için: en az bir test, filtrelenmiş bir çağrının
  dönen veri setinde filtre dışı bir kayıt OLMADIĞINI açıkça assert etmeli.
- Canlı bir maçla uçtan uca bir manuel doğrulama: dakika göstergesinin gerçekten ilerlediği,
  skorun güncellendiği, state geçişlerinin (NS→1st→HT→2nd→FT) doğru yakalandığı.

---

## Faz 4 — Sonuç Raporu

**`attempts_on_goal` (madde 1) — KESİNLEŞTİ: `type_id 42` ("Shots Total").** İki bağımsız
gerçek maçta (Süper Lig fixture 19746621, La Liga fixture 19732740), her iki takım
satırında `42 = 41(off target) + 58(blocked) + 86(on target)` VE `42 = 49(insidebox) +
50(outsidebox)` — 4/4 satırda sıfır sapma. `54` ("Goal Attempts") bu toplamla hiç
örtüşmedi, ayrı/bağımsız bir istatistik olarak bırakıldı (`attempts_on_goal`'a
eşlenmiyor). Kanıt: `attemptsOnGoalVerification.json` + `sportmonksKatman2Mapper.test.ts`.

**`scoreDerivation.test.ts`'in eski `it.todo`'su (madde 2) — kapatıldı.** `superLigFixture.json`
(gerçek fixture 19746621, Fenerbahçe 1-2 Beşiktaş) CURRENT+2ND_HALF+1ST_HALF üçlüsünü
içeriyordu — artık gerçek bir `it()`. Yan bulgu: Sportmonks'ta `2ND_HALF` description'ı
"sadece 2. devre golleri" değil, 2. devre SONUNDAKİ KÜMÜLATİF skor (bu maçta `CURRENT`
ile birebir aynı çıktı) — `scoreDerivation.ts`'in "2ND_HALF'i doğrudan ft_score'a yaz"
tasarımı bu gerçek örnekle teyit edildi.

**`include=lineups.player`/`include=lineups.team` (madde 3) — İKİSİ DE KESİNLEŞTİ,
biri BEKLENMEDİK sonuçla.** `lineups.player` gerçekten çalışıyor ve `image_path`+
`display_name` veriyor (Pass 4'ün açık sorusu kapandı). `lineups.team` ise **geçersiz
bir include** — gerçek istek `{"message":"The requested include 'team' does not exist
on Lineup","code":5013}` ile hata verdi. `getMatchLineups`'ın takım adını
`fixture.participants[]`'tan (zaten Faz 3'te böyle yazılmıştı) çözmesi bir workaround
değil, TEK doğru yoldu — kod değişikliği gerekmedi, sadece bu bulgu belgelere işlendi.

**Kontrat testi envanteri (madde 4) — 3 gerçek eksik bulundu, hepsi kapatıldı:**
1. `mapSportmonksFixtureToMatch`'in `group_name`/`group_id` dalı hiç test edilmemişti
   → `groupEuropaLeague.json` (2022/23 Avrupa Ligi Grup A, taze gerçek istek).
2. `getCompetitionTableFull`'ın `group_id` client-side filtresi hiç test edilmemişti
   (mevcut fixture'ların hepsi `group_id:null`) → `standingsGroupedEuropaLeague.json`
   (aynı 2022/23 sezonu, 2 farklı grup).
3. `getTeamSquads`'ın geçmiş-kadro dalı (`opts.seasonId`), güncel-kadro fixture'ını
   yeniden kullanan bir testle "kapalı" görünüyordu ama endpoint'in GERÇEKTEN aynı
   şekli döndürüp döndürmediği hiç doğrulanmamıştı → taze istek, gerçekten FARKLI bir
   şekil bulundu (`captain`/`start`/`end` yok, ayrı kota havuzu: `PlayerStatistic` —
   Pass 5 sonundaki 6 havuzdan bağımsız 7. havuz) → `squadBarcelonaHistoric.json`.

Ayrıca `deriveMatchFormLetter` (`getTeamsHead2Head`) daha önce sadece "dizi boş değil"
diye gevşek test edilmişti — gerçek 4 H2H skorundan (2-0/2-1/4-3/3-2) elle hesaplanan
tam `['W','L','W','W']` dizisiyle sıkılaştırıldı.

**Silent-filter riski (madde 5) — 2 eksik bulundu, tamamlandı.** `getFixturesByCompetition`
zaten test ediliyordu ama aynı primitifi paylaşan `getAllCompetitionHistoryMatches` için
AYRI bir test yoktu — eklendi. `getTopScorers`/`getTopDisciplinary`'nin paylaştığı
`sportmonksFetchTopscorerRows` için HİÇ silent-filter testi yoktu — ikisi için de eklendi.
Kod tabanında `filters=...` kullanan toplam 2 nokta var (`fixtureLeagues`,
`seasonTopscorerTypes`), ikisi de artık test edilmiş durumda.

**Canlı doğrulama (madde 6) — otomatikleştirilemez, checklist yazıldı:**
[docs/SPORTMONKS_CANLI_DOGRULAMA_CHECKLIST.md](./SPORTMONKS_CANLI_DOGRULAMA_CHECKLIST.md).
Bu adım elle, gerçek bir maç sırasında çalıştırılmalı — henüz çalıştırılmadı.

**Testler:** 5 yeni gerçek fixture, 9 yeni/güçlendirilmiş test. Toplam paket **20 dosya /
161 test**, hepsi geçti; `tsc`/`eslint`/`next build` temiz.

**Kapsam dışı bırakılan (talimat gereği):** Dünya Kupası lig-id eşlemesi — hâlâ açık,
ayrı bir iş kalemi.

---

## Faz 5 — Geçiş stratejisi

Mevcut durum: `LIVESCORE_API_KEY` zaten 401 veriyor, site şu an canlı maç göstermiyor —
yani bu klasik bir "iki sağlayıcıyı aynı anda çalıştır, kademeli geçir" migration'ı değil,
daha çok "kapalı olan sistemi doğru sağlayıcıyla yeniden açma" migration'ı. Bu riski azaltıyor
(concurrent-provider tutarsızlık riski yok) ama veri bütünlüğü riski aynı derecede önemli
kalıyor (kredi sistemi/analiz özelliği gerçek veriye dayanıyor).

- Bir `PROVIDER=sportmonks` gibi bir env flag'i ile geçişi tek noktadan kontrol edilebilir
  yap — sorun çıkarsa hızlıca eski koda (varsa) dönülebilsin.
- Faz 2 (Katman-1) prod'a alınmadan Faz 3 (Katman-2/3) bitmiş olmak zorunda değil — Katman-1
  bağımsız olarak canlıya çıkabilir, Katman-2/3 (maç detay, karşılaştırma) ayrı bir
  yayın dalgası olabilir.

## Faz 6 — İzleme

- Kota, 6 bağımsız havuzda (Fixture/League/Standing/Topscorer/PlayerTeam/Type) ayrı ayrı
  izlenmeli — özellikle `Fixture` havuzu, canlı skor polling'i nedeniyle en yüksek hacimli
  olacak. Mevcut Upstash Redis cache katmanı (Pass 3'te boş bulundu ama altyapı zaten var)
  bu yükü azaltmak için canlı skor sonuçlarını kısa TTL ile cache'lemek üzere kullanılmalı.
- `per_page` üst sınırının endpoint'e göre değiştiği unutulmamalı (`core/types` 200
  istenince sessizce 25'e düştü) — her yeni endpoint entegre edilirken bu sınır ayrıca
  test edilmeli, evrensel bir sabit varsayılmamalı.

---

## Faz 7 (Opsiyonel, migration'dan bağımsız) — AI Analiz/Trivia özelliğinin yeniden tasarımı

Karar 1'in doğal sonucu: mevcut `MatchAnalysis`/`MatchTrivia` (kredi sistemi +
`OPENAI_MODEL=gpt-4.1-mini`) özelliği eski maçlara bağlanmayacağı için, bu özelliği
sıfırdan daha iyi bir UI/fikirle yeniden kurmanın önünde artık teknik bir engel yok —
eski veriyle uyumluluk kaygısı taşımıyor.

Bu faz **kasıtlı olarak burada detaylandırılmadı** — API migration'ının bir parçası değil,
ayrı bir ürün/tasarım konuşması. Migration'ı (Faz 1-6) bloke etmiyor, öncesinde, sırasında
veya sonrasında ele alınabilir. Ele alınacaksa en az şu sorular netleşmeli: model seçimi
(`gpt-4.1-mini` mi kalacak, güncellenecek mi), kredi sisteminin mantığı değişecek mi yoksa
sadece UI mi yenilenecek, ve hangi veriyi (Sportmonks'un zaten sağladığı istatistik/lineup/
form verisi) analiz girdisine dahil edeceği — bu son soru migration'daki Faz 1/3 çıktılarıyla
(statistics/events/lineups parse fonksiyonları) doğrudan besleniyor, yani migration bittiğinde
bu yeni özellik için daha zengin bir veri seti hazır olacak.

---

## Özet — Sıralı checklist

1. [x] Faz 0: 3 karar onaylandı (eski id'ler → geriye dönük iş yok; odds → iptal;
   round/stage → iki ayrı alan)
2. [x] Faz 1: ortak altyapı (client, pagination, state/skor/dakika/round-stage parser'ları,
   statik type sözlükleri, venue/referee formatlayıcı, filtre-doğrulama disiplini)
3. [x] Faz 2: Katman-1 (canlı skor/ana sayfa) migration + reconciliation kodunun kaldırılması
   (+ ayrı bir takip görevinde lig-id eşleme tablosu tamamlandı, bkz. `sportmonksProviderFlag.ts`)
4. [x] Faz 3: Katman-2/3 (maç detay, H2H, sıralama, kadro) migration — bkz. yukarıdaki
   "Faz 3 — Sonuç Raporu". Kırmızı kart (`red_cards` type_id) ve nested lineup include
   (`lineups.player`) doğrulamaları bu fazda GERÇEK istekle kapatıldı — madde 5'in altı
   boşaldı, aşağıdaki checklist'ten çıkarıldı.
5. [x] Faz 4: `attempts_on_goal` kesinleşti (42), eksik kontrat testleri tamamlandı,
   nested lineup include doğrulandı (`lineups.team` GEÇERSİZ, `lineups.player` çalışıyor),
   silent-filter kapsamı tamamlandı — bkz. "Faz 4 — Sonuç Raporu". **Canlı manuel doğrulama
   HENÜZ ÇALIŞTIRILMADI** (checklist hazır: `docs/SPORTMONKS_CANLI_DOGRULAMA_CHECKLIST.md`).
   Dünya Kupası lig-id eşlemesi hâlâ açık (kapsam dışı, ayrı iş kalemi).
6. [x] Faz 6: canlı skor cache'i (`liveScoreCache.ts`, TTL 20 sn, proxy route'unda) + kota izleme
   (`quotaMonitor.ts` → Sentry; havuz tag'li breadcrumb, %10 altı warning, %2 altı error).
   Kademeli yayın (Faz 5) proje yalnızca local'de çalıştığı için ertelendi.
   Ayrıca İlk 11 formasyon dizilimi düzeltildi (`utils/lineupFormation.ts`, `formation_field` ızgarası).
7. [ ] Faz 7 (opsiyonel, ayrı zamanlama): AI analiz/trivia özelliğinin yeniden tasarımı

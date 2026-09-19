import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';

/**
 * Faz 2 sağlayıcı anahtarı — Katman-1 fonksiyonlarını livescore-api.com yerine
 * Sportmonks'a yönlendirmek için. `NEXT_PUBLIC_` önekli: bu bayrağa göre dallanan
 * fonksiyonlar (`liveScoreService.ts`'teki 5 Katman-1 fonksiyonu, `MatchHubPage`)
 * hem SSR'da hem doğrudan tarayıcıda (react-query hook'ları) çalışıyor — önek
 * olmasaydı tarayıcı bundle'ında her zaman `undefined` okunur, bayrak orada asla
 * açılamazdı. Değerin kendisi bir sır değil (sadece bir boolean), tarayıcıya
 * gitmesinde sakınca yok — gerçek `SPORTMONKS_API_KEY` ayrı, hiç `NEXT_PUBLIC_`
 * almıyor (bkz. sportmonksRuntimeClient.ts).
 */
export function isSportmonksProviderEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SPORTMONKS_ENABLED === 'true';
}

/**
 * livescore-api.com `competition_id` değerini Sportmonks `league_id`'ye çevirir.
 *
 * ÖNEMLİ KISIT: yeni bir eşleme eklemeden önce gerçek bir istekle (ideal olarak
 * `GET /leagues/search/{ad}` + o lig id'sinden gerçek bir fixture çekip takım
 * adlarının tanıdık olduğunu görerek) doğrulanmalı — TAHMİNİ bir sayı UYDURMAK
 * yerine (yanlış lige ait maçları sessizce göstermek riski) sadece doğrulanmış
 * eşleme kullanılıyor; eşlemesi olmayan bir id `null` döner ve çağıran taraf
 * (bkz. liveScoreService.ts) boş sonuç döner — sessizce yanlış veri yerine
 * sessizce eksik veri tercih edildi.
 *
 * Doğrulama turu 1 — Pass 4 (docs/SPORTMONKS_MIGRATION.md, satır 381):
 * `GET /leagues/2` → Şampiyonlar Ligi, TEK eşleme.
 *
 * Doğrulama turu 2 — 2026-09-18, bu görev kapsamında (`config/leagues.ts`'teki
 * `SIDEBAR_LEAGUES`/`COMPARE_LEAGUE_GROUPS`'ta kullanılan TÜM id'ler tek tek
 * `GET /leagues/search/{ad}` ile bulundu, `GET /core/countries/{id}` ile ülke
 * teyit edildi, sonra o lig id'siyle `GET /fixtures/between/...?filters=
 * fixtureLeagues:{id}` çekilip dönen HER satırın `league_id`'sinin istenenle
 * eşleştiği + takım adlarının o lige ait tanıdık kulüpler olduğu görüldü —
 * `checkFilteredResult`'ın (filterAssertion.ts) runtime'da yaptığı kontrolün
 * elle, tek seferlik karşılığı):
 * - Türkiye: `600`="Super Lig" (Galatasaray/Fenerbahçe/Beşiktaş/Trabzonspor),
 *   `603`="1. Lig" (Antalyaspor/Boluspor/Sivasspor/Kayserispor — TFF 1. Lig),
 *   `606`="Turkish Cup" (zaten `__fixtures__/inplayFixture.json`'daki gerçek
 *   örnekle örtüşüyor). Üçü de `country_id:404`="Turkey" (`/core/countries/404`).
 * - Büyük 5: `8`="Premier League"/England (Liverpool/Man City/Tottenham — DİKKAT:
 *   aynı isimde `609`="Premier League"/Ukraine de var, country_id ile ayrıştırıldı),
 *   `82`="Bundesliga"/Germany (Dortmund/Leverkusen — `85`="2. Bundesliga" DEĞİL),
 *   `564`="La Liga"/Spain (zaten Pass 1'de Real Betis/Getafe ile doğrulanmıştı,
 *   burada teyit edildi — `567`="La Liga 2" DEĞİL), `384`="Serie A"/Italy
 *   (Napoli/Inter/Roma — DİKKAT: `648`="Serie A"/Brazil ile karışmasın),
 *   `301`="Ligue 1"/France (PSG/Monaco/Lyon, tek sonuç).
 * - UEFA: `5`="Europa League" (Benfica-AC Milan, Trabzonspor da bu turda görüldü),
 *   `2286`="Europa Conference League" (Trabzonspor-KuPS, `short_code:"UEFA ECL"`).
 *   İkisi de `country_id:41`="Europe" (uluslararası turnuva, tek ülkeye ait değil).
 *
 * DOĞRULANAMADI: `WORLD_CUP_COMPETITION_ID` (362). `GET /leagues/search/World%20
 * Cup` (ve "FIFA World Cup"/"World Cup 2026"/"Dünya Kupası" varyasyonları) hep
 * "No result(s) found... or you don't have access to it via your current
 * subscription" döndü — Pass 3'teki aynı bulgunun (satır 385) tekrarı. Bu hesabın
 * planı (`Growth Trialing` + `Euro Club Tournaments` add-on) UEFA kulüp
 * turnuvalarına erişim veriyor ama Dünya Kupası ayrı bir add-on/plan gerektiriyor
 * gibi görünüyor — kesin teyit için farklı bir plan/anahtarla tekrar denenmeli.
 * Fallback (boş dizi + warn) bilinçli olarak KORUNDU, tahmini bir id yazılmadı.
 */
const VERIFIED_LEGACY_TO_SPORTMONKS_LEAGUE_ID: Record<number, number> = {
  244: 2, // UEFA_CHAMPIONS_LEAGUE_ID — Pass 4, GET /leagues/2 ile doğrulandı
  245: 5, // UEFA_EUROPA_LEAGUE_ID — 2026-09-18, GET /leagues/search/Europa%20League
  446: 2286, // UEFA_CONFERENCE_LEAGUE_ID — 2026-09-18, GET /leagues/search/Conference%20League
  6: 600, // Trendyol Süper Lig (TURKEY_COMPETITION_IDS[0]) — 2026-09-18
  344: 603, // Trendyol 1. Lig (TURKEY_COMPETITION_IDS[1]) — 2026-09-18
  347: 606, // Türkiye Kupası (TURKEY_COMPETITION_IDS[2]) — 2026-09-18, __fixtures__/inplayFixture.json ile de örtüşüyor
  2: 8, // İngiltere Premier Lig (BIG_FIVE_COMPETITION_ORDER[0]) — 2026-09-18
  1: 82, // Almanya Bundesliga (BIG_FIVE_COMPETITION_ORDER[1]) — 2026-09-18
  3: 564, // İspanya La Liga (BIG_FIVE_COMPETITION_ORDER[2]) — Pass 1'de zaten kullanılmıştı, 2026-09-18'de teyit edildi
  4: 384, // İtalya Serie A (BIG_FIVE_COMPETITION_ORDER[3]) — 2026-09-18
  5: 301, // Fransa Ligue 1 (BIG_FIVE_COMPETITION_ORDER[4]) — 2026-09-18
  // 362 (WORLD_CUP_COMPETITION_ID): DOĞRULANAMADI — bkz. yukarıdaki not, bilinçli olarak eklenmedi.
};

export function resolveSportmonksLeagueId(legacyCompetitionId: number | string): number | null {
  const legacy = Number(legacyCompetitionId);
  if (!Number.isFinite(legacy)) return null;
  return VERIFIED_LEGACY_TO_SPORTMONKS_LEAGUE_ID[legacy] ?? null;
}

/** `resolveSportmonksLeagueId`'nin tersi — doğrulanmış Sportmonks `league_id` → legacy `competition_id`. */
export function resolveLegacyCompetitionId(sportmonksLeagueId: number | string): number | null {
  const sm = Number(sportmonksLeagueId);
  if (!Number.isFinite(sm)) return null;
  for (const [legacy, mapped] of Object.entries(VERIFIED_LEGACY_TO_SPORTMONKS_LEAGUE_ID)) {
    if (mapped === sm) return Number(legacy);
  }
  return null;
}

/**
 * Bir maçın `competition.id` değerini, `getCompetitionTableFull`/`getSeasonsList` gibi
 * legacy `competition_id` bekleyen fonksiyonlara verilecek forma çevirir.
 *
 * Sportmonks açıkken fikstürün `competition.id`'si Sportmonks `league_id`'sidir (Süper Lig = 600),
 * legacy id ise 6 — çevrilmeden geçilirse 600 eşlemesiz kalıp "Puan tablosu bulunamadı" verir,
 * 5 gibi çakışan bir id ise sessizce YANLIŞ lige (5 = Ligue 1) gider. Eşlemesi olmayan id `null`
 * döner (yanlış tablo yerine tablo yok); Dünya Kupası (362) Sportmonks'ta doğrulanamadığı için
 * olduğu gibi geçer.
 */
export function toStandingsCompetitionId(
  matchCompetitionId: number | string | null | undefined,
): number | null {
  if (matchCompetitionId == null) return null;
  const id = Number(matchCompetitionId);
  if (!Number.isFinite(id)) return null;
  if (!isSportmonksProviderEnabled()) return id;
  if (id === WORLD_CUP_COMPETITION_ID) return id;
  return resolveLegacyCompetitionId(id);
}

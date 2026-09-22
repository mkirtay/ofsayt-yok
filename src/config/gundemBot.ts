/**
 * Gündem botu yapılandırması. Poller YALNIZCA bu liglerin (Sportmonks `league_id`) canlı maçlarını işler.
 * Varsayılan: Süper Lig (600), Türkiye Kupası (606), Premier League (8), Bundesliga (82), La Liga (564), Serie A (384),
 * Ligue 1 (301), Şampiyonlar Ligi (2), UEFA Avrupa Ligi (5). `GUNDEM_BOT_LEAGUE_IDS` (virgülle ayrılmış id'ler) ile değiştirilir.
 * (id'ler `bot/leagueNames.ts` ile aynı kaynaktan; yalnızca 600 canlı doğrulandı.)
 */
export const DEFAULT_BOT_LEAGUE_IDS: readonly number[] = [600, 606, 8, 82, 564, 384, 301, 2, 5];

export function getBotLeagueIds(env: string | undefined = process.env.GUNDEM_BOT_LEAGUE_IDS): Set<number> {
  const parsed = (env ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return new Set(parsed.length > 0 ? parsed : DEFAULT_BOT_LEAGUE_IDS);
}

/** Tick başına fixture başına en fazla bu kadar yeni taslak (ilk çalıştırma / uzun kesinti selini sınırlar). */
export const MAX_NEW_DRAFTS_PER_FIXTURE = 5;

/** Sezon golcü tablosu önbelleği (saniye) — `statsCache.ts` ile aynı 30 dk. */
export const SCORERS_CACHE_TTL_SECONDS = 30 * 60;

/** VAR yeniden doğrulaması: golden sonra bu kadar dakika içindeki aynı takım VAR olayı taslağı eskitir (sezgisel). */
export const VAR_WINDOW_MINUTES = 10;

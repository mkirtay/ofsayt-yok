/**
 * X (Twitter) botu yapılandırması. Poller YALNIZCA bu liglerin (Sportmonks `league_id`) maçlarını işler.
 * Varsayılan: Süper Lig (600), Şampiyonlar Ligi (2), UEFA Avrupa Ligi (5). `X_BOT_LEAGUE_IDS` (virgülle ayrılmış) ile değişir.
 * Maliyet: X API kullandıkça ödemeli; tweet sayısı lig sayısıyla artar, liste bilerek dar.
 *
 * `X_BOT_MODE`: tanımsız / `off` → hiçbir şey yapmaz; `dry` → tweet'leri ÜRETİR ama atmaz (yanıtta döner, ayrı Redis anahtarları);
 * `live` → gerçekten tweet atar.
 */
export const DEFAULT_X_BOT_LEAGUE_IDS: readonly number[] = [600, 2, 5];

export function getXBotLeagueIds(env: string | undefined = process.env.X_BOT_LEAGUE_IDS): Set<number> {
  const parsed = (env ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  return new Set(parsed.length > 0 ? parsed : DEFAULT_X_BOT_LEAGUE_IDS);
}

export type XBotMode = 'off' | 'dry' | 'live';

export function getXBotMode(env: string | undefined = process.env.X_BOT_MODE): XBotMode {
  const v = (env ?? '').trim().toLowerCase();
  return v === 'live' || v === 'dry' ? v : 'off';
}

/** Tick başına en fazla bu kadar tweet (kesinti sonrası sel ve maliyet sınırı). */
export const X_BOT_MAX_TWEETS_PER_TICK = 3;
/** Golün ilk görüldüğü an → bu süre içinde 2. tick'te hâlâ listedeyse (VAR iptali elendi) atılır. */
export const X_BOT_SEEN_TTL_SECONDS = 6 * 3600;
/** Atılmış tweet işareti (mükerrer önleme). */
export const X_BOT_SENT_TTL_SECONDS = 3 * 24 * 3600;
/** Biten maç bulunamazsa (inplay'den düştü ama sonuç henüz FINISHED değil) bu kadar tick yeniden denenir. */
export const X_BOT_FINAL_MAX_TRIES = 20;

/**
 * Tweet'e maç bağlantısı (getscor3.com/matches/<id>) — trafik için. X bağlantılı gönderiyi düz gönderiden ÇOK daha pahalı
 * faturalıyor (üçüncü taraf kaynaklara göre ~$0,20 / ~$0,015, doğrulanmadı) ve bağlantılı tweet erişimde de geride kalır.
 * `X_BOT_LINKS`: `final` (varsayılan: yalnız maç sonu), `all` (gol + maç sonu), `none`.
 */
export type XBotLinkMode = 'none' | 'final' | 'all';

export function getXBotLinkMode(env: string | undefined = process.env.X_BOT_LINKS): XBotLinkMode {
  const v = (env ?? '').trim().toLowerCase();
  return v === 'none' || v === 'all' ? v : 'final';
}

/**
 * Maç başına görüntülenme + yorum sayaçları ("👁 753 · 💬 18").
 *
 * GÖRÜNÜRLÜK BAYRAĞI — `NEXT_PUBLIC_MATCH_COUNTERS_PUBLIC` (varsayılan KAPALI):
 *   - yok / "0" → sayılar YALNIZ yönetici (`role === 'ADMIN'`) içindir: `/api/matches/counters` diğer herkese 403 döner,
 *     istemci de isteği hiç atmaz (sayı verisi admin olmayana gitmez).
 *   - "1" → herkese açık (uç oturumsuz da yanıt verir, CDN'de kısa süre saklanır). `NEXT_PUBLIC_*` derlemede gömülür →
 *     değiştirince yeniden deploy gerekir.
 *
 * Görüntülenme sayımı bayraktan bağımsız HER ZAMAN çalışır (veri birikmeli): istemci maç detayını açınca tek bir hafif
 * POST atar (maç sayfası CDN'de önbellekli → SSR'da sayılamaz).
 */
import { isLightPageBot } from '@/config/crawlers';

export const MATCH_COUNTERS_PUBLIC = process.env.NEXT_PUBLIC_MATCH_COUNTERS_PUBLIC === '1';

/** Sayı rozetini bu kullanıcı görebilir mi (istemci + sunucu aynı kural). */
export function canSeeMatchCounters(user: { role?: string | null } | null | undefined, isPublic = MATCH_COUNTERS_PUBLIC): boolean {
  return isPublic || user?.role === 'ADMIN';
}

/** Görüntülenme anahtarının ömrü: son görüntülenmeden itibaren 30 gün (her INCR'da yenilenir). */
export const VIEW_TTL_SECONDS = 30 * 24 * 60 * 60;
/** Aynı izleyici (IP + UA) aynı maçı bu süre içinde tekrar açarsa sayılmaz. */
export const VIEW_DEDUP_SECONDS = 30 * 60;
/** Görüntülenme POST'u: IP başına dakikada en çok. */
export const VIEW_RATE_LIMIT = 30;
export const VIEW_RATE_WINDOW_MS = 60_000;
/** Toplu okuma: istek başına en çok maç (günün listesi ~300 maç); Redis MGET'i bu boyda parçalara bölünür. */
export const COUNTERS_MAX_IDS = 400;
export const COUNTERS_MGET_CHUNK = 100;

/**
 * `isLightPageBot` (AI/SEO kazıyıcı) + arama motorları, önizleme botları, başsız tarayıcılar ve ölçüm araçları.
 * Bunlar sayfayı görebilir ama görüntülenme sayılmaz.
 */
const GENERIC_BOT_RE =
  /bot\b|bot\/|crawler|spider|slurp|crawl|facebookexternalhit|whatsapp|telegram|discord|preview|headless|lighthouse|pagespeed|phantomjs|puppeteer|playwright|selenium|curl\/|wget|python-requests|httpclient|okhttp|go-http-client|node-fetch|axios/i;

export function isCounterBot(userAgent: string | string[] | null | undefined): boolean {
  const ua = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
  if (!ua || ua.trim().length < 10) return true;
  return isLightPageBot(ua) || GENERIC_BOT_RE.test(ua);
}

const MATCH_ID_RE = /^\d{1,12}$/;

/** Sportmonks fixture id ("123456"); geçersizse null. Negatif/demo id'ler sayılmaz. */
export function parseCounterMatchId(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
  return MATCH_ID_RE.test(s) ? s : null;
}

/** `?ids=1,2,3` → geçerli, tekil, en çok `COUNTERS_MAX_IDS` id. */
export function parseCounterIds(raw: unknown): string[] {
  const s = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : '';
  const out = new Set<string>();
  for (const part of s.split(',')) {
    const id = parseCounterMatchId(part);
    if (id) out.add(id);
    if (out.size >= COUNTERS_MAX_IDS) break;
  }
  return [...out];
}

export type MatchCounts = { views: number; comments: number };
export type MatchCountsMap = Record<string, MatchCounts>;

/** Kısa gösterim: 753 → "753", 1530 → "1,5B" (tr) / "1.5K" (en). */
export function formatCount(n: number, locale: string): string {
  if (n < 1000) return String(n);
  const tr = locale.startsWith('tr');
  const value = n < 1_000_000 ? n / 1000 : n / 1_000_000;
  const unit = n < 1_000_000 ? (tr ? 'B' : 'K') : tr ? 'Mn' : 'M';
  const rounded = value >= 100 ? Math.round(value).toString() : (Math.round(value * 10) / 10).toString();
  return `${tr ? rounded.replace('.', ',') : rounded}${unit}`;
}

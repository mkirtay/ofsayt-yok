/**
 * API-Football (v3.football.api-sports.io) sunucu istemcisi — YALNIZ sunucu; tarayıcı AF'ye gitmez (BFF: pages/api/national/*).
 * Anahtar `API_FOOTBALL_KEY` (Pro: 7500/gün), `x-apisports-key` başlığıyla; asla loglanmaz / hata iletisine konmaz.
 *
 * Kota bilinci: (1) uygulama içi günlük sayaç (Redis, UTC gün) `DAILY_SOFT_LIMIT`'e varınca istek atılmaz (sayfalar CDN /
 * SWR önbelleğinden servis edilir, canlı veri Sportmonks tarafını etkilemez); (2) yanıt başlığındaki kalan günlük hak
 * (`x-ratelimit-requests-remaining`) düşükse uyarı. AF hataları 200 gövdede `errors` ile gelir → hata sayılır.
 */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { withRedis } from '@/lib/redis';

export const AF_BASE_URL = 'https://v3.football.api-sports.io';
export const AF_TIMEOUT_MS = 8_000;
/** Pro plan 7500/gün; milli maç sistemi bu iç bütçeyi kullanır. */
export const DAILY_SOFT_LIMIT = 5_000;
/** Kombine aracının (admin) AYRI günlük payı: milli maç sayacını yemez, onun tükenmesinden etkilenmez (5000 + 1500 < 7500). */
export const COMBO_DAILY_LIMIT = 1_500;

/** Hangi iç bütçeden düşülür. */
export type AfBudgetPool = 'national' | 'combo';

export class ApiFootballError extends Error {
  constructor(
    message: string,
    readonly kind: 'config' | 'budget' | 'http' | 'api' | 'network',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiFootballError';
  }
}

export type AfEnvelope<T> = { response: T[]; errors?: unknown; results?: number };

function hasErrors(errors: unknown): boolean {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === 'object') return Object.keys(errors as object).length > 0;
  return false;
}

/** Günlük sayaç +1; limit aşıldıysa false. Redis yoksa / hata → izin ver (fail-open). */
async function takeDailyBudget(pool: AfBudgetPool = 'national', now: number = Date.now()): Promise<boolean> {
  const day = new Date(now).toISOString().slice(0, 10);
  // Milli maç anahtarı eski haliyle kalır (sayaç sürekliliği); kombine kendi anahtarını kullanır.
  const key = pool === 'combo' ? `${cacheKeyPrefix()}af:daily:combo:${day}` : `${cacheKeyPrefix()}af:daily:${day}`;
  const limit = pool === 'combo' ? COMBO_DAILY_LIMIT : DAILY_SOFT_LIMIT;
  const used = await withRedis(async (r) => {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 2 * 24 * 60 * 60);
    return n;
  }, 0);
  return used <= limit;
}

export async function apiFootballGet<T>(
  path: string,
  params: Record<string, string | number>,
  fetchImpl: typeof fetch = fetch,
  pool: AfBudgetPool = 'national',
): Promise<AfEnvelope<T>> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new ApiFootballError('API_FOOTBALL_KEY tanımlı değil', 'config');
  if (!(await takeDailyBudget(pool))) throw new ApiFootballError('API-Football günlük iç bütçe doldu', 'budget');

  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  let res: Response;
  try {
    res = await fetchImpl(`${AF_BASE_URL}${path}${qs ? `?${qs}` : ''}`, {
      headers: { 'x-apisports-key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(AF_TIMEOUT_MS),
    });
  } catch {
    throw new ApiFootballError('API-Football isteği başarısız (ağ / zaman aşımı)', 'network');
  }
  if (!res.ok) throw new ApiFootballError(`API-Football HTTP ${res.status}`, 'http', res.status);
  const remaining = Number(res.headers.get('x-ratelimit-requests-remaining'));
  if (Number.isFinite(remaining) && remaining < 500) console.warn('[api-football] günlük kalan hak düşük', remaining);
  const body = (await res.json()) as AfEnvelope<T>;
  // `errors` yalnız sağlayıcının hata metnidir (anahtar içermez): sınır aşımı / parametre hatası ayırt edilebilsin.
  if (hasErrors(body.errors)) throw new ApiFootballError(`API-Football hata döndürdü: ${JSON.stringify(body.errors).slice(0, 200)}`, 'api');
  return body;
}

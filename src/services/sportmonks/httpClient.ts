/**
 * Sportmonks v3 HTTP client.
 *
 * Pass 5 "Endpoint keşfi" (docs/SPORTMONKS_MIGRATION.md): Sportmonks en az iki ayrı
 * base path'e bölünmüş — sporlar-arası ortak referans verileri (`types` ve benzerleri)
 * `/v3/core/...` altında, futbola özel her şey (fixtures, leagues, standings,
 * topscorers, squads...) `/v3/football/...` altında. `/football` altında `core`
 * kaynağı aramak 404 ile sonuçlanıyor (gerçek istekle doğrulandı) — bu yüzden
 * base path burada tek bir sabitte gömülü değil, her çağrıda açıkça seçiliyor.
 *
 * Pass 1 Genel Bulgu 4 + Pass 4/5: kota en az 6 bağımsız havuzda izleniyor
 * (Fixture/League/Standing/Topscorer/PlayerTeam/Type). Her istekten sonra
 * `rate_limit.requested_entity` + `remaining` loglanır.
 */
import type { SportmonksEnvelope, SportmonksRateLimit } from './types';
import { reportSportmonksQuota } from './quotaMonitor';

export type SportmonksBasePath = 'football' | 'core';

const BASE_URLS: Record<SportmonksBasePath, string> = {
  football: 'https://api.sportmonks.com/v3/football',
  core: 'https://api.sportmonks.com/v3/core',
};

export type SportmonksRequestParams = Record<string, string | number | boolean | undefined>;

export type RateLimitLogger = (info: {
  pool: SportmonksRateLimit['requested_entity'];
  remaining: number;
  resetsInSeconds: number;
  path: string;
}) => void;

/** Varsayılan logger — konsola tek satır yazar. `onRateLimit` ile ezilebilir. */
export const defaultRateLimitLogger: RateLimitLogger = ({ pool, remaining, resetsInSeconds, path }) => {
  console.debug(`[sportmonks] havuz=${pool} kalan=${remaining} reset=${resetsInSeconds}s path=${path}`);
};

export class SportmonksHttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'SportmonksHttpError';
    this.status = status;
    this.body = body;
  }
}

function buildUrl(
  basePath: SportmonksBasePath,
  path: string,
  apiToken: string,
  params?: SportmonksRequestParams,
  baseUrlOverride?: string,
): string {
  const root = baseUrlOverride ?? BASE_URLS[basePath];
  const isAbsolute = /^https?:\/\//i.test(root);
  const fullPath = `${root}${path.startsWith('/') ? path : `/${path}`}`;
  // `baseUrlOverride` (tarayıcıdan `/api/sportmonks/...` proxy'sine) göreli bir
  // yol olabilir — URLSearchParams kurmak için geçici bir origin ile parse edilip
  // sonda çıkarılıyor, gerçek fetch() isteği yine geçerli origin'e gider.
  const url = isAbsolute ? new URL(fullPath) : new URL(fullPath, 'http://localhost');
  url.searchParams.set('api_token', apiToken);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return isAbsolute ? url.toString() : `${url.pathname}${url.search}`;
}

export type SportmonksRequestOptions = {
  basePath: SportmonksBasePath;
  path: string;
  apiToken: string;
  params?: SportmonksRequestParams;
  /** Test'lerde gerçek ağ çağrısı yapmadan mock response enjekte etmek için. */
  fetchImpl?: typeof fetch;
  onRateLimit?: RateLimitLogger;
  /**
   * `BASE_URLS[basePath]` yerine kullanılacak kök adres. Tarayıcıda gerçek
   * `api_token`'ı ifşa etmemek için `/api/sportmonks/...` proxy'sine (göreli
   * yol) yönlendirmek amacıyla `sportmonksRuntimeClient.ts` tarafından kullanılır
   * — sunucu tarafında hiç set edilmez, gerçek Sportmonks base URL'i kullanılır.
   */
  baseUrlOverride?: string;
};

/**
 * Tek bir Sportmonks isteği atar. Pass 3'te bulunan 422/403/404 gibi hata
 * durumlarını (state kısıtı, odds erişimi, yanlış path) `SportmonksHttpError`
 * olarak fırlatır — çağıran taraf `error.status`'a göre ayırt edebilir.
 */
export async function sportmonksRequest<T>(
  options: SportmonksRequestOptions,
): Promise<SportmonksEnvelope<T>> {
  const { basePath, path, apiToken, params, fetchImpl = fetch, onRateLimit, baseUrlOverride } = options;
  const url = buildUrl(basePath, path, apiToken, params, baseUrlOverride);

  const res = await fetchImpl(url);
  const body = (await res.json()) as SportmonksEnvelope<T> & { message?: string };

  if (!res.ok) {
    throw new SportmonksHttpError(
      body?.message ?? `Sportmonks isteği başarısız (HTTP ${res.status})`,
      res.status,
      body,
    );
  }

  if (body.rate_limit) {
    const logger = onRateLimit ?? defaultRateLimitLogger;
    logger({
      pool: body.rate_limit.requested_entity,
      remaining: body.rate_limit.remaining,
      resetsInSeconds: body.rate_limit.resets_in_seconds,
      path,
    });
    // Proxy'ye giden (baseUrlOverride) tarayıcı istekleri burada raporlanmaz —
    // gerçek upstream çağrısını yapan proxy route'u (api/sportmonks) raporlar,
    // aksi halde her kullanıcı tarayıcısı aynı kotayı çift sayardı.
    if (!baseUrlOverride) {
      reportSportmonksQuota({
        pool: body.rate_limit.requested_entity,
        remaining: body.rate_limit.remaining,
        resetsInSeconds: body.rate_limit.resets_in_seconds,
        path,
      });
    }
  }

  return body;
}

/** Zaten bilinen bir `next_page`/`next_cursor` URL'sine (aynı temel doğrulamayla) istek atar. */
export async function sportmonksRequestByUrl<T>(
  url: string,
  fetchImpl: typeof fetch = fetch,
  onRateLimit?: RateLimitLogger,
): Promise<SportmonksEnvelope<T>> {
  const res = await fetchImpl(url);
  const body = (await res.json()) as SportmonksEnvelope<T> & { message?: string };

  if (!res.ok) {
    throw new SportmonksHttpError(
      body?.message ?? `Sportmonks isteği başarısız (HTTP ${res.status})`,
      res.status,
      body,
    );
  }

  if (body.rate_limit) {
    const logger = onRateLimit ?? defaultRateLimitLogger;
    logger({
      pool: body.rate_limit.requested_entity,
      remaining: body.rate_limit.remaining,
      resetsInSeconds: body.rate_limit.resets_in_seconds,
      path: url,
    });
    reportSportmonksQuota({
      pool: body.rate_limit.requested_entity,
      remaining: body.rate_limit.remaining,
      resetsInSeconds: body.rate_limit.resets_in_seconds,
      // Sentry'ye query string (api_token içeriyor) ASLA gönderilmez.
      path: url.split('?')[0],
    });
  }

  return body;
}

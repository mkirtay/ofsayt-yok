/**
 * Sportmonks çağrılarını sunucu/tarayıcı ayrımına göre yönlendirir.
 *
 * `liveScoreService.ts`'teki Katman-1 fonksiyonları hem SSR'da hem de doğrudan
 * tarayıcıda (`useHomeHubMatches`/`useUefaHubMatches` — react-query hook'ları
 * `MatchHubPage` içinde client-side çalışıyor) çağrılıyor. `SPORTMONKS_API_KEY`
 * gizli bir sır (`.env.local`, `NEXT_PUBLIC_` öneki YOK) — tarayıcı bundle'ına
 * asla gömülmemeli. Bu yüzden:
 * - Sunucuda (`typeof window === 'undefined'`): istekler proxy ile AYNI paylaşımlı cache'ten
 *   geçer (`server/sportmonks/cachedFetch.ts` — `fetchImpl` olarak bağlanır). SSR, API
 *   route'ları, cron ve bot çağrıları da böylece ziyaretçi sayısından bağımsız kalır.
 * - Tarayıcıda: `/api/sportmonks/[...path]` proxy route'una gider (bkz. o dosya) —
 *   token proxy içinde enjekte edilir, istemciye hiç gitmez.
 */
import {
  sportmonksRequest,
  type SportmonksBasePath,
  type SportmonksRequestParams,
} from './sportmonks/httpClient';
import { collectAllPages, type PaginateOptions } from './sportmonks/pagination';
import type { SportmonksEnvelope } from './sportmonks/types';

const PROXY_BASE = '/api/sportmonks';

/**
 * Sunucu tarafı `fetch` yerine geçen adaptör: Sportmonks URL'ini paylaşımlı cache'e yönlendirir ve
 * sonucu `Response` olarak döner (hata/sayfalama semantiği `sportmonksRequest`'te aynen kalır).
 * Dinamik import: cache modülü (Redis, Sentry) tarayıcı bundle'ının ana yoluna girmesin.
 */
const serverCachedFetch: typeof fetch = async (input) => {
  const { fetchSportmonksCached } = await import('@/server/sportmonks/cachedFetch');
  const url = new URL(String(input instanceof Request ? input.url : input));
  const path = url.pathname.replace(/^\/v3\//, '');
  const query: Record<string, string | string[]> = {};
  url.searchParams.forEach((value, key) => {
    if (key === 'api_token') return;
    const prev = query[key];
    query[key] = prev === undefined ? value : ([] as string[]).concat(prev, value);
  });
  const result = await fetchSportmonksCached(path, query, { origin: 'server' });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json' },
  });
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function resolveServerApiToken(): string {
  const token = process.env.SPORTMONKS_API_KEY;
  if (!token) {
    throw new Error('Missing SPORTMONKS_API_KEY (sunucu ortam değişkeni tanımlı değil)');
  }
  return token;
}

/** Tek bir Sportmonks isteği — sunucu/tarayıcı ayrımını burada çözer. */
export async function sportmonksClientRequest<T>(
  basePath: SportmonksBasePath,
  path: string,
  params?: SportmonksRequestParams,
): Promise<SportmonksEnvelope<T>> {
  if (isBrowser()) {
    return sportmonksRequest<T>({
      basePath,
      path,
      apiToken: '',
      params,
      baseUrlOverride: `${PROXY_BASE}/${basePath}`,
    });
  }
  return sportmonksRequest<T>({ basePath, path, apiToken: resolveServerApiToken(), params, fetchImpl: serverCachedFetch });
}

/** `paginateSportmonks`'in tüm sayfalarını toplayan sunucu/tarayıcı-uyumlu varyant. */
export async function sportmonksCollectAllPages<T>(
  options: Omit<PaginateOptions, 'apiToken' | 'baseUrlOverride'>,
): Promise<T[]> {
  if (isBrowser()) {
    return collectAllPages<T>({
      ...options,
      apiToken: '',
      baseUrlOverride: `${PROXY_BASE}/${options.basePath}`,
    });
  }
  return collectAllPages<T>({ ...options, apiToken: resolveServerApiToken(), fetchImpl: serverCachedFetch });
}

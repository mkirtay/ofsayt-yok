/**
 * Sportmonks çağrılarını sunucu/tarayıcı ayrımına göre yönlendirir.
 *
 * `liveScoreService.ts`'teki Katman-1 fonksiyonları hem SSR'da hem de doğrudan
 * tarayıcıda (`useHomeHubMatches`/`useUefaHubMatches` — react-query hook'ları
 * `MatchHubPage` içinde client-side çalışıyor) çağrılıyor. `SPORTMONKS_API_KEY`
 * gizli bir sır (`.env.local`, `NEXT_PUBLIC_` öneki YOK) — tarayıcı bundle'ına
 * asla gömülmemeli. Bu yüzden:
 * - Sunucuda (`typeof window === 'undefined'`): `sportmonksRequest`/`paginateSportmonks`
 *   gerçek Sportmonks base URL'ine, gerçek `apiToken` ile gider (livescore-api.com
 *   entegrasyonundaki `livescoreServerClient.ts` ile aynı desen).
 * - Tarayıcıda: `/api/sportmonks/[...path]` proxy route'una gider (bkz. o dosya) —
 *   token proxy içinde enjekte edilir, istemciye hiç gitmez (`liveScoreHttpContext.ts`/
 *   `/api/livescore/[...path].ts` ile aynı desen).
 */
import {
  sportmonksRequest,
  type SportmonksBasePath,
  type SportmonksRequestParams,
} from './sportmonks/httpClient';
import { collectAllPages, type PaginateOptions } from './sportmonks/pagination';
import type { SportmonksEnvelope } from './sportmonks/types';

const PROXY_BASE = '/api/sportmonks';

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
  return sportmonksRequest<T>({ basePath, path, apiToken: resolveServerApiToken(), params });
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
  return collectAllPages<T>({ ...options, apiToken: resolveServerApiToken() });
}

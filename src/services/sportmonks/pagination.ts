/**
 * Sportmonks sayfalama — Pass 1 Genel Bulgu 1.
 *
 * Mevcut `liveScoreService.ts`'teki `parseTotalPages()` + `Array.from({length:
 * totalPages-1})` ile TÜM sayfaları PARALEL çekme deseni burada YOK ve
 * kullanılmamalı: Sportmonks `total_pages`/`total` döndürmüyor, sadece
 * `pagination.has_more` + `next_page`/`next_cursor` var — kaç sayfa olduğu
 * önceden bilinemiyor, bu yüzden sayfalar SIRAYLA (paralel değil) çekilmeli.
 *
 * Pass 5 "Endpoint keşfi": `per_page` üst sınırı endpoint'e göre değişiyor
 * (`/fixtures/date` 50'yi kabul etti, `/core/types` 200 istenince sessizce
 * 25'e düştü). Bu yüzden `perPage` burada zorunlu bir parametre — varsayılan
 * bir "güvenli" değer hardcode edilmedi; çağıran taraf endpoint'e uygun
 * değeri bilinçli olarak seçmeli.
 */
import { sportmonksRequest, type SportmonksBasePath, type SportmonksRequestParams, type RateLimitLogger } from './httpClient';
import type { SportmonksEnvelope } from './types';

export type PaginateOptions = {
  basePath: SportmonksBasePath;
  path: string;
  apiToken: string;
  /** Zorunlu — endpoint'e göre değişen üst sınır nedeniyle varsayılanı yok. */
  perPage: number;
  extraParams?: SportmonksRequestParams;
  fetchImpl?: typeof fetch;
  onRateLimit?: RateLimitLogger;
  /** Sonsuz döngüye karşı güvenlik ağı — Sportmonks bir hata yüzünden hep has_more:true derse. */
  maxPages?: number;
  /** bkz. `SportmonksRequestOptions.baseUrlOverride` (httpClient.ts) — tarayıcı proxy'si için. */
  baseUrlOverride?: string;
};

/**
 * Sportmonks listeleme endpoint'lerini `has_more` bitene kadar SIRAYLA (await ile,
 * bir sonraki sayfa isteği bir öncekinin cevabını bekleyerek) gezen async generator.
 * Her `yield`, o sayfanın `data` dizisini verir — çağıran taraf sayfa sayfa ya da
 * `for await` ile tamamını tüketebilir.
 */
export async function* paginateSportmonks<T>(
  options: PaginateOptions,
): AsyncGenerator<T[], void, void> {
  const { basePath, path, apiToken, perPage, extraParams, fetchImpl, onRateLimit, maxPages, baseUrlOverride } = options;

  let page = 1;
  let hasMore = true;
  let pagesFetched = 0;

  while (hasMore) {
    if (maxPages != null && pagesFetched >= maxPages) return;

    const envelope: SportmonksEnvelope<T[]> = await sportmonksRequest<T[]>({
      basePath,
      path,
      apiToken,
      params: { ...extraParams, per_page: perPage, page },
      fetchImpl,
      onRateLimit,
      baseUrlOverride,
    });

    pagesFetched += 1;
    yield envelope.data;

    hasMore = envelope.pagination?.has_more ?? false;
    page += 1;
  }
}

/** Tüm sayfaları tüketip tek bir düz diziye toplayan kolaylık fonksiyonu. */
export async function collectAllPages<T>(options: PaginateOptions): Promise<T[]> {
  const all: T[] = [];
  for await (const pageItems of paginateSportmonks<T>(options)) {
    all.push(...pageItems);
  }
  return all;
}

/**
 * Paylaşımlı Redis anahtarları için ortam + şema sürümü öneki (ör. `prod:v2:`).
 *
 * Yerel geliştirme `.env.local` üzerinden prod Redis'ine bağlanıyor: önek olmadan yerelde bir hata
 * canlı cache'i (özellikle negatif cache'i) kirletebilirdi. Kayıt formatı değişirse
 * `CACHE_SCHEMA_VERSION`'ı artırmak eski kayıtları devre dışı bırakmaya yeter (TTL ile kendiliğinden düşer).
 *
 * Ortam `VERCEL_ENV`'den: production → `prod`, preview → `preview`, diğer her şey (yerel dahil) → `dev`.
 */
export const CACHE_SCHEMA_VERSION = 'v2';

export type CacheEnv = 'prod' | 'preview' | 'dev';

export function cacheEnv(vercelEnv: string | undefined = process.env.VERCEL_ENV): CacheEnv {
  if (vercelEnv === 'production') return 'prod';
  if (vercelEnv === 'preview') return 'preview';
  return 'dev';
}

export function cacheKeyPrefix(vercelEnv?: string): string {
  return `${cacheEnv(vercelEnv)}:${CACHE_SCHEMA_VERSION}:`;
}

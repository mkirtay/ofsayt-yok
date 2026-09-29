/**
 * `/matches/[slug]` SSR yanıtının CDN (Vercel edge) cache süresi — maç durumuna göre.
 * Sayfa props'u oturumdan bağımsız (oturum istemcide okunuyor), bu yüzden `public` güvenli.
 * İstemci maçı ayrıca tazelediği için SSR'daki skorun birkaç dakika bayat olması sorun değil.
 */
export type MatchPageCacheKind = 'finished' | 'live' | 'scheduled' | 'missing' | 'archived' | 'gone';

const CACHE_CONTROL: Record<MatchPageCacheKind, string> = {
  live: 'public, s-maxage=30, stale-while-revalidate=60',
  scheduled: 'public, s-maxage=120, stale-while-revalidate=300',
  finished: 'public, s-maxage=3600, stale-while-revalidate=86400',
  missing: 'public, s-maxage=600, stale-while-revalidate=3600',
  archived: 'public, s-maxage=3600, stale-while-revalidate=86400',
  gone: 'public, s-maxage=86400, stale-while-revalidate=604800',
};

export function matchPageCacheKindForStatus(status: string | null | undefined): MatchPageCacheKind {
  switch (status) {
    case 'FINISHED':
      return 'finished';
    case 'IN PLAY':
    case 'HALF TIME BREAK':
      return 'live';
    default:
      return 'scheduled';
  }
}

export function matchPageCacheControl(kind: MatchPageCacheKind): string {
  return CACHE_CONTROL[kind];
}

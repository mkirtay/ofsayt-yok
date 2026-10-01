/**
 * `/matches/[slug]` SSR yanıtının CDN (Vercel edge) cache süresi — maç durumuna göre.
 * Sayfa props'u oturumdan bağımsız (oturum istemcide okunuyor), bu yüzden `public` güvenli.
 * İstemci maçı ayrıca tazelediği için SSR'daki skorun birkaç dakika bayat olması sorun değil.
 *
 * SSR'ın CPU'su (soğuk başlangıçta ~1 sn) CDN ıskasında harcanır → biten maç 1 gün tutulur (içerik artık
 * değişmez); başlamamış maç 5 dk, başlamaya 15 dk kala / gecikmiş başlamada kısalır; canlı 30 sn.
 */
import type { Match } from '@/models/liveScore';
import { matchListFreshSeconds } from '@/utils/matchActivity';

export type MatchPageCacheKind = 'finished' | 'live' | 'scheduled' | 'missing' | 'archived' | 'gone';

const SCHEDULED_MAX_SECONDS = 300;

const CACHE_CONTROL: Record<MatchPageCacheKind, string> = {
  live: 'public, s-maxage=30, stale-while-revalidate=60',
  scheduled: `public, s-maxage=${SCHEDULED_MAX_SECONDS}, stale-while-revalidate=600`,
  finished: 'public, s-maxage=86400, stale-while-revalidate=604800',
  missing: 'public, s-maxage=600, stale-while-revalidate=3600',
  archived: 'public, s-maxage=86400, stale-while-revalidate=604800',
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

/**
 * Maçın kendisine göre: başlamamış maçta süre, başlamaya 15 dk kalana kadar (en çok 5 dk); aktif pencerede
 * (±15 dk ya da saati geçmiş ama durum güncellenmemiş) 30 sn.
 */
export function matchPageCacheControlForMatch(match: Pick<Match, 'status' | 'date' | 'scheduled'>, now: number = Date.now()): string {
  const kind = matchPageCacheKindForStatus(match.status);
  if (kind !== 'scheduled') return matchPageCacheControl(kind);
  const fresh = matchListFreshSeconds([match], SCHEDULED_MAX_SECONDS, now);
  return fresh >= SCHEDULED_MAX_SECONDS ? matchPageCacheControl('scheduled') : `public, s-maxage=${fresh}, stale-while-revalidate=${fresh * 2}`;
}

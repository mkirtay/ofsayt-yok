/**
 * `/matches/[slug]` SSR yanıtının CDN (Vercel edge) cache süresi — maç durumuna göre.
 * Sayfa props'u oturumdan bağımsız (oturum istemcide okunuyor), bu yüzden `public` güvenli.
 * İstemci maçı ayrıca tazelediği için SSR'daki skorun birkaç dakika bayat olması sorun değil.
 *
 * SSR'ın CPU'su (soğuk başlangıçta ~1 sn) CDN ıskasında harcanır → süreler maçın durumuna göre:
 * - canlı: en çok 30 sn (s-maxage + swr toplamı),
 * - başlamamış: 5 dk; başlamaya 15 dk kala / saati geçmiş ama durumu güncellenmemiş maçta 30 sn (+30 sn swr) —
 *   eski HTML, başlama düdüğünden sonra "başlamadı" demesin,
 * - yeni biten (başlama + 5 sa içinde ≈ bitişten sonraki ilk 3 sa): 10 dk — Sportmonks istatistik/puanları
 *   maç sonrası bir süre güncelliyor; sonra 1 gün.
 */
import type { Match } from '@/models/liveScore';
import { matchKickoffMs, matchListFreshSeconds } from '@/utils/matchActivity';

export type MatchPageCacheKind = 'finished' | 'live' | 'scheduled' | 'missing' | 'archived' | 'gone';

const SCHEDULED_MAX_SECONDS = 300;
/** Başlama saatinden bu kadar sonrasına kadar biten maç "yeni" sayılır (~2 sa maç + 3 sa). */
export const RECENTLY_FINISHED_WINDOW_MS = 5 * 60 * 60_000;
const RECENTLY_FINISHED_CACHE = 'public, s-maxage=600, stale-while-revalidate=600';
/** Aktif pencerede bayat HTML'in en fazla bu kadar daha verilmesine izin (swr). */
const ACTIVE_SWR_SECONDS = 30;

const CACHE_CONTROL: Record<MatchPageCacheKind, string> = {
  live: 'public, s-maxage=20, stale-while-revalidate=10',
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
 * Maçın kendisine göre (bkz. dosya başı). Başlamamış maçta taze süre aktif pencerenin (başlamaya 15 dk) başına kadar;
 * 5 dk'lık süre + 10 dk swr ile bile bayat HTML en geç başlamadan 5 dk önce biter.
 */
export function matchPageCacheControlForMatch(match: Pick<Match, 'status' | 'date' | 'scheduled'>, now: number = Date.now()): string {
  const kind = matchPageCacheKindForStatus(match.status);
  if (kind === 'finished') {
    const k = matchKickoffMs(match);
    return k != null && now - k < RECENTLY_FINISHED_WINDOW_MS ? RECENTLY_FINISHED_CACHE : matchPageCacheControl('finished');
  }
  if (kind !== 'scheduled') return matchPageCacheControl(kind);
  const fresh = matchListFreshSeconds([match], SCHEDULED_MAX_SECONDS, now);
  return fresh >= SCHEDULED_MAX_SECONDS
    ? matchPageCacheControl('scheduled')
    : `public, s-maxage=${fresh}, stale-while-revalidate=${Math.min(fresh, ACTIVE_SWR_SECONDS)}`;
}

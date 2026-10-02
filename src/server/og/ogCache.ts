/**
 * Dinamik paylaşım görsellerinin CDN önbellek süreleri. Görsel çizimi (~100–300 ms CPU) Hobby'nin en dar kaynağı
 * (Active CPU) — CDN ıskası olmadıkça fonksiyon çalışmaz; adres sürümlü olduğu için uzun süreler güvenli.
 */
import type { Match } from '@/models/liveScore';
import { matchKickoffMs } from '@/utils/matchActivity';

const YEAR = 31_536_000;
/** Başlamamış maç: başlama saatine kadar, en fazla 6 sa (saat değişebilir), en az 1 dk. */
const SCHEDULED_MAX_SECONDS = 6 * 3600;

export const OG_CACHE = {
  /** Skor adreste → görsel hiç değişmez. */
  finished: `public, max-age=86400, s-maxage=${YEAR}, immutable`,
  live: 'public, max-age=60, s-maxage=60, stale-while-revalidate=60',
  /** Ertelendi / iptal / bilinmeyen durum. */
  other: 'public, max-age=3600, s-maxage=3600',
  /** Hata / maç yok → varsayılan görsele yönlendirme; kısa (geçici hata kalıcılaşmasın). */
  fallback: 'public, max-age=300, s-maxage=300',
  /** Eski sürümlü adres → güncel adrese yönlendirme. */
  versionRedirect: 'public, max-age=60, s-maxage=60',
  /** Takım görseli (`v` = gün). */
  team: 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600',
} as const;

export function matchOgCacheControl(
  m: Pick<Match, 'status' | 'date' | 'scheduled' | 'state_code'>,
  now: number = Date.now(),
): string {
  // Ertelendi / iptal / yarıda kaldı …: durum yeniden değişebilir (yeni tarih, düzeltme) → kısa.
  if (m.state_code) return OG_CACHE.other;
  switch (m.status) {
    case 'FINISHED':
      return OG_CACHE.finished;
    case 'IN PLAY':
    case 'HALF TIME BREAK':
      return OG_CACHE.live;
    case 'NOT STARTED': {
      const kickoff = matchKickoffMs(m);
      const seconds =
        kickoff == null ? SCHEDULED_MAX_SECONDS : Math.min(SCHEDULED_MAX_SECONDS, Math.max(60, Math.floor((kickoff - now) / 1000)));
      return `public, max-age=${Math.min(seconds, 3600)}, s-maxage=${seconds}`;
    }
    default:
      return OG_CACHE.other;
  }
}

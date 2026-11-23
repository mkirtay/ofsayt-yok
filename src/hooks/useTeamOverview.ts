import { useQuery } from '@tanstack/react-query';
import { getTeamOverview } from '@/services/teamPage';
import type { TeamOverview } from '@/services/sportmonks/teamOverview';

/** Takım sayfası ISR kabuğundan gelen genel bakış + üretildiği an (ms). */
export type InitialTeamOverview = { data: TeamOverview; at: number };

/**
 * Takım sayfasının tek isteği: Son Maçlar, Fikstür, başlıktaki form ve sıradaki maç aynı sorguyu paylaşır.
 * Tazelik proxy/CDN tarafında (canlı maçta 30 sn, yoksa en çok 15 dk — cachePolicy `teams`); istemci 60 sn.
 */
/**
 * `initial` (takım sayfası ISR): sunucu HTML'i veriyle çizilir; `initialDataUpdatedAt` üretim anı olduğundan veri
 * 60 sn'den eskiyse istemci açılışta yine tazeler.
 */
export function useTeamOverview(teamId: string, enabled = true, initial: InitialTeamOverview | null = null) {
  return useQuery({
    queryKey: ['team-overview', teamId] as const,
    queryFn: () => getTeamOverview(teamId),
    enabled: enabled && Boolean(teamId),
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    ...(initial ? { initialData: initial.data, initialDataUpdatedAt: initial.at } : {}),
  });
}

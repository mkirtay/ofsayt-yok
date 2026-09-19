import { useQuery } from '@tanstack/react-query';
import { getTeamSquadStats } from '@/services/liveScoreService';

/** Kadro sekmesi AÇIKKEN takım+sezon için M/G/A/SK/KK yükler; gelmezse tablo "—" gösterir. */
export function useTeamSquadStats(teamId: number | string | undefined, seasonId: number | null, enabled: boolean) {
  const tid = Number(teamId);
  const { data } = useQuery({
    queryKey: ['team-squad-stats', seasonId, tid],
    queryFn: () => getTeamSquadStats(seasonId as number, tid),
    enabled: enabled && typeof seasonId === 'number' && Number.isFinite(tid),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
  return data ?? {};
}

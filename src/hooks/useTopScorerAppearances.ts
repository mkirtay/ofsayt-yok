import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTopScorerAppearances, type TopScorersPayload } from '@/services/liveScoreService';

/**
 * Oynanan maç (O) bilgisini listeye birleştirir. Oyuncunun oynadığı DOĞRULANMIŞSA (O dolu) ve asist sıralamasında
 * yer almıyorsa (`assists` yok) asist gerçekten 0'dır → `assists: 0` ("0" gösterilir). O bilinmiyorsa A da
 * bilinmez kalır ("—").
 */
export function mergeAppearances(data: TopScorersPayload, appearances: Record<number, number>): TopScorersPayload {
  return {
    ...data,
    topscorers: (data.topscorers ?? []).map((s) => {
      const played = s.player?.id != null ? appearances[s.player.id] : undefined;
      if (played === undefined) return s;
      return { ...s, played, assists: s.assists ?? 0 };
    }),
  };
}

/**
 * Gol Krallığı "O" (oynanan maç) — asıl liste (gol + asist) hemen gelir; oynanan maç ayrı kaynaktan (takım başına
 * kadro istatistiği, bkz. `getTopScorerAppearances`) yalnızca sekme AÇIKKEN yüklenir, sonra listeye birleştirilir.
 * Veri gelmezse / oyuncuda yoksa `played` undefined kalır → tabloda "—" (asla "0").
 */
export function useTopScorersWithAppearances(data: TopScorersPayload | null, enabled: boolean): TopScorersPayload | null {
  const seasonId = data?.season?.id;
  const teamIds = useMemo(
    () => [...new Set((data?.topscorers ?? []).map((s) => s.team?.id).filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b),
    [data],
  );
  const { data: appearances } = useQuery({
    queryKey: ['topscorer-appearances', seasonId, teamIds.join(',')],
    queryFn: () => getTopScorerAppearances(seasonId as number, teamIds),
    enabled: enabled && typeof seasonId === 'number' && teamIds.length > 0,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
  });
  return useMemo(() => (data && appearances ? mergeAppearances(data, appearances) : data), [data, appearances]);
}

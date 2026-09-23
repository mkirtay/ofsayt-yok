import { useQuery } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import { getFixturesByCompetition } from '@/services/liveScoreService';

/**
 * Tek bir kupanın/ligin fikstürü (tarihe göre DEĞİL, lige göre) — ana sayfada UEFA kupası
 * seçildiğinde kullanılır. `getFixturesByCompetition` Sportmonks tarafında bugünün ±(14/75) gün
 * penceresini çekiyor, yani "bu maç haftası + gelecek turlar" tek istekte geliyor.
 *
 * Günlük maç listesinden (`useHomeHubMatches`) AYRI bir sorgu: o tek bir güne bağlı, bu değil.
 */
export function competitionFixturesQueryKey(competitionId: number) {
  return ['competition-fixtures', competitionId] as const;
}

export function useCompetitionFixtures(competitionId: number | null) {
  return useQuery<Match[]>({
    queryKey: competitionFixturesQueryKey(competitionId ?? 0),
    queryFn: () => getFixturesByCompetition(competitionId!),
    enabled: competitionId != null,
    // Fikstür gün içinde nadiren değişir; canlı skor günlük sorgudan gelir.
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import {
  getAllLiveMatches,
  getAllMatchesByDate,
  getFixturesByCompetition,
  getFixturesByDate,
} from '@/services/liveScoreService';
import { WORLD_CUP_COMPETITION_ID } from '@/config/worldCup';

export type HomeHubMatchesData = {
  allMatches: Match[];
  liveMatches: Match[];
  fixtureMatches: Match[];
};

/**
 * `/fixtures/list.json?date=X` sayfalanmış dönüyor ve sadece ilk sayfayı çekiyoruz —
 * yoğun tarihlerde (ör. Dünya Kupası eleme turu günleri) World Cup maçları 2. sayfaya
 * düşüp kayboluyor. Rekabet bazlı fikstür endpoint'i (`getFixturesByCompetition`)
 * World Cup için sayfalanmadan tüm kalan maçları döndürüyor — o güne ait olanlar
 * eklenir (aynı id zaten varsa tekrar eklenmez).
 */
async function fetchDateFixturesWithWorldCup(selectedDate: string): Promise<Match[]> {
  const [dateFixtures, worldCupFixtures] = await Promise.all([
    getFixturesByDate(selectedDate),
    getFixturesByCompetition(WORLD_CUP_COMPETITION_ID),
  ]);
  const existingIds = new Set(dateFixtures.map((m) => Number(m.id)));
  const missingWorldCup = worldCupFixtures.filter(
    (m) => m.date === selectedDate && !existingIds.has(Number(m.id)),
  );
  return [...dateFixtures, ...missingWorldCup];
}

async function fetchHomeHubMatches(selectedDate: string): Promise<HomeHubMatchesData> {
  const [allMatches, liveMatches, fixtureMatches] = await Promise.all([
    getAllMatchesByDate(selectedDate, 5),
    getAllLiveMatches(),
    fetchDateFixturesWithWorldCup(selectedDate),
  ]);
  return { allMatches, liveMatches, fixtureMatches };
}

export function homeHubMatchesQueryKey(selectedDate: string) {
  return ['home-hub-matches', selectedDate] as const;
}

export function useHomeHubMatches(selectedDate: string, enabled = true) {
  return useQuery({
    queryKey: homeHubMatchesQueryKey(selectedDate),
    queryFn: () => fetchHomeHubMatches(selectedDate),
    enabled,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

export function prefetchHomeHubMatches(queryClient: QueryClient, selectedDate: string) {
  return queryClient.prefetchQuery({
    queryKey: homeHubMatchesQueryKey(selectedDate),
    queryFn: () => fetchHomeHubMatches(selectedDate),
    staleTime: 30_000,
  });
}

export async function refreshHomeHubLiveFixtures(
  queryClient: QueryClient,
  selectedDate: string
) {
  const [liveMatches, fixtureMatches] = await Promise.all([
    getAllLiveMatches(),
    fetchDateFixturesWithWorldCup(selectedDate),
  ]);
  queryClient.setQueryData<HomeHubMatchesData>(
    homeHubMatchesQueryKey(selectedDate),
    (prev) =>
      prev
        ? { ...prev, liveMatches, fixtureMatches }
        : { allMatches: [], liveMatches, fixtureMatches }
  );
}

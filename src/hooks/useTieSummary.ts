import { useQuery } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import { isSecondLeg, tieSummary, type TieSummary } from '@/utils/aggregateScore';

/** 1. ayak eşleşme boyunca değişmez; hata → toplam gösterilmez (satır yeri zaten ayrılı). */
const FIRST_LEG_STALE_MS = 60 * 60 * 1000;

/**
 * 2. ayakta toplam skor. Sportmonks aggregate varsa istek yok; yoksa 1. ayak bir kez çekilir (maç başına,
 * react-query cache'i). 1. ayak servisi tembel yüklenir (liste ilk yük parçasına girmesin).
 */
export function useTieSummary(match: Match | null | undefined): TieSummary | null {
  const needsFirstLeg = Boolean(match && isSecondLeg(match) && !match.aggregate && match.home?.id && match.away?.id);
  const firstLeg = useQuery({
    queryKey: ['firstLeg', match?.id ?? null],
    queryFn: async () => {
      const { getFirstLeg } = await import('@/services/firstLeg');
      return getFirstLeg(match as Match);
    },
    enabled: needsFirstLeg,
    staleTime: FIRST_LEG_STALE_MS,
    retry: 1,
  });
  return match ? tieSummary(match, firstLeg.data ?? null) : null;
}

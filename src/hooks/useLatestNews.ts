import { useQuery } from '@tanstack/react-query';
import type { NewsItem } from '@/models/domain';

/** Ana sayfa haber kartı: son 3 AI haberi. Kart ve ana sayfa (liste içi yuva kararı) aynı sorguyu paylaşır. */
export const LATEST_NEWS_LIMIT = 3;

async function fetchLatestNews(): Promise<NewsItem[]> {
  const res = await fetch(`/api/news?limit=${LATEST_NEWS_LIMIT}`);
  if (!res.ok) throw new Error('news');
  const json = (await res.json()) as { items?: NewsItem[] };
  return json.items ?? [];
}

export function useLatestNews() {
  return useQuery({
    queryKey: ['news-latest', LATEST_NEWS_LIMIT],
    queryFn: fetchLatestNews,
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}

/**
 * Liste içi yuva yüksekliği (MatchListInlineSlot, components/HomeNewsCard `inList`): başlık 40 + satır başına en az 64
 * + kenarlar/alt dolgu 6 + alt boşluk 12. İki satırlık başlıkta satır uzarsa yuva ölçülen yüksekliğe büyür.
 */
export function newsSlotHeight(count: number): number {
  return 40 + count * 64 + 6 + 12;
}

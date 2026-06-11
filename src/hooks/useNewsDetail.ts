import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { NewsItem } from '@/models/domain';

export type NewsDetailData = {
  article: NewsItem;
  sidebarNews: NewsItem[];
};

async function fetchNewsDetail(id: string): Promise<NewsDetailData> {
  const res = await fetch(`/api/news/${encodeURIComponent(id)}?sidebar=1`);
  if (res.status === 404) {
    throw new Error('NOT_FOUND');
  }
  if (!res.ok) {
    throw new Error('Failed to load news');
  }
  const json = await res.json();
  if (!json.success || !json.item) {
    throw new Error('NOT_FOUND');
  }
  return {
    article: json.item as NewsItem,
    sidebarNews: (json.sidebarNews ?? []) as NewsItem[],
  };
}

export function newsDetailQueryKey(id: string) {
  return ['news-detail', id] as const;
}

export function useNewsDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: newsDetailQueryKey(id),
    queryFn: () => fetchNewsDetail(id),
    enabled: enabled && Boolean(id),
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    retry: (_, error) => (error as Error).message !== 'NOT_FOUND',
  });
}

export function prefetchNewsDetail(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery({
    queryKey: newsDetailQueryKey(id),
    queryFn: () => fetchNewsDetail(id),
    staleTime: 5 * 60_000,
  });
}

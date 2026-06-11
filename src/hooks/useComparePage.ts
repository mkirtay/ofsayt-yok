import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { ComparePagePayload } from '@/server/loadComparePageData';

async function fetchComparePage(slug: string): Promise<ComparePagePayload> {
  const res = await fetch(`/api/compare/${encodeURIComponent(slug)}`);
  if (res.status === 404) {
    throw new Error('NOT_FOUND');
  }
  if (!res.ok) {
    throw new Error('Failed to load compare data');
  }
  return res.json() as Promise<ComparePagePayload>;
}

export function comparePageQueryKey(slug: string) {
  return ['compare-page', slug] as const;
}

export function useComparePage(slug: string, enabled = true) {
  return useQuery({
    queryKey: comparePageQueryKey(slug),
    queryFn: () => fetchComparePage(slug),
    enabled: enabled && Boolean(slug),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    retry: (_, error) => (error as Error).message !== 'NOT_FOUND',
  });
}

export function prefetchComparePage(queryClient: QueryClient, slug: string) {
  return queryClient.prefetchQuery({
    queryKey: comparePageQueryKey(slug),
    queryFn: () => fetchComparePage(slug),
    staleTime: 2 * 60_000,
  });
}

import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { AiStatsDashboard } from '@/lib/loadAiStatsDashboard';

async function fetchAiStatsDashboard(): Promise<AiStatsDashboard> {
  const res = await fetch('/api/ai-stats/dashboard');
  if (res.status === 401) {
    window.location.href = '/auth/signin?callbackUrl=/ai-istatistikleri';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    throw new Error('Failed to load AI stats');
  }
  return res.json() as Promise<AiStatsDashboard>;
}

export const aiStatsDashboardQueryKey = ['ai-stats-dashboard'] as const;

export function useAiStatsDashboard(enabled = true) {
  return useQuery({
    queryKey: aiStatsDashboardQueryKey,
    queryFn: fetchAiStatsDashboard,
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function prefetchAiStatsDashboard(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: aiStatsDashboardQueryKey,
    queryFn: fetchAiStatsDashboard,
    staleTime: 60_000,
  });
}

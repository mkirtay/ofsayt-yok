import { useQuery } from '@tanstack/react-query';
import type { UserSummaryDto } from '@/pages/api/user/summary';

export const profileSummaryQueryKey = ['profile-summary'] as const;

async function fetchSummary(): Promise<UserSummaryDto> {
  const res = await fetch('/api/user/summary', { credentials: 'include' });
  if (!res.ok) throw new Error(`summary ${res.status}`);
  return res.json() as Promise<UserSummaryDto>;
}

/** Profil başlık kartı + istatistikler: tek istek (bkz. /api/user/summary). */
export function useProfileSummary(enabled = true) {
  return useQuery({ queryKey: profileSummaryQueryKey, queryFn: fetchSummary, enabled, staleTime: 60_000, gcTime: 5 * 60_000 });
}

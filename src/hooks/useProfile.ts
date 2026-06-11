import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Role } from '@prisma/client';

export type ProfileDto = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  bio: string | null;
  image: string | null;
  role: Role;
};

async function fetchProfile(): Promise<ProfileDto> {
  const res = await fetch('/api/user/me', { credentials: 'include' });
  if (res.status === 401) {
    throw new Error('UNAUTHORIZED');
  }
  if (!res.ok) {
    throw new Error('Failed to load profile');
  }
  return res.json() as Promise<ProfileDto>;
}

export const profileQueryKey = ['profile-me'] as const;

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}

export function prefetchProfile(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    staleTime: 60_000,
  });
}

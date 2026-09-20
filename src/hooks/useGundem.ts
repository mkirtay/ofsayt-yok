import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import type { GundemComment, GundemPage, GundemPost, GundemScope } from '@/types/gundem';

/** API hatası: `error` Türkçe mesajı + HTTP durumu (+ 429'da `Retry-After` saniyesi). */
export class GundemApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
    this.name = 'GundemApiError';
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch {
    throw new GundemApiError('network', 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const ra = Number(res.headers.get('Retry-After'));
    throw new GundemApiError(body.error ?? 'error', res.status, Number.isFinite(ra) && ra > 0 ? ra : null);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const gundemKeys = {
  feeds: ['gundem', 'feed'] as const,
  feed: (scope: GundemScope, viewer: string) => ['gundem', 'feed', scope, viewer] as const,
  post: (postId: string, viewer: string) => ['gundem', 'post', postId, viewer] as const,
  posts: (postId: string) => ['gundem', 'post', postId] as const,
  comments: (postId: string) => ['gundem', 'comments', postId] as const,
};

/** Yanıtlar (likedByMe, followedByMe) kullanıcıya özel → cache anahtarında oturum kimliği. `null` = oturum henüz çözülmedi. */
function useViewerKey(): string | null {
  const { data, status } = useSession();
  if (status === 'loading') return null;
  return data?.user?.id ?? 'anon';
}

export function useGundemFeed(scope: GundemScope) {
  const viewer = useViewerKey();
  return useInfiniteQuery({
    queryKey: gundemKeys.feed(scope, viewer ?? 'anon'),
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ scope });
      if (pageParam) qs.set('cursor', pageParam);
      return api<GundemPage<GundemPost>>(`/api/gundem/posts?${qs}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: viewer !== null,
    staleTime: 30_000,
  });
}

export function useGundemPost(postId: string | null) {
  const viewer = useViewerKey();
  return useQuery({
    queryKey: gundemKeys.post(postId ?? '', viewer ?? 'anon'),
    queryFn: () => api<GundemPost>(`/api/gundem/posts/${postId}`),
    enabled: viewer !== null && !!postId,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof GundemApiError && err.status === 404) && count < 2,
  });
}

export function useGundemComments(postId: string) {
  return useInfiniteQuery({
    queryKey: gundemKeys.comments(postId),
    queryFn: ({ pageParam }) => {
      const qs = pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : '';
      return api<GundemPage<GundemComment>>(`/api/gundem/posts/${postId}/comments${qs}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}

// ── Mutation'lar ─────────────────────────────────────────────────────────────

/** Beğeni yanıtı (`{ liked, likes }`) feed sayfalarına ve tek-post cache'ine yerinde işlenir (yeniden çekme/sıçrama yok). */
function patchPost(qc: QueryClient, postId: string, patch: (p: GundemPost) => GundemPost) {
  qc.setQueriesData<InfiniteData<GundemPage<GundemPost>>>({ queryKey: gundemKeys.feeds }, (data) =>
    data
      ? { ...data, pages: data.pages.map((pg) => ({ ...pg, items: pg.items.map((p) => (p.id === postId ? patch(p) : p)) })) }
      : data,
  );
  qc.setQueriesData<GundemPost>({ queryKey: gundemKeys.posts(postId) }, (p) => (p ? patch(p) : p));
}

export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; matchId?: string; teamId?: number }) =>
      api<GundemPost>('/api/gundem/posts', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: gundemKeys.feeds }),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api<void>(`/api/gundem/posts/${postId}`, { method: 'DELETE' }),
    onSuccess: (_d, postId) => {
      qc.removeQueries({ queryKey: gundemKeys.posts(postId) });
      qc.removeQueries({ queryKey: gundemKeys.comments(postId) });
      return qc.invalidateQueries({ queryKey: gundemKeys.feeds });
    },
  });
}

export function useTogglePostLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => api<{ liked: boolean; likes: number }>(`/api/gundem/posts/${postId}/like`, { method: 'POST' }),
    onSuccess: (data, postId) => patchPost(qc, postId, (p) => ({ ...p, likes: data.likes, likedByMe: data.liked })),
  });
}

function refreshCommentsAndCounts(qc: QueryClient, postId: string) {
  // Yorum sayacı feed kartlarında ve tek-post görünümünde de değişir.
  return Promise.all([
    qc.invalidateQueries({ queryKey: gundemKeys.comments(postId) }),
    qc.invalidateQueries({ queryKey: gundemKeys.feeds }),
    qc.invalidateQueries({ queryKey: gundemKeys.posts(postId) }),
  ]);
}

export function useCreateComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<GundemComment>(`/api/gundem/posts/${postId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),
    onSuccess: () => refreshCommentsAndCounts(qc, postId),
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) =>
      api<void>(`/api/gundem/posts/${postId}/comments/${commentId}`, { method: 'DELETE' }),
    onSuccess: () => refreshCommentsAndCounts(qc, postId),
  });
}

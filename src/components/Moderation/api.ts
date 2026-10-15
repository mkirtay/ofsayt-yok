/** Moderasyon uçlarının istemci çağrıları (şikâyet, engel, engellenenler, etiket önerisi). Hata: GundemApiError. */
import { GundemApiError } from '@/hooks/useGundem';
import type { GundemCommentUser, GundemPage } from '@/types/gundem';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: 'include',
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new GundemApiError('network', 0);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const ra = Number(res.headers.get('Retry-After'));
    throw new GundemApiError(body.error ?? 'error', res.status, Number.isFinite(ra) && ra > 0 ? ra : null, body.code ?? null);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type ReportTargetType = 'POST' | 'COMMENT' | 'USER';

export function reportContent(body: { targetType: ReportTargetType; targetId: string; reason: string; note?: string }) {
  return call<{ ok: true; reportId?: string; duplicate?: boolean }>('/api/gundem/reports', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function setUserBlocked(userId: string, blocked: boolean) {
  return call<{ blocked: boolean }>(`/api/gundem/users/${encodeURIComponent(userId)}/block`, { method: blocked ? 'POST' : 'DELETE' });
}

export type BlockedRow = { user: GundemCommentUser; blockedAt: string };

export function fetchBlockedUsers(cursor: string | null) {
  return call<GundemPage<BlockedRow>>(`/api/gundem/blocks${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
}

export type MentionCandidate = { id: string; username: string; name: string | null; image: string | null };

export function searchMentionCandidates(q: string, signal?: AbortSignal) {
  return call<{ items: MentionCandidate[] }>(`/api/gundem/users/search?q=${encodeURIComponent(q)}`, { signal });
}

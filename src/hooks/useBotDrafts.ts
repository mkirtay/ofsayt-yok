import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalFacts } from '@/lib/gundem/bot/goalTemplates';

export type BotDraftStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'POSTED' | 'STALE';
export type BotDraftFilter = BotDraftStatus | 'all';

export type BotDraft = {
  id: string;
  externalKey: string;
  kind: string;
  fixtureId: number;
  eventId: number | null;
  body: string;
  facts: GoalFacts;
  warnings: string[];
  status: BotDraftStatus;
  postId: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export class BotDraftApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new BotDraftApiError(data.error ?? 'Hata', res.status);
  return data;
}

const KEY = ['gundem-bot-drafts'] as const;

/** Yalnızca ilk sayfa (20 kayıt) — kuyruk kısa tutulur; her 30 sn tazelenir. */
export function useBotDrafts(status: BotDraftFilter) {
  return useQuery({
    queryKey: [...KEY, status],
    queryFn: () => call<{ items: BotDraft[]; nextCursor: string | null }>(`/api/admin/gundem/drafts?status=${status}`),
    refetchInterval: 30_000,
  });
}

export function useBotDraftActions() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: KEY });
  const edit = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      call(`/api/admin/gundem/drafts/${id}`, { method: 'PATCH', body: JSON.stringify({ body }) }),
    onSuccess: done,
  });
  const approve = useMutation({
    mutationFn: (id: string) => call(`/api/admin/gundem/drafts/${id}/approve`, { method: 'POST' }),
    onSettled: done, // 409 (STALE) durumunda da liste tazelenir
  });
  const reject = useMutation({
    mutationFn: (id: string) => call(`/api/admin/gundem/drafts/${id}/reject`, { method: 'POST' }),
    onSuccess: done,
  });
  return { edit, approve, reject };
}

export type BulkSelector = { ids: string[] } | { kind?: string; league?: string } | { all: true };
export type PendingSummary = { total: number; kinds: { kind: string; count: number }[]; leagues: { name: string; count: number }[] };

/** Bekleyenlerin tür/lig dağılımı (toplu ret filtreleri); yalnız "Bekliyor" sekmesinde çekilir. */
export function usePendingSummary(enabled: boolean) {
  return useQuery({
    queryKey: [...KEY, 'pending-summary'],
    queryFn: () => call<PendingSummary>('/api/admin/gundem/drafts/pending-summary'),
    enabled,
    refetchInterval: 30_000,
  });
}

/** Toplu ret: `count` (dry-run, onay penceresinde gösterilir) ve `run` (gerçek). Silme yok, durum REJECTED. */
export function useBulkReject() {
  const qc = useQueryClient();
  const post = <T,>(body: object) => call<T>('/api/admin/gundem/drafts/bulk-reject', { method: 'POST', body: JSON.stringify(body) });
  const count = (sel: BulkSelector) => post<{ count: number }>({ ...sel, dryRun: true }).then((r) => r.count);
  const run = useMutation({
    mutationFn: (sel: BulkSelector) => post<{ rejected: number; skipped: number }>(sel),
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return { count, run };
}

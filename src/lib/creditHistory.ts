/** Kredi geçmişi sayfalama parametreleri (GET /api/credits/history). */
export const HISTORY_DEFAULT_LIMIT = 20;
export const HISTORY_MAX_LIMIT = 50;

export type HistoryQuery = { limit: number; cursor: string | null };

export function parseHistoryQuery(q: { limit?: unknown; cursor?: unknown }): HistoryQuery {
  const rawLimit = Array.isArray(q.limit) ? q.limit[0] : q.limit;
  const n = Number(rawLimit);
  const limit = Number.isInteger(n) && n > 0 ? Math.min(n, HISTORY_MAX_LIMIT) : HISTORY_DEFAULT_LIMIT;
  const rawCursor = Array.isArray(q.cursor) ? q.cursor[0] : q.cursor;
  const cursor = typeof rawCursor === 'string' && /^[a-z0-9]{10,40}$/i.test(rawCursor) ? rawCursor : null;
  return { limit, cursor };
}

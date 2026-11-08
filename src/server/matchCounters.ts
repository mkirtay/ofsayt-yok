/**
 * Maç sayaçları — görüntülenme (Redis) + yorum (Postgres, Gündem `Post.matchId`). Bkz. config/matchCounters.ts.
 *
 * Redis anahtarları (ortam önekli, şema sürümünden bağımsız: önbellek sürümü artınca sayılar sıfırlanmasın):
 *   - `{env}:mv:{matchId}`            → INCR sayaç, her sayımda TTL 30 gün yenilenir.
 *   - `{env}:mvd:{matchId}:{viewer}`  → SET NX EX 30 dk: aynı izleyicinin (IP + UA özeti) kısa sürede tekrar sayılmaması.
 * Değerler tam sayı (birkaç bayt); toplu okuma `COUNTERS_MGET_CHUNK`'lık MGET parçalarıyla.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { withRedis } from '@/lib/redis';
import { cacheEnv } from '@/lib/cacheNamespace';
import {
  COUNTERS_MGET_CHUNK,
  VIEW_DEDUP_SECONDS,
  VIEW_TTL_SECONDS,
  type MatchCountsMap,
} from '@/config/matchCounters';

export function viewKey(matchId: string, env = cacheEnv()): string {
  return `${env}:mv:${matchId}`;
}

export function viewerFingerprint(ip: string, userAgent: string): string {
  return createHash('sha256').update(`${ip}|${userAgent}`).digest('base64url').slice(0, 16);
}

export function viewDedupKey(matchId: string, viewer: string, env = cacheEnv()): string {
  return `${env}:mvd:${matchId}:${viewer}`;
}

/** Sayıldıysa true; tekrar (30 dk içinde aynı izleyici) ya da Redis yoksa false. Asla fırlatmaz. */
export async function recordMatchView(matchId: string, viewer: string): Promise<boolean> {
  return withRedis(async (redis) => {
    const fresh = await redis.set(viewDedupKey(matchId, viewer), 1, { nx: true, ex: VIEW_DEDUP_SECONDS });
    if (fresh !== 'OK') return false;
    const key = viewKey(matchId);
    const p = redis.pipeline();
    p.incr(key);
    p.expire(key, VIEW_TTL_SECONDS);
    await p.exec();
    return true;
  }, false);
}

function toCount(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export async function readViewCounts(ids: readonly string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += COUNTERS_MGET_CHUNK) {
    const chunk = ids.slice(i, i + COUNTERS_MGET_CHUNK);
    const values = await withRedis((redis) => redis.mget<unknown[]>(...chunk.map((id) => viewKey(id))), null);
    if (!values) continue;
    chunk.forEach((id, j) => {
      const n = toCount(values[j]);
      if (n > 0) out.set(id, n);
    });
  }
  return out;
}

/** Görünür (silinmemiş, moderasyonla gizlenmemiş) KULLANICI gönderileri — gol botu postları sayılmaz; tek `GROUP BY`. */
export async function readCommentCounts(ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.post.groupBy({
    by: ['matchId'],
    where: { matchId: { in: [...ids] }, authorType: 'USER', deletedAt: null, hiddenAt: null },
    _count: { _all: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r.matchId) out.set(r.matchId, r._count._all);
  return out;
}

/** Sıfır olan maçlar yanıta girmez (istemci yoksa 0 sayar) → yanıt küçük kalır. */
export async function readMatchCounters(ids: readonly string[]): Promise<MatchCountsMap> {
  const [views, comments] = await Promise.all([readViewCounts(ids), readCommentCounts(ids)]);
  const out: MatchCountsMap = {};
  for (const id of ids) {
    const v = views.get(id) ?? 0;
    const c = comments.get(id) ?? 0;
    if (v > 0 || c > 0) out[id] = { views: v, comments: c };
  }
  return out;
}

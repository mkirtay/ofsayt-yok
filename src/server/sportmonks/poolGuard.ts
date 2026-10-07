/**
 * Sportmonks havuz bekçisi — `cachedFetch.ts`'in upstream'e gitmeden önce ve döndükten sonra danıştığı durum:
 *
 * - Havuz eşlemesi: Sportmonks kotayı kaynak başına değil havuz (`rate_limit.requested_entity`) başına sayar
 *   (`fixtures` + `livescores` → Fixture). Eşleme her yanıttan öğrenilir; 429 gövdesi `rate_limit` taşımadığı için
 *   isteği atmadan önce hangi havuza düştüğünü buradan biliriz.
 * - Soğuma (429): havuz sınırı aşılınca o havuza `retry-after` / bilinen sıfırlanma süresi kadar HİÇ istek atılmaz
 *   (tüm instance'lar — Redis `smq:cooldown:<havuz>`). Aynı tick / render içindeki sonraki çağrılar upstream'e gitmez,
 *   eski veri ya da anında 429 alır: tekrar deneme yağmuru olmaz.
 * - Seyreltme: havuzda kalan %10'un altındaysa kısa TTL'ler ×3, %2'nin altındaysa ×6 (en çok 30 dk) — canlı liste
 *   30 sn yerine 90/180 sn'de bir tazelenir, bot'un `inplay`'i de aynı cache'ten okuduğu için kendiliğinden seyrelir.
 * - Ölçüm: her GERÇEK upstream isteği saatlik Redis hash'ine `havuz|rota|kaynak` alanıyla sayılır
 *   (`smq:usage:<YYYY-MM-DDTHH>`, 8 gün). Instance içinde toplanıp toplu yazılır; instance kapanırsa son birkaç sayım
 *   kaybolabilir (yaklaşık ölçüm). Rapor: `GET /api/admin/sportmonks-usage`.
 */
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { runInBackground } from '@/server/backgroundTask';

// ─── Havuz eşlemesi ─────────────────────────────────────────────────────────

/** Başlangıç eşlemesi (Pass 1–5 gözlemi); yanıtlardaki `requested_entity` bunu ezer. */
const SEED_POOLS: Record<string, string> = { fixtures: 'Fixture', livescores: 'Fixture' };
const learnedPools = new Map<string, string>();

/** `football/fixtures/date/…` → `fixtures`; `core/types` → `core:types`. */
export function sportmonksResource(path: string): string {
  const [base, res] = path.replace(/^\/+/, '').split('/');
  if (base === 'core') return `core:${res ?? ''}`;
  return (base === 'football' ? res : base) ?? '';
}

export function poolForPath(path: string): string {
  const r = sportmonksResource(path);
  return learnedPools.get(r) ?? SEED_POOLS[r] ?? r;
}

export function learnPool(path: string, pool: string): void {
  if (pool) learnedPools.set(sportmonksResource(path), pool);
}

// ─── Kalan kota / seyreltme ────────────────────────────────────────────────

export const POOL_LIMIT = 2500;
export const LOW_POOL_RATIO = 0.1;
export const CRITICAL_POOL_RATIO = 0.02;
export const LOW_POOL_FACTOR = 3;
export const CRITICAL_POOL_FACTOR = 6;
/** Esnetilmiş taze süre üst sınırı (zaten daha uzun olan TTL'lere dokunulmaz). */
export const MAX_STRETCHED_FRESH_SECONDS = 30 * 60;

type PoolState = { remaining: number; resetAt: number };
const poolState = new Map<string, PoolState>();

export function notePoolObservation(pool: string, remaining: number, resetsInSeconds: number, now: number): void {
  if (!Number.isFinite(remaining)) return;
  const resetAt = now + Math.max(0, Number.isFinite(resetsInSeconds) ? resetsInSeconds : 3600) * 1000;
  poolState.set(pool, { remaining, resetAt });
}

/** Havuzun bilinen son durumu sıfırlanmadan önceyse kalan; bilinmiyorsa null. */
export function knownPoolRemaining(pool: string, now: number): number | null {
  const s = poolState.get(pool);
  return s && s.resetAt > now ? s.remaining : null;
}

export function freshStretchFactor(pool: string, now: number): number {
  const remaining = knownPoolRemaining(pool, now);
  if (remaining == null) return 1;
  if (remaining < POOL_LIMIT * CRITICAL_POOL_RATIO) return CRITICAL_POOL_FACTOR;
  if (remaining < POOL_LIMIT * LOW_POOL_RATIO) return LOW_POOL_FACTOR;
  return 1;
}

export function stretchFreshSeconds(fresh: number, pool: string, now: number): number {
  const factor = freshStretchFactor(pool, now);
  if (factor === 1) return fresh;
  return Math.max(fresh, Math.min(fresh * factor, MAX_STRETCHED_FRESH_SECONDS));
}

// ─── Soğuma (429) ──────────────────────────────────────────────────────────

export const DEFAULT_COOLDOWN_SECONDS = 60;
export const MIN_COOLDOWN_SECONDS = 15;
export const MAX_COOLDOWN_SECONDS = 3600;
/** "Soğuma yok" cevabı instance içinde bu kadar hatırlanır (her MISS'te Redis'e sorulmasın). */
const COOLDOWN_RECHECK_MS = 5_000;

const cooldownKey = (pool: string) => `${cacheKeyPrefix()}smq:cooldown:${pool}`;
const cooldownL1 = new Map<string, { until: number; checkedAt: number }>();

/** Havuz soğumadaysa bitiş zamanı (ms), değilse 0. Redis yoksa yalnız instance içi bilgi. */
export async function poolCooldownUntil(pool: string, now: number): Promise<number> {
  const local = cooldownL1.get(pool);
  if (local && local.until > now) return local.until;
  if (local && now - local.checkedAt < COOLDOWN_RECHECK_MS) return 0;
  const stored = await withRedis((r) => r.get<number>(cooldownKey(pool)), null);
  const until = typeof stored === 'number' && stored > now ? stored : 0;
  cooldownL1.set(pool, { until, checkedAt: now });
  return until;
}

/** 429 sonrası bekleme: `retry-after` (sn) > havuzun bilinen sıfırlanması > varsayılan; [15 sn, 1 sa]. */
export function cooldownSecondsFor429(pool: string, retryAfter: string | null | undefined, now: number): number {
  const ra = retryAfter != null && /^\d+$/.test(retryAfter.trim()) ? Number(retryAfter) : NaN;
  const s = poolState.get(pool);
  const seconds = Number.isFinite(ra) ? ra : s && s.resetAt > now ? Math.ceil((s.resetAt - now) / 1000) : DEFAULT_COOLDOWN_SECONDS;
  return Math.min(MAX_COOLDOWN_SECONDS, Math.max(MIN_COOLDOWN_SECONDS, seconds));
}

/** Soğumayı başlatır (instance + Redis). Yeni başladıysa true — Sentry'ye soğuma başına tek olay için. */
export async function startPoolCooldown(pool: string, seconds: number, now: number): Promise<boolean> {
  const until = now + seconds * 1000;
  const prev = cooldownL1.get(pool);
  const alreadyCooling = !!prev && prev.until > now;
  cooldownL1.set(pool, { until: Math.max(until, prev?.until ?? 0), checkedAt: now });
  poolState.set(pool, { remaining: 0, resetAt: until });
  await withRedis((r) => r.set(cooldownKey(pool), until, { px: seconds * 1000 }), null);
  return !alreadyCooling;
}

// ─── Ölçüm ─────────────────────────────────────────────────────────────────

export const USAGE_KEEP_SECONDS = 8 * 24 * 3600;
const FLUSH_EVERY_CALLS = 20;
const FLUSH_EVERY_MS = 15_000;

const usageKey = (hour: string) => `${cacheKeyPrefix()}smq:usage:${hour}`;
export const usageHour = (now: number) => new Date(now).toISOString().slice(0, 13);

let pending = new Map<string, Map<string, number>>();
let pendingCount = 0;
let lastFlushAt = 0;

export type UpstreamCall = { pool: string; route: string; origin: 'proxy' | 'server'; status: number | 'network-error' | 'timeout' };

/** `|` alan ayırıcı; rota adında geçmesin. */
const clean = (s: string) => s.replace(/\|/g, '/').slice(0, 120);

export function recordUpstreamCall(call: UpstreamCall, now: number): void {
  const hour = usageHour(now);
  const fields = pending.get(hour) ?? new Map<string, number>();
  const base = `${clean(call.pool)}|${clean(call.route)}|${call.origin}`;
  fields.set(base, (fields.get(base) ?? 0) + 1);
  if (call.status === 429) fields.set(`429|${base}`, (fields.get(`429|${base}`) ?? 0) + 1);
  pending.set(hour, fields);
  pendingCount += 1;
  if (pendingCount >= FLUSH_EVERY_CALLS || now - lastFlushAt >= FLUSH_EVERY_MS) {
    lastFlushAt = now;
    runInBackground(flushUsage);
  }
}

export async function flushUsage(): Promise<void> {
  if (pending.size === 0) return;
  const batch = pending;
  pending = new Map();
  pendingCount = 0;
  await withRedis(async (r) => {
    const p = r.pipeline();
    for (const [hour, fields] of batch) {
      for (const [field, n] of fields) p.hincrby(usageKey(hour), field, n);
      p.expire(usageKey(hour), USAGE_KEEP_SECONDS);
    }
    await p.exec();
    return true;
  }, false);
}

export type UsageRow = { pool: string; route: string; origin: string; calls: number; rateLimited: number };
export type UsageHour = { hour: string; rows: UsageRow[] };

/** Sayaç alanlarını satırlara çevirir (en çok tüketen önce). */
export function usageRowsFromHash(hash: Record<string, number | string> | null): UsageRow[] {
  const rows = new Map<string, UsageRow>();
  for (const [field, raw] of Object.entries(hash ?? {})) {
    const n = Number(raw) || 0;
    const limited = field.startsWith('429|');
    const [pool = '', route = '', origin = ''] = (limited ? field.slice(4) : field).split('|');
    const key = `${pool}|${route}|${origin}`;
    const row = rows.get(key) ?? { pool, route, origin, calls: 0, rateLimited: 0 };
    if (limited) row.rateLimited += n;
    else row.calls += n;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => b.calls - a.calls || a.route.localeCompare(b.route));
}

/** Son `hours` saatin sayaçları (yeni saat önce). */
export async function readUsage(hours: number, now: number): Promise<UsageHour[]> {
  const out: UsageHour[] = [];
  for (let i = 0; i < hours; i++) {
    const hour = usageHour(now - i * 3_600_000);
    const hash = await withRedis((r) => r.hgetall<Record<string, number>>(usageKey(hour)), null);
    out.push({ hour, rows: usageRowsFromHash(hash) });
  }
  return out;
}

/** Test yardımcısı. */
export function resetPoolGuardForTests(): void {
  learnedPools.clear();
  poolState.clear();
  cooldownL1.clear();
  pending = new Map();
  pendingCount = 0;
  lastFlushAt = 0;
}

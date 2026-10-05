/**
 * AI Asistan günlük kotası ve global bütçe sigortası (docs/AI_ASISTAN_V2_PLAN.md §6).
 *
 * Kota (Türkiye günü): misafir 3 · kayıtlı 15 · premium / yönetici 50. Misafir iki anahtarla sayılır (IP /24 özeti +
 * tarayıcı çerezi); biri dolunca kapanır. Redis tanımlı ama cevap vermiyorsa misafir KAPALI (fail-closed), girişli
 * kullanıcı instance içi yedek sayaçla devam eder. Redis hiç tanımlı değilse (yerel geliştirme) hepsi instance içi.
 * Bütçe: günlük tahmini LLM maliyeti (mikro-USD) toplanır; 5 USD aşılınca asistan o gün herkese kapanır.
 */
import { createHash } from 'node:crypto';
import { getRedisClient, withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { todayIsoIstanbul } from '@/utils/dateStrip';

export type AssistantTier = 'guest' | 'user' | 'premium';
export const ASSISTANT_DAILY_LIMIT: Record<AssistantTier, number> = { guest: 3, user: 15, premium: 50 };
export const ASSISTANT_DAILY_BUDGET_MICRO_USD = 5_000_000;
const TTL_SECONDS = 36 * 3600;

const quotaKey = (day: string, key: string) => `${cacheKeyPrefix()}assistant:quota:${day}:${key}`;
const budgetKey = (day: string) => `${cacheKeyPrefix()}assistant:budget:${day}`;

/** IPv4 → /24, IPv6 → /64; ham IP saklanmaz (tuzlu özet). */
export function guestIpKey(ip: string, salt: string = process.env.AUTH_SECRET ?? 'oy'): string {
  const net = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip.split('.').slice(0, 3).join('.');
  return `ip:${createHash('sha256').update(`${salt}|${net}`).digest('hex').slice(0, 24)}`;
}

// Instance içi yedek (Redis yok / girişli kullanıcıda Redis kesintisi).
const memory = new Map<string, number>();
function memGet(k: string): number {
  return memory.get(k) ?? 0;
}
function memIncr(k: string, by: number): void {
  if (memory.size > 5000) memory.clear();
  memory.set(k, memGet(k) + by);
}
export function resetAssistantQuotaMemoryForTests(): void {
  memory.clear();
}

type Read = { ok: true; value: number } | { ok: false };

async function readCounter(key: string): Promise<Read> {
  if (!getRedisClient()) return { ok: true, value: memGet(key) };
  return withRedis<Read>(async (r) => ({ ok: true, value: Number((await r.get<number>(key)) ?? 0) }), { ok: false });
}

async function bumpCounter(key: string, by: number): Promise<void> {
  if (!getRedisClient()) return memIncr(key, by);
  const ok = await withRedis(async (r) => {
    await r.incrby(key, by);
    await r.expire(key, TTL_SECONDS);
    return true;
  }, false);
  if (!ok) memIncr(key, by);
}

export type QuotaState =
  | { allowed: true; remaining: number; limit: number }
  | { allowed: false; reason: 'QUOTA' | 'BUDGET' | 'UNAVAILABLE'; limit: number };

/** `keys`: kullanıcı için `[u:<id>]`, misafir için `[ip özeti, çerez]`. */
export async function checkAssistantQuota(tier: AssistantTier, keys: string[], day: string = todayIsoIstanbul()): Promise<QuotaState> {
  const limit = ASSISTANT_DAILY_LIMIT[tier];
  const budget = await readCounter(budgetKey(day));
  if (budget.ok && budget.value >= ASSISTANT_DAILY_BUDGET_MICRO_USD) return { allowed: false, reason: 'BUDGET', limit };
  let used = 0;
  for (const k of keys) {
    const c = await readCounter(quotaKey(day, k));
    if (!c.ok) {
      // Redis kesintisi: misafir kapalı; girişli kullanıcı instance içi sayaçla.
      if (tier === 'guest') return { allowed: false, reason: 'UNAVAILABLE', limit };
      used = Math.max(used, memGet(quotaKey(day, k)));
    } else used = Math.max(used, c.value);
  }
  if (!budget.ok && tier === 'guest') return { allowed: false, reason: 'UNAVAILABLE', limit };
  if (used >= limit) return { allowed: false, reason: 'QUOTA', limit };
  return { allowed: true, remaining: limit - used, limit };
}

/** Tamamlanan mesajı sayar ve maliyeti bütçeye ekler. */
export async function recordAssistantUsage(keys: string[], costMicroUsd: number, day: string = todayIsoIstanbul()): Promise<void> {
  await Promise.all([
    ...keys.map((k) => bumpCounter(quotaKey(day, k), 1)),
    costMicroUsd > 0 ? bumpCounter(budgetKey(day), Math.ceil(costMicroUsd)) : Promise.resolve(),
  ]);
}

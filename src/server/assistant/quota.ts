/**
 * AI Asistan günlük kotası ve günlük bütçe sigortası (docs/AI_ASISTAN_V2_PLAN.md §6).
 *
 * Kota (Türkiye günü): misafir 3 · kayıtlı 15 · premium / yönetici 50. Misafir iki anahtarla sayılır (IP /24 ya da /64
 * özeti + tarayıcı çerezi); biri dolunca kapanır. Bütçe: günlük tahmini LLM maliyeti (mikro-USD); 5 USD aşılınca asistan
 * o gün herkese kapanır. Aylık tavan ayrıca `server/llmBudget.ts`.
 *
 * Sıra: ÖNCE ayır, SONRA kesinleştir. `reserveAssistantQuota` her anahtarı INCR eder ve dönen yeni değere bakar: sınır
 * aşıldıysa geri alır (DECR) ve reddeder — INCR atomik olduğundan eşzamanlı istekler sınırı aşamaz (okuyup sonra artırma
 * yarışı yok). Bütçeye mesaj başına tahmini üst sınır eklenir; `settleAssistantUsage` gerçek maliyetle farkı yazar, boş
 * yanıtta hakkı iade eder. Zaman aşımı / hata / iptal yolunda da kesinleştirilir; hiçbir yol kotayı atlamaz.
 *
 * Redis tanımlı ama cevap vermiyorsa: misafir KAPALI (fail-closed); girişli kullanıcı instance içi küçük yedek sınırla
 * (ASSISTANT_OUTAGE_LIMIT) devam eder. Redis hiç tanımlı değilse (yerel geliştirme) hepsi instance içi, normal sınırlar.
 */
import { createHash } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import { getRedisClient, withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { todayIsoIstanbul } from '@/utils/dateStrip';

export type AssistantTier = 'guest' | 'user' | 'premium';
export const ASSISTANT_DAILY_LIMIT: Record<AssistantTier, number> = { guest: 3, user: 15, premium: 50 };
export const ASSISTANT_DAILY_BUDGET_MICRO_USD = 5_000_000;
/** Mesaj başına önden ayrılan tahmini maliyet (üst sınır: 4 model çağrısı × ~6k girdi + 500 çıktı, gpt-6-luna ≈ 0,004 USD). */
export const ASSISTANT_ESTIMATE_MICRO_USD = 4_000;
/** Redis kesintisinde girişli kullanıcı için instance içi yedek günlük sınır. */
export const ASSISTANT_OUTAGE_LIMIT = 5;
const TTL_SECONDS = 36 * 3600;

const quotaKey = (day: string, key: string) => `${cacheKeyPrefix()}assistant:quota:${day}:${key}`;
const budgetKey = (day: string) => `${cacheKeyPrefix()}assistant:budget:${day}`;

/** IPv6'yı 8 hextet'e açar (`::` sıkıştırması); geçersizse null. */
function expandIpv6(ip: string): string[] | null {
  const [head, tail, extra] = ip.split('::');
  if (extra !== undefined) return null;
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  if (tail === undefined && left.length !== 8) return null;
  const fill = Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0');
  return [...left, ...fill, ...right].map((h) => parseInt(h || '0', 16).toString(16));
}

/** IPv4 → /24, IPv6 → /64 (kanonik: sıkıştırılmış yazım fark etmez; IPv4-mapped adres /24); ham IP saklanmaz (tuzlu özet). */
export function guestIpKey(ip: string, salt: string = process.env.AUTH_SECRET ?? 'oy'): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const v4 = mapped ? mapped[1]! : ip;
  let net: string;
  if (isIPv4(v4)) net = `v4:${v4.split('.').slice(0, 3).join('.')}`;
  else if (isIPv6(ip)) net = `v6:${(expandIpv6(ip.split('%')[0]!) ?? [ip]).slice(0, 4).join(':')}`;
  else net = `raw:${ip}`;
  return `ip:${createHash('sha256').update(`${salt}|${net}`).digest('hex').slice(0, 24)}`;
}

// ─── Sayaç deposu: Redis (atomik INCRBY) ya da instance içi yedek ───────────

type Store = 'redis' | 'memory';
const memory = new Map<string, number>();
function memIncr(k: string, by: number): number {
  if (memory.size > 5000) memory.clear();
  const v = (memory.get(k) ?? 0) + by;
  memory.set(k, v);
  return v;
}
export function resetAssistantQuotaMemoryForTests(): void {
  memory.clear();
}

/** Redis INCRBY; ilk yazımda TTL. Kesinti/hata → null. */
async function redisIncr(key: string, by: number): Promise<number | null> {
  return withRedis<number | null>(async (r) => {
    const v = Number(await r.incrby(key, by));
    if (v === by) await r.expire(key, TTL_SECONDS);
    return v;
  }, null);
}

const incr = (store: Store, key: string, by: number): Promise<number | null> => (store === 'redis' ? redisIncr(key, by) : Promise.resolve(memIncr(key, by)));

export type QuotaReservation = {
  keys: string[];
  day: string;
  limit: number;
  /** Bu mesaj sayıldıktan sonra kalan hak. */
  remaining: number;
  estimate: number;
  store: Store;
};

export type QuotaState =
  | { allowed: true; reservation: QuotaReservation; remaining: number; limit: number }
  | { allowed: false; reason: 'QUOTA' | 'BUDGET' | 'UNAVAILABLE'; limit: number };

async function reserveIn(store: Store, limit: number, keys: string[], day: string, estimate: number): Promise<QuotaState | 'outage'> {
  const taken: string[] = [];
  const rollback = (budgetToo: boolean) =>
    Promise.all([...taken.map((k) => incr(store, k, -1)), budgetToo ? incr(store, budgetKey(day), -estimate) : null]);
  let used = 0;
  for (const key of keys) {
    const k = quotaKey(day, key);
    const v = await incr(store, k, 1);
    if (v == null) {
      await rollback(false);
      return 'outage';
    }
    taken.push(k);
    used = Math.max(used, v);
    if (v > limit) {
      await rollback(false);
      return { allowed: false, reason: 'QUOTA', limit };
    }
  }
  const budget = await incr(store, budgetKey(day), estimate);
  if (budget == null) {
    await rollback(false);
    return 'outage';
  }
  if (budget > ASSISTANT_DAILY_BUDGET_MICRO_USD) {
    await rollback(true);
    return { allowed: false, reason: 'BUDGET', limit };
  }
  const remaining = Math.max(0, limit - used);
  return { allowed: true, reservation: { keys: taken, day, limit, remaining, estimate, store }, remaining, limit };
}

/**
 * Hakkı ve tahmini maliyeti atomik ayırır. `keys`: kullanıcı için `[u:<id>]`, misafir için `[ip özeti, çerez]`.
 * Red durumunda sayaçlar geri alınmıştır.
 */
export async function reserveAssistantQuota(
  tier: AssistantTier,
  keys: string[],
  day: string = todayIsoIstanbul(),
  estimate: number = ASSISTANT_ESTIMATE_MICRO_USD,
): Promise<QuotaState> {
  const limit = ASSISTANT_DAILY_LIMIT[tier];
  if (!getRedisClient()) return (await reserveIn('memory', limit, keys, day, estimate)) as QuotaState;
  const r = await reserveIn('redis', limit, keys, day, estimate);
  if (r !== 'outage') return r;
  // Redis kesintisi: misafir kapalı; girişli kullanıcı instance içi küçük yedek sınırla.
  if (tier === 'guest') return { allowed: false, reason: 'UNAVAILABLE', limit };
  return (await reserveIn('memory', Math.min(limit, ASSISTANT_OUTAGE_LIMIT), keys, day, estimate)) as QuotaState;
}

/**
 * Rezervasyonu kesinleştirir: bütçeye gerçek maliyet farkı (`costMicroUsd` bilinmiyorsa tahmin kalır), `counted=false`
 * (boş yanıt) ise hak iade. Hata / zaman aşımı / iptal yolunda da çağrılır.
 */
export async function settleAssistantUsage(reservation: QuotaReservation, result: { counted: boolean; costMicroUsd: number | null }): Promise<void> {
  const delta = result.costMicroUsd == null ? 0 : Math.max(0, Math.ceil(result.costMicroUsd)) - reservation.estimate;
  await Promise.all([
    delta !== 0 ? incr(reservation.store, budgetKey(reservation.day), delta) : null,
    ...(result.counted ? [] : reservation.keys.map((k) => incr(reservation.store, k, -1))),
  ]);
}

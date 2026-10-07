/**
 * Aylık OpenAI harcama sigortası — bütün LLM kullanımları (asistan, analiz üretimi, ön üretim, trivia) tek sayaçta.
 *
 * - Tavan: `OPENAI_MONTHLY_BUDGET_USD` (varsayılan 30). Ay: Türkiye takvimi (YYYY-MM).
 * - Rezervasyon ÖNCE: `reserveLlmBudget(tahmin)` sayaca tahmini ekler (INCRBY); tavanı aşarsa geri alır (DECRBY) ve
 *   `null` döner → çağıran LLM'i çağırmaz. Eşzamanlı istekler aşamaz: INCRBY atomik, herkes kendi yeni değerini görür.
 * - Kesinleştirme SONRA: `settleLlmBudget(rez, gerçek)` farkı yazar (gerçek − tahmin; eksi olabilir). Zaman aşımı ya da
 *   hatada gerçek bilinmiyorsa tahmin (üst sınır) kalır — hiçbir yol bütçeyi atlamaz.
 * - Uyarı: tavanın %80'inde Sentry warning, %100'ünde Sentry error; ay başına birer kez (SET NX).
 * - Redis kesintisinde instance içi yedek sayaç, tavanın dörtte biriyle (kesinti tüm kademelerde sınırsız bırakmasın;
 *   fail-closed değil, ödeyen kullanıcının analizi kısa bir Redis kesintisinde kapanmasın). Redis tanımlı değilse
 *   (yerel) instance içi tam tavan.
 */
import * as Sentry from '@sentry/nextjs';
import { getRedisClient, withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { todayIsoIstanbul } from '@/utils/dateStrip';

export const LLM_MONTHLY_BUDGET_USD_DEFAULT = 30;
export const LLM_BUDGET_ALERT_RATIO = 0.8;
/** Redis kesintisinde instance başına tavan payı. */
export const LLM_BUDGET_OUTAGE_SHARE = 0.25;
const TTL_SECONDS = 40 * 24 * 3600;

export class LlmBudgetExceededError extends Error {
  readonly code = 'LLM_BUDGET';
  constructor() {
    super('AI hizmeti bu ay için kapasitesine ulaştı. Gelecek ay yeniden deneyin.');
    this.name = 'LlmBudgetExceededError';
  }
}

export function llmMonthlyBudgetMicroUsd(raw: string | undefined = process.env.OPENAI_MONTHLY_BUDGET_USD): number {
  const usd = Number(raw);
  return Math.round((Number.isFinite(usd) && usd > 0 ? usd : LLM_MONTHLY_BUDGET_USD_DEFAULT) * 1_000_000);
}

export const monthKeyIstanbul = (now: Date = new Date()) => todayIsoIstanbul(now).slice(0, 7);
const budgetKey = (month: string) => `${cacheKeyPrefix()}llm:budget:${month}`;
const alertKey = (month: string, pct: number) => `${cacheKeyPrefix()}llm:budget-alert:${month}:${pct}`;

export type LlmBudgetReservation = { month: string; estimate: number; store: 'redis' | 'memory' };

// Instance içi yedek (Redis yok / kesinti).
const memory = new Map<string, number>();
function memIncr(key: string, by: number): number {
  if (memory.size > 1000) memory.clear();
  const v = (memory.get(key) ?? 0) + by;
  memory.set(key, v);
  return v;
}
export function resetLlmBudgetMemoryForTests(): void {
  memory.clear();
}

/** Redis INCRBY; ilk yazımda TTL. Hata/kesintide null. */
async function redisIncr(key: string, by: number): Promise<number | null> {
  return withRedis<number | null>(async (r) => {
    const v = Number(await r.incrby(key, by));
    if (v === by) await r.expire(key, TTL_SECONDS);
    return v;
  }, null);
}

async function alertOnce(month: string, pct: number, store: LlmBudgetReservation['store'], used: number, cap: number): Promise<void> {
  const key = alertKey(month, pct);
  const first =
    store === 'redis'
      ? await withRedis(async (r) => (await r.set(key, 1, { nx: true, ex: TTL_SECONDS })) === 'OK', memIncr(key, 1) === 1)
      : memIncr(key, 1) === 1;
  if (!first) return;
  const msg = `OpenAI aylık bütçe %${pct}: ${(used / 1e6).toFixed(2)} / ${(cap / 1e6).toFixed(2)} USD (${month})`;
  console.warn(`[llm-budget] ${msg}`);
  Sentry.captureMessage(msg, { level: pct >= 100 ? 'error' : 'warning', tags: { 'llm.budget': String(pct) } });
}

/**
 * Tahmini maliyeti bütçeden ayırır. Tavan aşılırsa geri alır ve `null` döner (çağıran LLM'i çağırmaz, kullanıcıya
 * nazik mesaj). Başarılıysa `settleLlmBudget` ile kesinleştirilir.
 */
export async function reserveLlmBudget(estimateMicroUsd: number, opts: { month?: string; capMicroUsd?: number } = {}): Promise<LlmBudgetReservation | null> {
  const month = opts.month ?? monthKeyIstanbul();
  const estimate = Math.max(0, Math.ceil(estimateMicroUsd));
  const fullCap = opts.capMicroUsd ?? llmMonthlyBudgetMicroUsd();
  const key = budgetKey(month);
  let store: LlmBudgetReservation['store'] = 'redis';
  let cap = fullCap;
  let value: number | null = getRedisClient() ? await redisIncr(key, estimate) : null;
  if (value == null) {
    store = 'memory';
    if (getRedisClient()) cap = Math.round(fullCap * LLM_BUDGET_OUTAGE_SHARE);
    value = memIncr(key, estimate);
  }
  if (value > cap) {
    if (store === 'redis') await redisIncr(key, -estimate);
    else memIncr(key, -estimate);
    await alertOnce(month, 100, store, value - estimate, cap);
    return null;
  }
  if (value >= cap * LLM_BUDGET_ALERT_RATIO) await alertOnce(month, 80, store, value, cap);
  return { month, estimate, store };
}

/** Gerçek maliyet biliniyorsa farkı yazar; bilinmiyorsa (zaman aşımı) tahmin kalır. */
export async function settleLlmBudget(reservation: LlmBudgetReservation | null, actualMicroUsd: number | null): Promise<void> {
  if (!reservation || actualMicroUsd == null) return;
  const delta = Math.max(0, Math.ceil(actualMicroUsd)) - reservation.estimate;
  if (delta === 0) return;
  const key = budgetKey(reservation.month);
  if (reservation.store === 'redis' && (await redisIncr(key, delta)) != null) return;
  memIncr(key, delta);
}

/** Yönetici görünümü: bu ayın harcaması ve tavan (Redis okunamazsa null). */
export async function readLlmBudget(month: string = monthKeyIstanbul()): Promise<{ month: string; usedMicroUsd: number; capMicroUsd: number } | null> {
  const cap = llmMonthlyBudgetMicroUsd();
  if (!getRedisClient()) return { month, usedMicroUsd: memory.get(budgetKey(month)) ?? 0, capMicroUsd: cap };
  const used = await withRedis<number | null>(async (r) => Number((await r.get<number>(budgetKey(month))) ?? 0), null);
  return used == null ? null : { month, usedMicroUsd: used, capMicroUsd: cap };
}

/**
 * Hakem AI raporu — hakem sayfasının ISR verisinden (Redis SWR kaydı; EK SPORTMONKS İSTEĞİ YOK) hesaplanan metrikler
 * OpenAI'ye verilir, model yalnız yorumlar (bkz. config/refereeReportPrompt.ts).
 *
 * Maliyet:
 * - Rapor hakem başına Redis'te (30 gün). Girdi metninin özeti (hash) değişmedikçe yeniden üretilmez.
 * - Veri değiştiyse eski rapor HEMEN verilir; yenisi arka planda, en sık `REGEN_MIN_SECONDS`'ta bir.
 * - Aynı hakem için aynı anda tek üretim (Redis NX kilidi); aylık LLM bütçesi (`reserveLlmBudget`) aşılırsa üretim yok.
 * - Sayfa verisi Redis'te yoksa (sayfa hiç üretilmemiş / rastgele id) rapor üretilmez.
 */
import { createHash } from 'node:crypto';
import OpenAI from 'openai';
import trLeagues from '../../../public/locales/tr/leagues.json';
import { SPORTMONKS_LEAGUE_NAME_KEYS } from '@/config/leagueNameKeys';
import {
  REFEREE_REPORT_RESPONSE_FORMAT,
  REFEREE_REPORT_SYSTEM_PROMPT,
  REFEREE_REPORT_VERSION,
  buildRefereeReportUserMessage,
  validateRefereeReport,
  type RefereeReportJson,
} from '@/config/refereeReportPrompt';
import { buildRefereeReportMetrics, type RefereeReportMetrics } from '@/server/people/refereeReportMetrics';
import { refereePageCacheKey, type RefereePageData } from '@/server/people/refereePage';
import { peekSwr } from '@/server/swrCache';
import { runInBackground } from '@/server/backgroundTask';
import { getRedisClient, withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { openAiNoReasoningParams } from '@/services/aiAnalysisService';
import { reserveLlmBudget, settleLlmBudget } from '@/server/llmBudget';
import { llmCostMicroUsd } from '@/server/llmCost';

/** Rapor modeli; acil değişim için `OPENAI_REFEREE_REPORT_MODEL`. */
export const REFEREE_REPORT_MODEL = process.env.OPENAI_REFEREE_REPORT_MODEL || 'gpt-6-luna';
const KEEP_SECONDS = 30 * 24 * 60 * 60;
/** Veri değişse de bu süreden sık yeniden üretme (lig ortalamasının gelip gitmesi, her yeni maç). */
export const REGEN_MIN_SECONDS = 24 * 60 * 60;
const LOCK_MS = 45_000;
const TIMEOUT_MS = 25_000;
const MAX_TOKENS = 600;

/** Önbellekteki model çıktısı. */
type StoredReport = { report: RefereeReportJson; generatedAt: number; model: string };

/** İstemciye: model yorumu (önbellekten) + grafik metrikleri (her istekte sayfa verisinden, güncel). */
export type RefereeReportView = StoredReport & { metrics: RefereeReportMetrics };

export type RefereeReportResult = { status: 'ready'; data: RefereeReportView } | { status: 'pending' } | { status: 'unavailable' };

type Entry = { hash: string; at: number; data: StoredReport };

const shortLeagues = (trLeagues as { short?: Record<string, string> }).short ?? {};
export function leagueNameTr(leagueId: number | null): string {
  const key = leagueId != null ? SPORTMONKS_LEAGUE_NAME_KEYS[leagueId] : undefined;
  return (key && shortLeagues[key]) || '';
}

// v2: grafikli karne şeması (v1 uzun metin kayıtları okunmasın).
const reportKey = (id: number) => `${cacheKeyPrefix()}people:referee-report:v2:${id}`;

let openai: OpenAI | null = null;
function client(): OpenAI {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

/** Rapor üretilebilir mi: en az bir sezon satırı ve ana lig bağlamı olmalı. */
export function hasEnoughData(page: RefereePageData): boolean {
  return page.seasons.length > 0 && page.summary.context != null;
}

export function inputHash(userMessage: string): string {
  return createHash('sha256').update(`${REFEREE_REPORT_VERSION}|${REFEREE_REPORT_MODEL}|${userMessage}`).digest('base64url').slice(0, 16);
}

async function callModel(userMessage: string): Promise<RefereeReportJson | null> {
  const budget = await reserveLlmBudget(llmCostMicroUsd(REFEREE_REPORT_MODEL, { input: 3_000, output: 400 }));
  if (!budget) return null;
  let cost: number | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await client().chat.completions.create(
      {
        model: REFEREE_REPORT_MODEL,
        ...openAiNoReasoningParams(REFEREE_REPORT_MODEL, 0.3),
        max_completion_tokens: MAX_TOKENS,
        response_format: REFEREE_REPORT_RESPONSE_FORMAT,
        messages: [
          { role: 'system', content: REFEREE_REPORT_SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
      },
      { signal: controller.signal },
    );
    cost = llmCostMicroUsd(REFEREE_REPORT_MODEL, {
      input: res.usage?.prompt_tokens ?? 0,
      cached: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      output: res.usage?.completion_tokens ?? 0,
    });
    const raw = res.choices?.[0]?.message?.content ?? '';
    return validateRefereeReport(JSON.parse(raw));
  } catch (e) {
    console.error('[referee-report] üretim hatası', e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
    await settleLlmBudget(budget, cost);
  }
}

async function tryLock(id: number): Promise<boolean> {
  if (!getRedisClient()) return true;
  return withRedis(async (r) => (await r.set(`${reportKey(id)}:lock`, 1, { nx: true, px: LOCK_MS })) === 'OK', false);
}

/** `locked`: başka bir istek üretiyor; `failed`: model hatası / bütçe doldu. */
async function generate(id: number, hash: string, userMessage: string, now: number): Promise<Entry | 'locked' | 'failed'> {
  if (!(await tryLock(id))) return 'locked';
  try {
    const report = await callModel(userMessage);
    if (!report) return 'failed';
    const entry: Entry = { hash, at: now, data: { report, generatedAt: now, model: REFEREE_REPORT_MODEL } };
    await withRedis((r) => r.set(reportKey(id), entry, { ex: KEEP_SECONDS }), null);
    return entry;
  } finally {
    await withRedis((r) => r.del(`${reportKey(id)}:lock`), 0);
  }
}

export type RefereeReportDeps = { now?: () => number; loadPage?: (id: number) => Promise<RefereePageData | null> };

export async function getRefereeReport(id: number, deps: RefereeReportDeps = {}): Promise<RefereeReportResult> {
  if (!process.env.OPENAI_API_KEY) return { status: 'unavailable' };
  const now = (deps.now ?? Date.now)();
  const page = await (deps.loadPage ?? ((i) => peekSwr<RefereePageData>(refereePageCacheKey(i))))(id);
  if (!page || !hasEnoughData(page)) return { status: 'unavailable' };

  const metrics = buildRefereeReportMetrics(page, leagueNameTr);
  const userMessage = buildRefereeReportUserMessage(metrics);
  const hash = inputHash(userMessage);
  const cached = await withRedis((r) => r.get<Entry>(reportKey(id)), null);

  if (cached?.data) {
    const stale = cached.hash !== hash && now - cached.at >= REGEN_MIN_SECONDS * 1000;
    if (stale) runInBackground(() => generate(id, hash, userMessage, now));
    return { status: 'ready', data: { ...cached.data, metrics } };
  }
  const fresh = await generate(id, hash, userMessage, now);
  if (fresh === 'locked') return { status: 'pending' };
  return fresh === 'failed' ? { status: 'unavailable' } : { status: 'ready', data: { ...fresh.data, metrics } };
}

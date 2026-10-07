/**
 * POST /api/assistant/chat — AI Asistan (v2.0). Yanıt Server-Sent Events: `delta` | `card` | `links` | `refused` | `error` | `done`.
 *
 * Gövde: `{ messages: [{ role: 'user' | 'assistant', content }], locale?: 'tr' | 'en', page?: string }` — son mesaj
 * kullanıcıdan, ≤ 300 karakter; geçmiş ≤ 6 mesaj (istemci tutar, sunucuda sohbet saklanmaz).
 * Sıra: oturum (isteğe bağlı) → hız sınırı (6/dk) → kota + günlük bütçe REZERVASYONU (misafir 3 / üye 15 / premium 50,
 * atomik INCR) → aylık OpenAI bütçesi rezervasyonu → model. Kota/bütçe/hız reddi akış başlamadan 429 JSON döner.
 * Rezervasyon `finally` içinde kesinleşir: yanıt / hata / 25 sn zaman aşımı / istemci iptali — hepsinde hak sayılır
 * (yalnız boş yanıtta iade), bütçeye gerçek maliyet (bilinmiyorsa tahmini üst sınır) yazılır. Hiçbir yol kotayı atlamaz.
 * Araçlar salt okunur; analiz üretilmez, kredi düşülmez.
 * Log: yalnız anonim yapısal satır (soru metni, kullanıcı id'si, IP YOK).
 */
import { randomUUID } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';
import { getRequestAuth } from '@/lib/mobileAuth';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { isAdminUser, isPremiumUser } from '@/lib/premium';
import { captureError } from '@/lib/logger';
import { loadViewer } from '@/server/analysisAccess';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { assistantCostMicroUsd, runAssistantChat, type AssistantChatClient, type ChatMessage } from '@/server/assistant/chat';
import { ASSISTANT_ESTIMATE_MICRO_USD, guestIpKey, reserveAssistantQuota, settleAssistantUsage, type AssistantTier } from '@/server/assistant/quota';
import { reserveLlmBudget, settleLlmBudget } from '@/server/llmBudget';
import { todayIsoIstanbul } from '@/utils/dateStrip';

export const config = { maxDuration: 30 };

export const ASSISTANT_MAX_MESSAGE_CHARS = 300;
const MAX_HISTORY = 6;
const MAX_HISTORY_CHARS = 1200;
const GUEST_COOKIE = 'oy_aid';
const RUN_TIMEOUT_MS = 25_000;

let openai: AssistantChatClient | null = null;
function getClient(): AssistantChatClient {
  if (!openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY tanımlı değil');
    openai = new OpenAI({ apiKey, maxRetries: 0 }) as unknown as AssistantChatClient;
  }
  return openai;
}

/** Geçersizse null. Son mesaj kullanıcıdan; roller yalnız user/assistant (sistem rolü istemciden kabul edilmez). */
export function parseChatMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const list: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_HISTORY)) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return null;
    list.push({ role, content: content.trim().slice(0, MAX_HISTORY_CHARS) });
  }
  const last = list[list.length - 1]!;
  if (last.role !== 'user' || last.content.length > ASSISTANT_MAX_MESSAGE_CHARS) return null;
  return list;
}

/** Yalnız site içi yol; sorgu ve parça atılır (prompt'a serbest metin girmesin). */
function pagePath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.split(/[?#]/)[0]!;
  return /^\/[\w\-/.%]{0,120}$/.test(path) ? path : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const started = Date.now();
  const body = (req.body ?? {}) as { messages?: unknown; locale?: unknown; page?: unknown };
  const messages = parseChatMessages(body.messages);
  if (!messages) return res.status(400).json({ error: 'Geçersiz mesaj.', code: 'BAD_REQUEST' });
  const locale = body.locale === 'en' ? 'en' : 'tr';

  const auth = await getRequestAuth(req, res);
  const viewer = await loadViewer(auth?.id);
  const tier: AssistantTier = !viewer ? 'guest' : isAdminUser(viewer) || isPremiumUser(viewer) ? 'premium' : 'user';

  let keys: string[];
  if (viewer) keys = [`u:${viewer.id}`];
  else {
    let aid = req.cookies?.[GUEST_COOKIE];
    if (!aid || !/^[\w-]{8,64}$/.test(aid)) {
      aid = randomUUID();
      res.setHeader('Set-Cookie', `${GUEST_COOKIE}=${aid}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    }
    keys = [guestIpKey(requestIp(req.headers, req.socket?.remoteAddress)), `c:${aid}`];
  }

  // Girişli kullanıcıda Redis kesintisi: instance içi yedek sayaç (sınırsız kalmasın); misafirde kapalı.
  const rl = await hitFixedWindowRateLimit(`assistant:${keys[0]}`, 6, 60_000, { failClosed: tier === 'guest', memoryFallback: true });
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))));
    return res.status(429).json({ error: 'Çok hızlı. Biraz bekleyin.', code: 'RATE' });
  }
  const quota = await reserveAssistantQuota(tier, keys);
  if (!quota.allowed) return res.status(429).json({ error: 'Günlük sınır.', code: quota.reason, tier, limit: quota.limit });
  const reservation = quota.reservation;
  const monthly = await reserveLlmBudget(ASSISTANT_ESTIMATE_MICRO_USD);
  if (!monthly) {
    await settleAssistantUsage(reservation, { counted: false, costMicroUsd: 0 });
    return res.status(429).json({ error: 'Asistan bu ay için kapasitesine ulaştı.', code: 'BUDGET_MONTHLY', tier, limit: quota.limit });
  }

  let client: AssistantChatClient;
  try {
    client = getClient();
  } catch (e) {
    captureError('assistant-chat-config', e);
    await Promise.all([settleAssistantUsage(reservation, { counted: false, costMicroUsd: 0 }), settleLlmBudget(monthly, 0)]);
    return res.status(503).json({ error: 'Asistan şu an kullanılamıyor.', code: 'UNAVAILABLE' });
  }

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'private, no-store, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  const write = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), RUN_TIMEOUT_MS);
  // İstemci bağlantıyı keserse model/araç zinciri durur; hak zaten ayrıldı (kesmek kotayı atlatmaz).
  res.on?.('close', () => abort.abort());
  let outcome = 'error';
  let tools: string[] = [];
  let usage = { input: 0, cached: 0, output: 0 };
  let sportmonksUpstream = 0;
  // Varsayılan: hak sayılır, maliyet tahmini üst sınır (hata / zaman aşımı yolunda model kullanımı bilinmeyebilir).
  let counted = true;
  let costMicroUsd = ASSISTANT_ESTIMATE_MICRO_USD;
  try {
    const tracked = await trackSportmonksFetches(() =>
      runAssistantChat({
        client,
        messages,
        ctx: { viewer, locale, todayIso: todayIsoIstanbul() },
        pagePath: pagePath(body.page),
        emit: (e) => (e.type === 'delta' ? write('delta', { text: e.text }) : e.type === 'card' ? write('card', e.card) : write('links', e.links)),
        signal: abort.signal,
        onUsage: (u) => {
          usage = u;
        },
      }),
    );
    const run = tracked.value;
    sportmonksUpstream = tracked.upstream;
    outcome = run.outcome;
    tools = run.tools;
    usage = run.usage;
    costMicroUsd = run.costMicroUsd;
    // Boş yanıt kullanıcının hakkından düşmez; maliyeti yine bütçeye yazılır.
    counted = run.outcome !== 'empty';
    if (run.outcome === 'filtered') write('refused', {});
    if (run.outcome === 'empty') write('error', { code: 'EMPTY' });
    write('done', { remaining: counted ? reservation.remaining : Math.min(reservation.limit, reservation.remaining + 1), limit: reservation.limit, tier });
  } catch (e) {
    if (!abort.signal.aborted) captureError('assistant-chat', e);
    // Kısmi kullanım biliniyorsa onu, yoksa tahmini üst sınırı yaz (zaman aşımı kotayı ve bütçeyi atlatmaz).
    costMicroUsd = Math.max(assistantCostMicroUsd(usage), ASSISTANT_ESTIMATE_MICRO_USD);
    write('error', { code: abort.signal.aborted ? 'TIMEOUT' : 'ERROR' });
  } finally {
    clearTimeout(timer);
    try {
      await Promise.all([settleAssistantUsage(reservation, { counted, costMicroUsd }), settleLlmBudget(monthly, costMicroUsd)]);
    } catch (e) {
      captureError('assistant-chat-settle', e);
    }
    // Anonim yapısal log: soru metni, kullanıcı id'si, IP yok.
    console.log(JSON.stringify({ event: 'assistant-chat', tier, locale, outcome, tools, tokens: usage, costMicroUsd, ms: Date.now() - started, sportmonksUpstream }));
    res.end();
  }
}

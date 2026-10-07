/**
 * AI Asistan sohbet döngüsü: OpenAI Chat Completions (gpt-6-luna, reasoning none, stream) + araçlar.
 *
 * Mesaj başına en çok MAX_TOOL_ROUNDS araç turu, tur başına en çok MAX_TOOL_CALLS_PER_ROUND ve mesaj başına en çok
 * MAX_TOOL_CALLS_PER_REQUEST araç çağrısı (fazlası atılır; hak bitince model araçsız yanıtlamaya zorlanır). Araç çağrıları
 * arasında iptal sinyali kontrol edilir (25 sn zaman aşımı araç zincirini de keser). Metin cümle kapısından
 * geçer (bahis terimi → kesilir). İstemciye giden olaylar: `delta` (metin), `card` (sunucunun araç çıktısından ürettiği
 * kart; yanıt başına en çok 1), `links` (yalnız site içi yollar; en çok 2, aynı hedef tekrarsız). Model metni link ya da
 * kart üretemez.
 */
import { openAiNoReasoningParams } from '@/services/aiAnalysisService';
import { llmCostMicroUsd } from '@/server/llmCost';
import { buildAssistantSystemPrompt } from './prompt';
import { openAiToolDefinitions, runAssistantTool, type AssistantCard, type ToolContext } from './tools';
import { createSentenceGate, sanitizeLinks, type AssistantLink } from './outputFilter';

export const MAX_LINKS_PER_REPLY = 2;

const linkTarget = (href: string) => href.split(/[?#]/)[0]!;

/**
 * Yanıt ekleri sade kalsın: en çok 1 kart + en çok 2 link, aynı hedefe (sorgu/parça hariç yol) tek link.
 * - Kart: analiz kartı varsa o (kendi düğmesi/linki var → ayrıca link gönderilmez); yoksa son maç listesi kartı.
 * - Maç kartındaki maçlara giden linkler tekrar edilmez.
 */
export function finalizeAttachments(cards: AssistantCard[], links: AssistantLink[]): { card: AssistantCard | null; links: AssistantLink[] } {
  const card = [...cards].reverse().find((c) => c.type === 'analysis') ?? cards[cards.length - 1] ?? null;
  // Analiz ve puan durumu kartları kendi düğmesini/linkini taşır → ayrıca link yok.
  if (card?.type === 'analysis' || card?.type === 'standings') return { card, links: [] };
  const taken = new Set(card?.type === 'matches' ? card.matches.map((m) => linkTarget(m.href)) : []);
  const out: AssistantLink[] = [];
  for (const l of sanitizeLinks(links, 20)) {
    const target = linkTarget(l.href);
    if (taken.has(target)) continue;
    taken.add(target);
    out.push(l);
    if (out.length >= MAX_LINKS_PER_REPLY) break;
  }
  return { card, links: out };
}

export const ASSISTANT_OPENAI_MODEL = process.env.OPENAI_ASSISTANT_MODEL || 'gpt-6-luna';
export const MAX_TOOL_ROUNDS = 3;
export const MAX_TOOL_CALLS_PER_ROUND = 4;
export const MAX_TOOL_CALLS_PER_REQUEST = 6;
const MAX_OUTPUT_TOKENS = 500;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantEvent =
  | { type: 'delta'; text: string }
  | { type: 'card'; card: AssistantCard }
  | { type: 'links'; links: AssistantLink[] };

export type AssistantOutcome = 'answered' | 'filtered' | 'empty';

export type AssistantRunResult = {
  outcome: AssistantOutcome;
  tools: string[];
  usage: { input: number; cached: number; output: number };
  costMicroUsd: number;
};

type StreamChunk = {
  choices?: Array<{ delta?: { content?: string | null; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null;
};

export type AssistantChatClient = {
  chat: { completions: { create: (body: Record<string, unknown>, opts?: { signal?: AbortSignal }) => Promise<AsyncIterable<StreamChunk>> } };
};

type ToolCall = { id: string; name: string; arguments: string };

/** Bütçe sigortası için tahmini maliyet (mikro-USD; fiyat tablosu server/llmCost.ts). */
export function assistantCostMicroUsd(u: { input: number; cached: number; output: number }): number {
  return llmCostMicroUsd(ASSISTANT_OPENAI_MODEL, u);
}

function abortError(): Error {
  const e = new Error('Asistan çalışması iptal edildi');
  e.name = 'AbortError';
  return e;
}

export async function runAssistantChat(opts: {
  client: AssistantChatClient;
  messages: ChatMessage[];
  ctx: ToolContext;
  pagePath?: string | null;
  emit: (event: AssistantEvent) => void;
  signal?: AbortSignal;
  /** Her model çağrısından sonra birikmiş kullanım (zaman aşımında bile gerçek maliyet bütçeye yazılsın). */
  onUsage?: (usage: { input: number; cached: number; output: number }) => void;
}): Promise<AssistantRunResult> {
  const { client, ctx, emit } = opts;
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: buildAssistantSystemPrompt({ locale: ctx.locale, todayIso: ctx.todayIso, pagePath: opts.pagePath }) },
    ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
  ];
  const usage = { input: 0, cached: 0, output: 0 };
  const toolsUsed: string[] = [];
  const links: AssistantLink[] = [];
  const cards: AssistantCard[] = [];
  const gate = createSentenceGate();
  let emitted = false;
  // Analiz kartı dönecekse (özeti kart verir) sohbet metni EN FAZLA 1 cümle: ilk cümle gönderilir, kalanı atılır.
  let oneSentenceOnly = false;
  let sentenceDone = false;
  let pendingSentence = '';
  const send = (text: string) => {
    if (!text || sentenceDone) return;
    if (oneSentenceOnly) {
      pendingSentence += text;
      const m = /^([\s\S]*?[.!?…]+)(?=\s|$)/.exec(pendingSentence);
      if (!m) return;
      text = m[1].trimStart();
      sentenceDone = true;
    }
    emitted = true;
    emit({ type: 'delta', text });
  };

  let noMoreTools = false;
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const stream = await client.chat.completions.create(
      {
        model: ASSISTANT_OPENAI_MODEL,
        ...openAiNoReasoningParams(ASSISTANT_OPENAI_MODEL, 0.3),
        max_completion_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
        messages,
        tools: openAiToolDefinitions(),
        // Tur hakkı bittiyse model eldeki veriyle yanıtlar.
        tool_choice: round === MAX_TOOL_ROUNDS || noMoreTools ? 'none' : 'auto',
      },
      { signal: opts.signal },
    );

    const calls = new Map<number, ToolCall>();
    let content = '';
    for await (const chunk of stream) {
      if (chunk.usage) {
        usage.input += chunk.usage.prompt_tokens ?? 0;
        usage.cached += chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
        usage.output += chunk.usage.completion_tokens ?? 0;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      for (const tc of delta.tool_calls ?? []) {
        const cur = calls.get(tc.index) ?? { id: '', name: '', arguments: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.arguments += tc.function.arguments;
        calls.set(tc.index, cur);
      }
      if (delta.content) {
        content += delta.content;
        send(gate.push(delta.content));
        if (gate.blocked()) break;
      }
    }
    opts.onUsage?.({ ...usage });
    if (gate.blocked()) break;

    // Araç tavanı: tur başına ≤ MAX_TOOL_CALLS_PER_ROUND, mesaj başına ≤ MAX_TOOL_CALLS_PER_REQUEST; fazlası atılır.
    const allCalls = [...calls.values()].filter((c) => c.name);
    if (allCalls.length === 0) break;
    const toolCalls = allCalls.slice(0, Math.max(0, Math.min(MAX_TOOL_CALLS_PER_ROUND, MAX_TOOL_CALLS_PER_REQUEST - toolsUsed.length)));
    if (toolCalls.length === 0) {
      // Hak bitti: model araçsız yanıtlamaya zorlanır (araç çağrısı mesaja eklenmez).
      noMoreTools = true;
      continue;
    }
    if (toolsUsed.length + toolCalls.length >= MAX_TOOL_CALLS_PER_REQUEST) noMoreTools = true;

    messages.push({
      role: 'assistant',
      content: content || null,
      tool_calls: toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } })),
    });
    let fixedReply: string | null = null;
    for (const call of toolCalls) {
      if (opts.signal?.aborted) throw abortError();
      toolsUsed.push(call.name);
      const result = await runAssistantTool(call.name, call.arguments, ctx);
      if (result.card) {
        cards.push(result.card);
        // Analiz ve puan durumu kartı içeriği kendisi verir: sohbet metni en fazla 1 cümle.
        if (result.card.type === 'analysis' || result.card.type === 'standings') oneSentenceOnly = true;
      }
      if (result.links) links.push(...result.links);
      if (result.reply) fixedReply = result.reply;
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.data) });
    }
    // Araç sabit yanıt verdiyse (ör. "Bu maç için analiz hazırlanmıyor") metin oradan gelir; modele dönülmez.
    if (fixedReply) {
      send(gate.push(`${fixedReply}\n`).trimEnd());
      break;
    }
  }

  send(gate.flush());
  if (oneSentenceOnly && !sentenceDone && pendingSentence.trim()) {
    sentenceDone = true;
    emitted = true;
    emit({ type: 'delta', text: pendingSentence.trim() });
  }
  if (!gate.blocked()) {
    const attachments = finalizeAttachments(cards, links);
    if (attachments.card) emit({ type: 'card', card: attachments.card });
    if (attachments.links.length) emit({ type: 'links', links: attachments.links });
  }
  return {
    outcome: gate.blocked() ? 'filtered' : emitted ? 'answered' : 'empty',
    tools: toolsUsed,
    usage,
    costMicroUsd: assistantCostMicroUsd(usage),
  };
}

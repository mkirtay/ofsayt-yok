/**
 * LLM API üzerinden maç trivia / fun-facts içeriği üretir.
 *
 * Provider seçimi aiAnalysisService ile aynı:
 * - OPENAI_API_KEY varsa OpenAI
 * - Aksi halde ANTHROPIC_API_KEY ile Anthropic
 *
 * Çıktı: { ertemFacts, contextual, rivalryContext }
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  TRIVIA_MODEL_VERSION,
  TRIVIA_SYSTEM_PROMPT,
  TRIVIA_RESPONSE_FORMAT,
  buildTriviaUserMessage,
  type TriviaJsonSchema,
} from '@/config/triviaPrompt';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { openAiNoReasoningParams } from '@/services/aiAnalysisService';

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
/**
 * Trivia modeli kodda sabit (2026-10-03): gpt-6-luna, reasoning `none`. `OPENAI_MODEL` trivia'yı ETKİLEMEZ
 * (yalnız video betiği); acil geri dönüş için `OPENAI_TRIVIA_MODEL`.
 */
export const TRIVIA_OPENAI_MODEL = process.env.OPENAI_TRIVIA_MODEL || 'gpt-6-luna';
/** v2 şeması kısa (3-5 madde + iki kısa paragraf). */
const MAX_TOKENS = 1200;
const TRIVIA_TIMEOUT_MS = 20_000;

export class TriviaTimeoutError extends Error {
  constructor() {
    super('Trivia üretimi zaman aşımına uğradı. Lütfen birkaç saniye bekleyip tekrar deneyin.');
    this.name = 'TriviaTimeoutError';
  }
}

type Provider = 'openai' | 'anthropic';

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  throw new Error('LLM key bulunamadı. OPENAI_API_KEY veya ANTHROPIC_API_KEY tanımlayın.');
}

function getAnthropicClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY environment değişkeni tanımlı değil');
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

function getOpenAiClient(): OpenAI {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY environment değişkeni tanımlı değil');
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

export type AiTriviaResult = {
  trivia: TriviaJsonSchema;
  modelVersion: string;
  tokensUsed: number;
  provider: Provider;
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Yanıtta geçerli JSON bulunamadı');
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    throw new Error(`JSON parse hatası: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}

/** v2: kadro/H2H verisi yoksa `contextual` / `rivalryContext` boş string olabilir (arayüz boşsa bölümü gizler). */
export function validateTriviaSchema(data: unknown): TriviaJsonSchema {
  if (!data || typeof data !== 'object') throw new Error('Trivia çıktısı obje değil');
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.ertemFacts) || d.ertemFacts.filter((f) => typeof f === 'string' && f.trim()).length === 0) {
    throw new Error('ertemFacts dizisi eksik veya boş');
  }
  if (typeof d.contextual !== 'string') throw new Error('contextual alanı eksik');
  if (typeof d.rivalryContext !== 'string') throw new Error('rivalryContext alanı eksik');
  return {
    ertemFacts: (d.ertemFacts as unknown[]).filter((f): f is string => typeof f === 'string' && f.trim().length > 0).slice(0, 5),
    contextual: d.contextual.trim(),
    rivalryContext: d.rivalryContext.trim(),
  };
}

export async function generateMatchTrivia(
  ctx: MatchAnalysisContext
): Promise<AiTriviaResult> {
  const userMessage = buildTriviaUserMessage(ctx);
  const provider = getProvider();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIVIA_TIMEOUT_MS);

  try {
    if (provider === 'openai') {
      const response = await getOpenAiClient().chat.completions.create(
        {
          model: TRIVIA_OPENAI_MODEL,
          ...openAiNoReasoningParams(TRIVIA_OPENAI_MODEL, 0.5),
          max_completion_tokens: MAX_TOKENS,
          response_format: TRIVIA_RESPONSE_FORMAT,
          messages: [
            { role: 'system', content: TRIVIA_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        },
        { signal: controller.signal }
      );

      const raw = response.choices?.[0]?.message?.content ?? '';
      if (!raw) throw new Error('OpenAI yanıtında metin bulunamadı');

      const validated = validateTriviaSchema(extractJson(raw));
      return {
        trivia: validated,
        modelVersion: `${TRIVIA_MODEL_VERSION}-openai:${TRIVIA_OPENAI_MODEL}`,
        tokensUsed:
          (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0),
        provider,
      };
    }

    const response = await getAnthropicClient().messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: TRIVIA_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    );

    const textBlock = response.content.find(
      (c): c is Anthropic.TextBlock => c.type === 'text'
    );
    if (!textBlock) throw new Error('Anthropic yanıtında metin bloğu yok');

    const validated = validateTriviaSchema(extractJson(textBlock.text));
    return {
      trivia: validated,
      modelVersion: `${TRIVIA_MODEL_VERSION}-anthropic:${CLAUDE_MODEL}`,
      tokensUsed:
        (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      provider,
    };
  } catch (err) {
    if (
      controller.signal.aborted ||
      (err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'APIUserAbortError'))
    ) {
      throw new TriviaTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

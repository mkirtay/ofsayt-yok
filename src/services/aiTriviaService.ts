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
  buildTriviaUserMessage,
  type TriviaJsonSchema,
} from '@/config/triviaPrompt';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1';
const MAX_TOKENS = 2000;
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

function validateSchema(data: unknown): TriviaJsonSchema {
  if (!data || typeof data !== 'object') throw new Error('Trivia çıktısı obje değil');
  const d = data as Record<string, unknown>;

  if (!Array.isArray(d.ertemFacts) || d.ertemFacts.length === 0) {
    throw new Error('ertemFacts dizisi eksik veya boş');
  }
  if (typeof d.contextual !== 'string' || d.contextual.trim().length === 0) {
    throw new Error('contextual alanı eksik veya boş');
  }
  if (typeof d.rivalryContext !== 'string' || d.rivalryContext.trim().length === 0) {
    throw new Error('rivalryContext alanı eksik veya boş');
  }
  return data as TriviaJsonSchema;
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
          model: OPENAI_MODEL,
          temperature: 0.75,
          max_completion_tokens: MAX_TOKENS,
          messages: [
            { role: 'system', content: TRIVIA_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        },
        { signal: controller.signal }
      );

      const raw = response.choices?.[0]?.message?.content ?? '';
      if (!raw) throw new Error('OpenAI yanıtında metin bulunamadı');

      const validated = validateSchema(extractJson(raw));
      return {
        trivia: validated,
        modelVersion: `${TRIVIA_MODEL_VERSION}-openai:${OPENAI_MODEL}`,
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

    const validated = validateSchema(extractJson(textBlock.text));
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

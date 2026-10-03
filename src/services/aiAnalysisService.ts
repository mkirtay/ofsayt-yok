/**
 * LLM API uzerinden mac analizi uretir.
 *
 * Provider secimi:
 * - OPENAI_API_KEY varsa OpenAI kullanilir
 * - Aksi halde ANTHROPIC_API_KEY varsa Anthropic kullanilir
 *
 * Yapilandirilmis JSON cikti garantisi icin:
 * - System prompt'ta JSON disinda cikti yasaklanir
 * - Yanitin JSON kismi cikarilir (markdown wrap'a karsi tolerans)
 * - Sema dogrulamasi yapilir; eksik alan varsa hata atilir
 */
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  ANALYSIS_MODEL_VERSION,
  ANALYSIS_SYSTEM_PROMPT,
  buildAnalysisUserMessage,
  type AnalysisJsonSchema,
} from '@/config/analysisPrompt';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import { ANALYSIS_RESPONSE_FORMAT } from '@/config/analysisJsonSchema';
import { isAnalysisScenario } from '@/utils/analysisScenarios';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { captureError } from '@/lib/logger';

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5-20250929';
/**
 * Analiz modeli kodda sabit (2026-10-03 kararı, kör test + süre ölçümü): gpt-6-luna, reasoning `none`.
 * `OPENAI_MODEL` analizi ETKİLEMEZ (trivia ve video betiği onu kullanmaya devam eder); yalnız acil geri dönüş
 * için `OPENAI_ANALYSIS_MODEL` (ör. `gpt-4.1`).
 */
export const ANALYSIS_OPENAI_MODEL = process.env.OPENAI_ANALYSIS_MODEL || 'gpt-6-luna';
/** v5 şeması kısa: ölçülen çıktı ~1.500-2.000 token; kesilmeye karşı pay bırakıldı (eski 5000). */
const MAX_TOKENS = 3000;

/** `reasoning_effort: 'none'` yalnız destekleyen modellere gider (gpt-4.1 reasoning modeli değil, Sol `none`'ı reddeder). */
const NO_REASONING_MODELS = /^gpt-(6|5\.6)-luna\b/;
export function openAiAnalysisParams(model: string): { temperature: number; reasoning_effort?: 'none' } {
  return NO_REASONING_MODELS.test(model) ? { temperature: 0.35, reasoning_effort: 'none' } : { temperature: 0.35 };
}
const ANALYSIS_TIMEOUT_MS = 35_000;

export class AnalysisTimeoutError extends Error {
  constructor() {
    super('Analiz zaman aşımına uğradı. Lütfen birkaç saniye bekleyip tekrar deneyin.');
    this.name = 'AnalysisTimeoutError';
  }
}

type Provider = 'openai' | 'anthropic';

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

function getProvider(): Provider {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  throw new Error(
    'LLM key bulunamadi. OPENAI_API_KEY veya ANTHROPIC_API_KEY tanimlayin.'
  );
}

function getAnthropicClient(): Anthropic {
  if (anthropicClient) return anthropicClient;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment degiskeni tanimli degil');
  }
  anthropicClient = new Anthropic({ apiKey });
  return anthropicClient;
}

function getOpenAiClient(): OpenAI {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment degiskeni tanimli degil');
  }
  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

export type AiAnalysisResult = {
  analysis: AnalysisJsonSchema;
  modelVersion: string;
  tokensUsed: number;
  rawResponse: string;
  provider: Provider;
};

/**
 * Yanıt metninden JSON nesnesini ayrıştırır.
 * Modelin yanlışlıkla ```json ... ``` veya açıklayıcı önek
 * eklemesine karşı toleranslıdır.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // ```json ... ``` veya ``` ... ``` sarmalını sök
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  // İlk { ile son } arasını al (önce/sonra metin varsa)
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Yanıtta geçerli JSON bulunamadı');
  }
  const jsonStr = candidate.slice(start, end + 1);
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `JSON parse hatası: ${err instanceof Error ? err.message : 'unknown'}`
    );
  }
}

export function validateSchema(data: unknown): AnalysisJsonSchema {
  if (!data || typeof data !== 'object') {
    throw new Error('Analiz çıktısı obje değil');
  }
  const d = data as Record<string, unknown>;
  const required = [
    'matchSummary',
    'matchPrediction',
    'teamAnalyses',
    'tacticalAnalysis',
    'heatmapAnalysis',
    'scorePrediction',
    'goalExpectation',
    'scenarios',
    'riskLevel',
    'riskFactors',
    'analystComment',
    'overallConfidence',
  ];
  for (const key of required) {
    if (!(key in d)) {
      throw new Error(`Analiz çıktısında eksik alan: ${key}`);
    }
  }
  const teams = d.teamAnalyses as Record<string, unknown>;
  if (!teams.home || !teams.away) {
    throw new Error('teamAnalyses.home veya .away eksik');
  }
  const homeTeam = teams.home as Record<string, unknown>;
  const awayTeam = teams.away as Record<string, unknown>;
  if (typeof homeTeam.narrative !== 'string' || typeof awayTeam.narrative !== 'string') {
    throw new Error('Takım narrative alanları eksik veya geçersiz');
  }
  const tactical = d.tacticalAnalysis as Record<string, unknown>;
  if (!tactical.home || !tactical.away) {
    throw new Error('tacticalAnalysis.home veya .away eksik');
  }
  // Tek bozuk senaryo bütün analizi (ve krediyi) yakmasın: geçersiz maddeler atılır.
  d.scenarios = Array.isArray(d.scenarios) ? d.scenarios.filter(isAnalysisScenario) : [];
  // Bahis dili yasak (prompt kural 8); yine de geçerse kayda düşer — analiz engellenmez.
  const terms = findGamblingTerms(JSON.stringify(data));
  if (terms.length > 0) captureError('analysis-gambling-terms', new Error(`AI çıktısında bahis dili: ${terms.join(', ')}`));
  return data as AnalysisJsonSchema;
}

export async function generateMatchAnalysis(
  ctx: MatchAnalysisContext
): Promise<AiAnalysisResult> {
  const userMessage = buildAnalysisUserMessage(ctx);
  const provider = getProvider();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    if (provider === 'openai') {
      const response = await getOpenAiClient().chat.completions.create(
        {
          model: ANALYSIS_OPENAI_MODEL,
          ...openAiAnalysisParams(ANALYSIS_OPENAI_MODEL),
          max_completion_tokens: MAX_TOKENS,
          response_format: ANALYSIS_RESPONSE_FORMAT,
          messages: [
            { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
        },
        { signal: controller.signal }
      );

      const raw = response.choices?.[0]?.message?.content ?? '';
      if (!raw) {
        throw new Error('OpenAI yanitinda metin bulunamadi');
      }

      const parsed = extractJson(raw);
      const validated = validateSchema(parsed);

      return {
        analysis: validated,
        modelVersion: `${ANALYSIS_MODEL_VERSION}-openai:${ANALYSIS_OPENAI_MODEL}`,
        tokensUsed:
          (response.usage?.prompt_tokens ?? 0) +
          (response.usage?.completion_tokens ?? 0),
        rawResponse: raw,
        provider,
      };
    }

    const response = await getAnthropicClient().messages.create(
      {
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal }
    );

    const textBlock = response.content.find(
      (c): c is Anthropic.TextBlock => c.type === 'text'
    );
    if (!textBlock) {
      throw new Error('Anthropic yanitinda metin blogu yok');
    }
    const raw = textBlock.text;
    const parsed = extractJson(raw);
    const validated = validateSchema(parsed);

    return {
      analysis: validated,
      modelVersion: `${ANALYSIS_MODEL_VERSION}-anthropic:${CLAUDE_MODEL}`,
      tokensUsed:
        (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      rawResponse: raw,
      provider,
    };
  } catch (err) {
    if (
      controller.signal.aborted ||
      (err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'APIUserAbortError'))
    ) {
      throw new AnalysisTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

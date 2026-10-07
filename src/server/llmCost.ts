/**
 * LLM maliyet tahmini (mikro-USD). Bütçe sigortası için: fiyatlar yaklaşık, güncellenebilir.
 * Bilinmeyen model için muhafazakâr (yüksek) fiyat — bütçe hesabı eksik kalmasın.
 */
export type LlmUsage = { input: number; cached?: number; output: number };

/** USD / 1M token: girdi, önbellekli girdi, çıktı (2026-10). */
const PRICE_PER_MTOK: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-sol': { input: 2, cached: 0.5, output: 10 },
  'gpt-4.1': { input: 2, cached: 0.5, output: 8 },
};
const UNKNOWN_PRICE = { input: 2, cached: 0.5, output: 10 };

export function llmPrice(model: string): { input: number; cached: number; output: number } {
  const key = Object.keys(PRICE_PER_MTOK).find((m) => model === m || model.startsWith(`${m}-`));
  return key ? PRICE_PER_MTOK[key]! : UNKNOWN_PRICE;
}

export function llmCostMicroUsd(model: string, u: LlmUsage): number {
  const p = llmPrice(model);
  const cached = Math.min(u.cached ?? 0, u.input);
  return Math.ceil((u.input - cached) * p.input + cached * p.cached + u.output * p.output);
}

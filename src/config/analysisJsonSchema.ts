/**
 * AI maç analizi çıktısının katı JSON şeması (OpenAI structured outputs, `strict: true`) — prompt v5 şemasının
 * (analysisPrompt.ts OUTPUT_SCHEMA_DESCRIPTION) makine karşılığı. `json_object` modu yalnız geçerli JSON'u garanti
 * ediyordu; Luna bir ölçümde JSON'u `heatmapAnalysis`'ten sonra kapattı (8 çağrıda 1). Katı şema bütün alanları
 * zorunlu kılar. Uzunluk sınırları prompt metninde; burada yalnız yapı.
 *
 * Strict mod kuralı: her nesnede `additionalProperties: false` ve bütün alanlar `required`.
 */
type JsonSchema = Record<string, unknown>;

const str: JsonSchema = { type: 'string' };
const pct: JsonSchema = { type: 'integer' };
const level = (values: string[]): JsonSchema => ({ type: 'string', enum: values });

function obj(properties: Record<string, JsonSchema>): JsonSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const team = obj({
  narrative: str,
  keyFactors: { type: 'array', items: str },
  formSummary: str,
  firstHalfNote: str,
  secondHalfNote: str,
});

const tactical = obj({
  formation: str,
  pressLevel: str,
  transitionStrength: str,
  setPieceThreat: str,
  wingUsage: str,
  defensiveWeakness: str,
});

const grid: JsonSchema = { type: 'array', items: { type: 'integer' } };

export const ANALYSIS_JSON_SCHEMA: JsonSchema = obj({
  matchSummary: obj({ tempo: str, dominantSide: str, balanceType: str, homeAwayImpact: str }),
  teamAnalyses: obj({ home: team, away: team }),
  tacticalAnalysis: obj({ home: tactical, away: tactical, keyBattleZones: str }),
  heatmapAnalysis: obj({ homeZones: str, awayZones: str, narrative: str, zoneGrid: obj({ home: grid, away: grid }) }),
  matchPrediction: obj({ home: pct, draw: pct, away: pct, reasoning: str }),
  scorePrediction: obj({ mostLikely: str }),
  goalExpectation: obj({
    over15: pct,
    over25: pct,
    over35: pct,
    btts: pct,
    htOver05: pct,
    htOver15: pct,
    homeToScore: pct,
    awayToScore: pct,
    bttsFirstHalf: pct,
    reasoning: str,
  }),
  scenarios: {
    type: 'array',
    items: obj({ metric: str, probability: pct, confidence: level(['low', 'medium', 'high']), reasoning: str }),
  },
  riskLevel: level(['low', 'medium', 'high']),
  riskReasoning: str,
  riskFactors: { type: 'array', items: str },
  analystComment: str,
  overallConfidence: pct,
});

/** OpenAI `response_format` değeri. */
export const ANALYSIS_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: { name: 'match_analysis', strict: true, schema: ANALYSIS_JSON_SCHEMA },
};

/**
 * AI analizinin "Olasılık Senaryoları" bölümü. Eskiden "Bahis / İddia Pazarı Analizi" (`bettingTips`: market,
 * pick, valueBet, avoid) idi; AdSense kumar politikası için istatistik diline çekildi.
 *
 * Depolama: DB'de aynı `MatchAnalysis.bettingTips` Json sütunu (migration yok). Yeni kayıtlar senaryo biçiminde
 * (`metric` + `probability`), eskiler bahis biçiminde — biçimden ayırt edilir; eski maddeler hiç gösterilmez/dönmez.
 */
import { sanitizeLegacyAnalysis } from './analysisSanitize';

export type ScenarioConfidence = 'low' | 'medium' | 'high';

export type AnalysisScenario = {
  /** İstatistik dilinde olay: "2+ gol", "İki takım da gol atar", "Ev sahibi kazanır"… */
  metric: string;
  /** 0–100 */
  probability: number;
  confidence: ScenarioConfidence;
  reasoning: string;
};

const CONFIDENCES: readonly ScenarioConfidence[] = ['low', 'medium', 'high'];

export function isAnalysisScenario(v: unknown): v is AnalysisScenario {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.metric === 'string' &&
    s.metric.trim() !== '' &&
    typeof s.probability === 'number' &&
    Number.isFinite(s.probability) &&
    s.probability >= 0 &&
    s.probability <= 100 &&
    CONFIDENCES.includes(s.confidence as ScenarioConfidence) &&
    typeof s.reasoning === 'string'
  );
}

/** Saklı sütundan yalnız senaryo biçimindeki maddeler (eski bahis maddeleri → boş). */
export function scenariosFromStored(stored: unknown): AnalysisScenario[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter(isAnalysisScenario).map((s) => ({ ...s, probability: Math.round(s.probability) }));
}

/**
 * API yanıtı: satır + `scenarios`; `bettingTips` her zaman boş dizi (eski istemciler alanı bekliyorsa kırılmasın,
 * bahis maddeleri dışarı çıkmasın). Eski sürüm analizlerin serbest metinlerinde bahis dili geçen cümleler çıkarılır
 * (bkz. analysisSanitize.ts; DB'ye yazılmaz).
 */
export function toPublicAnalysis<T extends { bettingTips?: unknown; modelVersion?: string | null }>(
  row: T,
): Omit<T, 'bettingTips'> & { bettingTips: never[]; scenarios: AnalysisScenario[] } {
  return { ...sanitizeLegacyAnalysis(row), bettingTips: [], scenarios: scenariosFromStored(row.bettingTips) };
}

/**
 * GELİŞTİRME-ÖZEL test verisi: AI analizi henüz üretilmeyen maçlar (milli) için, yerelde bir JSON dosyasından analiz olasılıkları.
 * YALNIZ `NODE_ENV !== 'production'` VE `COMBO_TEST_ANALYSES_FILE` tanımlıyken okunur; production yolunda dosya sistemine HİÇ dokunulmaz
 * (comboTestAnalyses.test.ts kanıtlar). Dosya DB'ye yazılmaz; adaylar arayüzde "Test verisi" etiketiyle gelir.
 */
import { readFile } from 'node:fs/promises';

export type TestAnalysis = {
  /** Uygulama maç kimliği (milli: AF id + 2e9), metin. */
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  competitionName?: string;
  kickoffIso?: string;
  modelVersion?: string;
  source?: string;
  contextGaps?: unknown;
  matchPrediction: { home?: unknown; draw?: unknown; away?: unknown };
  goalExpectation: Record<string, unknown>;
};

type Env = Record<string, string | undefined>;

/** Test dosyasının yolu; production ya da env yoksa null. */
export function comboTestAnalysesPath(env: Env = process.env): string | null {
  if (env.NODE_ENV === 'production') return null;
  const p = env.COMBO_TEST_ANALYSES_FILE?.trim();
  return p ? p : null;
}

function isValid(x: unknown): x is TestAnalysis {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.matchId === 'string' && typeof o.homeTeamName === 'string' && typeof o.awayTeamName === 'string' && !!o.matchPrediction && !!o.goalExpectation;
}

export async function loadTestAnalyses(env: Env = process.env, read: (p: string) => Promise<string> = (p) => readFile(p, 'utf8')): Promise<TestAnalysis[]> {
  const path = comboTestAnalysesPath(env);
  if (!path) return [];
  try {
    const parsed: unknown = JSON.parse(await read(path));
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

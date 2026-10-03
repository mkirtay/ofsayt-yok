/**
 * AI analizinin ÜCRETSİZ önizlemesi (kredi modeli v2) — herkese (girişsiz, botlar dahil) gösterilen tek parça:
 * kısa özet (maç özetinin tempo + baskın taraf maddelerinin ilk cümlesi) ve ana olasılık ("Ev sahibi kazanır %58").
 * Kilitli bölümlerin (olasılık senaryoları, skor tahmini, takım analizleri, eksik oyuncu yorumu, analist yorumu)
 * hiçbir alanı bu nesneye girmez — önizleme yanıtları ve SSR HTML'i yalnız bunu taşır.
 */
import { sanitizeLegacyAnalysis, splitSentences } from '@/utils/analysisSanitize';

export type PreviewOutcome = 'HOME' | 'DRAW' | 'AWAY';

export type AnalysisPreview = {
  homeTeamName: string;
  awayTeamName: string;
  /** En çok 2 kısa madde (cümle). */
  summary: string[];
  top: { outcome: PreviewOutcome; pct: number } | null;
};

const SUMMARY_MAX_CHARS = 180;

type PreviewSource = {
  homeTeamName: string;
  awayTeamName: string;
  modelVersion?: string | null;
  matchPrediction: unknown;
  fullReport?: unknown;
};

function firstSentence(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const s = splitSentences(value.trim())[0] ?? value.trim();
  if (s.length <= SUMMARY_MAX_CHARS) return s;
  return `${s.slice(0, SUMMARY_MAX_CHARS - 1).replace(/\s+\S*$/, '')}…`;
}

function topOutcome(prediction: unknown): AnalysisPreview['top'] {
  const p = prediction as { home?: unknown; draw?: unknown; away?: unknown } | null;
  const vals: [PreviewOutcome, number][] = [
    ['HOME', Number(p?.home)],
    ['DRAW', Number(p?.draw)],
    ['AWAY', Number(p?.away)],
  ];
  if (!vals.every(([, v]) => Number.isFinite(v))) return null;
  // Eşitlikte ev > beraberlik > deplasman (arayüzdeki "kazanan" sırası).
  const [outcome, pct] = vals.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
  return { outcome, pct: Math.round(pct) };
}

export function buildAnalysisPreview(row: PreviewSource): AnalysisPreview {
  const clean = sanitizeLegacyAnalysis(row);
  const summary = (clean.fullReport as { matchSummary?: Record<string, unknown> } | null | undefined)?.matchSummary;
  const items = [firstSentence(summary?.tempo), firstSentence(summary?.dominantSide)].filter((s): s is string => Boolean(s));
  return {
    homeTeamName: row.homeTeamName,
    awayTeamName: row.awayTeamName,
    summary: items,
    top: topOutcome(clean.matchPrediction),
  };
}

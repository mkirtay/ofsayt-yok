/**
 * Maç sayfası SSR'ı için AI analizi ücretsiz önizlemesi (kredi modeli v2): tek indeksli sorgu (MatchAnalysis matchId +
 * PRE). Yalnız önizleme alanları döner — kilitli içerik HTML'e hiç girmez. Hata → null (sayfa yine çizilir).
 */
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { buildAnalysisPreview, type AnalysisPreview } from '@/utils/analysisPreview';
import { captureError } from '@/lib/logger';
import { sanitizeLegacyAnalysis } from '@/utils/analysisSanitize';
import { pickTopPredictions } from '@/utils/analysisTopPicks';

export async function loadAnalysisPreviewForPage(matchId: string): Promise<AnalysisPreview | null> {
  try {
    const analysis = await findStoredMatchAnalysis(matchId, 'PRE');
    return analysis ? buildAnalysisPreview(analysis) : null;
  } catch (e) {
    captureError('match-page-analysis-preview', e);
    return null;
  }
}

/** Biten maçın (analiz ücretsiz açık) HTML'e giren kalıcı özeti: maç öncesi değerlendirme cümleleri + en güçlü 3 tahmin. */
export type PostMatchAnalysisText = { sentences: string[]; picks: { key: string; pct: number }[] };

/**
 * SEO/GEO raporu (2026-11-16): maç bitince herkese açılan AI analizi sayfanın kalıcı, özgün metni olarak SSR HTML'de.
 * Yalnız `FINISHED` maçta çağrılır (o anda analiz zaten ücretsiz — api/matches/[id]/analysis `access: 'free'`).
 */
export async function loadPostMatchAnalysisForPage(matchId: string): Promise<PostMatchAnalysisText | null> {
  try {
    const row = await findStoredMatchAnalysis(matchId, 'PRE');
    if (!row) return null;
    const clean = sanitizeLegacyAnalysis(row);
    const report = (clean.fullReport ?? {}) as { matchSummary?: Record<string, unknown>; analystComment?: unknown };
    const ms = report.matchSummary ?? {};
    const sentences = [ms.tempo, ms.dominantSide, ms.homeAwayImpact, report.analystComment]
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim())
      .slice(0, 4);
    const picks = pickTopPredictions(clean as unknown as Parameters<typeof pickTopPredictions>[0]);
    if (!sentences.length && !picks.length) return null;
    return { sentences, picks };
  } catch (e) {
    captureError('match-page-post-analysis', e);
    return null;
  }
}

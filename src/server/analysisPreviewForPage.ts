/**
 * Maç sayfası SSR'ı için AI analizi ücretsiz önizlemesi (kredi modeli v2): tek indeksli sorgu (MatchAnalysis matchId +
 * PRE). Yalnız önizleme alanları döner — kilitli içerik HTML'e hiç girmez. Hata → null (sayfa yine çizilir).
 */
import { findStoredMatchAnalysis } from '@/lib/matchAnalysisLookup';
import { buildAnalysisPreview, type AnalysisPreview } from '@/utils/analysisPreview';
import { captureError } from '@/lib/logger';

export async function loadAnalysisPreviewForPage(matchId: string): Promise<AnalysisPreview | null> {
  try {
    const analysis = await findStoredMatchAnalysis(matchId, 'PRE');
    return analysis ? buildAnalysisPreview(analysis) : null;
  } catch (e) {
    captureError('match-page-analysis-preview', e);
    return null;
  }
}

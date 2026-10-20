/**
 * /ai-istatistikleri — ana analizin dil kurallarıyla uyum: skor öngörüsü yok, bahis terimi yok (TR/EN).
 * Sayfa testleri `src/pages` dışında durur (bkz. comparePage.i18n.test.tsx).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trAi from '../../../public/locales/tr/ai.json';
import enAi from '../../../public/locales/en/ai.json';
import trMatch from '../../../public/locales/tr/match.json';
import enMatch from '../../../public/locales/en/match.json';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import type { AiStatsDashboard } from '@/lib/loadAiStatsDashboard';

const dict = vi.hoisted(() => ({ current: {} as Record<string, string> }));

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const v = dict.current[key] ?? (typeof opts?.defaultValue === 'string' ? opts.defaultValue : key);
      return opts ? v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? '')) : v;
    },
  }),
}));
vi.mock('@/lib/i18nNamespaces/ai', () => ({}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: () => {} }) }));

const data: AiStatsDashboard & { isAdmin: boolean } = {
  totalRecords: 3,
  totalEvaluated: 2,
  pendingCount: 1,
  topPicks: { matches: 2, picks: 6, hits: 5, rate: 83.3 },
  isAdmin: false,
  history: [
    { matchId: '1', homeTeamName: 'Trabzonspor', awayTeamName: 'Galatasaray', actualResult: 'HOME', evaluatedAt: '2026-09-20T00:00:00Z', createdAt: '2026-09-19T00:00:00Z', topPicks: [{ key: 'over15', pct: 80, hit: true }, { key: 'homeToScore', pct: 75, hit: true }, { key: 'away', pct: 45, hit: false }] },
    { matchId: '2', homeTeamName: 'Arsenal', awayTeamName: 'Leeds United', actualResult: 'HOME', evaluatedAt: '2026-10-10T00:00:00Z', createdAt: '2026-10-03T00:00:00Z', topPicks: [{ key: 'homeToScore', pct: 88, hit: true }, { key: 'over15', pct: 82, hit: true }, { key: 'home', pct: 63, hit: true }] },
  ],
};
vi.mock('@/hooks/useAiStatsDashboard', () => ({
  aiStatsDashboardQueryKey: ['ai-stats-dashboard'],
  useAiStatsDashboard: () => ({ data, isLoading: false, isError: false, refetch: () => {} }),
}));

import AiIstatistikleri from '@/pages/ai-istatistikleri';

/** Sayfa `match` ad alanındaki rozet adlarını da kullanır (analysis.pick.*). */
const withPicks = (d: Record<string, string>, m: { analysis: { pick: Record<string, string> } }) => ({
  ...d,
  ...Object.fromEntries(Object.entries(m.analysis.pick).map(([k, v]) => [`analysis.pick.${k}`, v])),
});

const render = (d: Record<string, string>) => {
  dict.current = withPicks(d, d === (enAi as Record<string, string>) ? enMatch : trMatch);
  return renderToStaticMarkup(<AiIstatistikleri />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};

describe('/ai-istatistikleri — dil kuralları', () => {
  it('TR: skor öngörüsü ve maç sonucu isabeti yok; en güçlü 3 tahmin; bahis terimi yok', () => {
    const t = render(trAi);
    for (const gone of ['Skor', 'Tam Skor', 'Gerçek Skor', 'Maç Sonucu İsabeti', 'En Olası Sonuç', 'Tahmin Sonucu']) expect(t).not.toContain(gone);
    for (const label of ['AI Analiz İsabet İstatistikleri', 'Maç Sonucu', 'Ev sahibi kazandı', 'Deplasman kazanır %45', 'Analiz Geçmişi', 'En Güçlü 3 Tahmin İsabeti', '83.3%', '5 / 6 tahmin doğru · 2 analiz', '2/3 doğru', '3/3 doğru', '2+ gol %80', 'Ev sahibi gol bulur %88']) {
      expect(t).toContain(label);
    }
    expect(findGamblingTerms(t)).toEqual([]);
    expect(findGamblingTerms(JSON.stringify(trAi))).toEqual([]);
  });

  it('EN: skor yok, bahis terimi yok', () => {
    const t = render(enAi);
    expect(t).not.toMatch(/Score/);
    expect(t).not.toContain('Most Likely Result');
    expect(t).toContain('Top 3 Picks Accuracy');
    expect(findGamblingTerms(t)).toEqual([]);
    expect(findGamblingTerms(JSON.stringify(enAi))).toEqual([]);
  });

  it('metin dosyalarında skor anahtarları kalmadı', () => {
    for (const d of [trAi, enAi] as Record<string, string>[]) {
      for (const k of ['scoreExact', 'scoreExactSub', 'colScorePrediction', 'colActualScore', 'colScoreHit']) expect(d[k]).toBeUndefined();
    }
  });

  it('admin bandı: son çalışma ve son iş ayrı; uyarı yalnız son çalışma 45 dk\'dan eskiyse ya da hiç yoksa', () => {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    data.isAdmin = true;
    data.cronStatus = {
      'evaluate-predictions': { lastRunAt: ago(5), lastWorkAt: ago(142), phase: 'done', ms: 1, ok: true, summary: {}, trigger: 'cron' },
      'analysis-pregenerate': { lastRunAt: ago(12), phase: 'done', ms: 1, ok: false, summary: {}, trigger: 'cron' },
    };
    let t = render(trAi);
    expect(t).toContain('Son çalışma: değerlendirme 5 dk önce · ön üretim 12 dk önce (hata)');
    expect(t).toContain('Son iş: değerlendirme 142 dk önce · ön üretim henüz yok');
    expect(t).not.toContain('45 dakikadan uzun'); // iş 142 dk önce ama tick taze → alarm yok
    data.cronStatus = {
      'evaluate-predictions': { lastRunAt: ago(50), ms: 1, ok: true, summary: {}, trigger: 'cron' },
      'analysis-pregenerate': { lastRunAt: ago(1), phase: 'started', ms: 0, ok: true, summary: {}, trigger: 'cron' },
    };
    t = render(trAi);
    expect(t).toContain('Son çalışma: değerlendirme 50 dk önce · ön üretim 1 dk önce (sürüyor)');
    expect(t).toContain('Zamanlanmış işler 45 dakikadan uzun süredir çalışmadı');
    data.cronStatus = { 'evaluate-predictions': { lastRunAt: ago(3), ms: 1, ok: true, summary: {}, trigger: 'cron' }, 'analysis-pregenerate': null };
    t = render(trAi);
    expect(t).toContain('ön üretim hiç çalışmadı');
    expect(t).toContain('45 dakikadan uzun');
    data.isAdmin = false;
    data.cronStatus = undefined;
    expect(render(trAi)).not.toContain('Son çalışma');
  });
});

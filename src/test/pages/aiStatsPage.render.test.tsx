/**
 * /ai-istatistikleri — ana analizin dil kurallarıyla uyum: skor öngörüsü yok, bahis terimi yok (TR/EN).
 * Sayfa testleri `src/pages` dışında durur (bkz. comparePage.i18n.test.tsx).
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trAi from '../../../public/locales/tr/ai.json';
import enAi from '../../../public/locales/en/ai.json';
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
  result1x2HitCount: 1,
  result1x2HitRate: 50,
  byPhase: [{ phase: 'PRE', total: 3, evaluated: 2, pending: 1, result1x2HitCount: 1, result1x2HitRate: 50 }],
  isAdmin: false,
  history: [
    { matchId: '1', homeTeamName: 'Trabzonspor', awayTeamName: 'Galatasaray', phase: 'PRE', predictedHomePct: 30, predictedDrawPct: 25, predictedAwayPct: 45, actualResult: 'HOME', result1x2Hit: false, evaluatedAt: '2026-09-20T00:00:00Z', createdAt: '2026-09-19T00:00:00Z' },
    { matchId: '2', homeTeamName: 'Arsenal', awayTeamName: 'Leeds United', phase: 'PRE', predictedHomePct: 63, predictedDrawPct: 23, predictedAwayPct: 14, actualResult: 'HOME', result1x2Hit: true, evaluatedAt: '2026-10-10T00:00:00Z', createdAt: '2026-10-03T00:00:00Z' },
  ],
};
vi.mock('@/hooks/useAiStatsDashboard', () => ({
  aiStatsDashboardQueryKey: ['ai-stats-dashboard'],
  useAiStatsDashboard: () => ({ data, isLoading: false, isError: false, refetch: () => {} }),
}));

import AiIstatistikleri from '@/pages/ai-istatistikleri';

const render = (d: Record<string, string>) => {
  dict.current = d;
  return renderToStaticMarkup(<AiIstatistikleri />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
};

describe('/ai-istatistikleri — dil kuralları', () => {
  it('TR: skor öngörüsü (sütun, kart, faz satırı) yok; analiz terimleri; bahis terimi yok', () => {
    const t = render(trAi);
    for (const gone of ['Skor', 'Tam Skor', 'Gerçek Skor']) expect(t).not.toContain(gone);
    for (const label of ['AI Analiz İsabet İstatistikleri', 'Maç Sonucu İsabeti', 'En Olası Sonuç', 'Maç Sonucu', 'Tahmin Sonucu', 'Deplasman kazanır (45%)', 'Ev sahibi kazandı', 'Doğru', 'Yanlış', 'Analiz Geçmişi']) {
      expect(t).toContain(label);
    }
    expect(findGamblingTerms(t)).toEqual([]);
    expect(findGamblingTerms(JSON.stringify(trAi))).toEqual([]);
  });

  it('EN: skor yok, bahis terimi yok', () => {
    const t = render(enAi);
    expect(t).not.toMatch(/Score/);
    expect(t).toContain('Most Likely Result');
    expect(findGamblingTerms(t)).toEqual([]);
    expect(findGamblingTerms(JSON.stringify(enAi))).toEqual([]);
  });

  it('metin dosyalarında skor anahtarları kalmadı', () => {
    for (const d of [trAi, enAi] as Record<string, string>[]) {
      for (const k of ['scoreExact', 'scoreExactSub', 'colScorePrediction', 'colActualScore', 'colScoreHit']) expect(d[k]).toBeUndefined();
    }
  });

  it('admin bandı: son değerlendirme / ön üretim; 45 dk\'dan eskiyse ya da hiç yoksa kırmızı uyarı', () => {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    data.isAdmin = true;
    data.cronStatus = {
      'evaluate-predictions': { lastRunAt: ago(5), ms: 1, ok: true, summary: {}, trigger: 'cron' },
      'analysis-pregenerate': { lastRunAt: ago(12), ms: 1, ok: false, summary: {}, trigger: 'cron' },
    };
    let t = render(trAi);
    expect(t).toContain('Son değerlendirme: 5 dk önce · Son ön üretim: 12 dk önce (hata)');
    expect(t).not.toContain('45 dakikadan uzun');
    data.cronStatus = { 'evaluate-predictions': { lastRunAt: ago(50), ms: 1, ok: true, summary: {}, trigger: 'cron' }, 'analysis-pregenerate': null };
    t = render(trAi);
    expect(t).toContain('Son değerlendirme: 50 dk önce · Son ön üretim: hiç çalışmadı');
    expect(t).toContain('Zamanlanmış işler 45 dakikadan uzun süredir çalışmadı');
    data.isAdmin = false;
    data.cronStatus = undefined;
    expect(render(trAi)).not.toContain('Son değerlendirme');
  });
});

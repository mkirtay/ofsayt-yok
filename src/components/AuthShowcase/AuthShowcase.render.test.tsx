import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trAuth from '../../../public/locales/tr/auth.json';
import enAuth from '../../../public/locales/en/auth.json';
import sample from '@/content/pricingSampleAnalysis.json';
import { SIGNUP_BONUS_CREDITS } from '@/lib/credits';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { AUTH_SAMPLE } from './sample';

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], trAuth);
      if (typeof v !== 'string') return key;
      return v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(vars?.[k] ?? ''));
    },
  }),
}));

import AuthShowcase from './index';

describe('AuthShowcase', () => {
  it('örnek maç değerleri pricingSampleAnalysis.json ile aynı (tahmin, skor, tuttu)', () => {
    const a = sample.analysis;
    expect(a.homeTeamName).toContain(AUTH_SAMPLE.home.name);
    expect(a.awayTeamName).toContain(AUTH_SAMPLE.away.name);
    expect(sample.meta.kickoffDate).toBe(AUTH_SAMPLE.kickoffDate);
    expect(sample.meta.competition).toBe(AUTH_SAMPLE.competition);
    expect([sample.meta.homeScore, sample.meta.awayScore]).toEqual([AUTH_SAMPLE.score.home, AUTH_SAMPLE.score.away]);
    expect(a.matchPrediction.home).toBe(AUTH_SAMPLE.prediction.home);
    expect(a.matchPrediction.draw).toBe(AUTH_SAMPLE.prediction.draw);
    expect(a.matchPrediction.away).toBe(AUTH_SAMPLE.prediction.away);
    expect(a.scorePrediction.mostLikely).toBe(AUTH_SAMPLE.prediction.mostLikely);
    expect(sample.predictionRecord.result1x2Hit).toBe(AUTH_SAMPLE.resultHit);
    expect(sample.predictionRecord.scoreExactHit).toBe(AUTH_SAMPLE.scoreHit);
    // Analiz maçtan önce yazıldı (değerlendirmeden önce).
    expect(Date.parse(a.createdAt)).toBeLessThan(Date.parse(sample.predictionRecord.evaluatedAt));
  });

  it('hoş geldin kredisi metni SIGNUP_BONUS_CREDITS ile aynı; iki dilde aynı anahtarlar; bahis dili yok', () => {
    expect(trAuth.showcase.perkCredits).toContain(String(SIGNUP_BONUS_CREDITS));
    expect(enAuth.showcase.perkCredits).toContain(String(SIGNUP_BONUS_CREDITS));
    expect(Object.keys(enAuth.showcase).sort()).toEqual(Object.keys(trAuth.showcase).sort());
    for (const text of [...Object.values(trAuth.showcase), ...Object.values(enAuth.showcase)]) {
      expect(findGamblingTerms(text)).toEqual([]);
    }
  });

  it('başlıksız aside, oyun sahnesi / etkileşimli öğe yok; gerçek maç kartı (skor, yüzdeler, tuttu) + kazanımlar', () => {
    const html = renderToStaticMarkup(<AuthShowcase />);
    expect(html).toMatch(/^<aside [^>]*aria-label="Scor3"/);
    expect(html).not.toMatch(/<h[1-6]|<canvas|<button|<a /);
    expect(html).toContain('2–1');
    for (const p of ['%45', '%27', '%28']) expect(html).toContain(p);
    expect(html).toContain(trAuth.showcase.hit);
    for (const k of ['perkCredits', 'perkWeekly', 'perkPublic'] as const) expect(html).toContain(trAuth.showcase[k]);
  });
});

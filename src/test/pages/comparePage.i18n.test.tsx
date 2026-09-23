/**
 * Karşılaştırma sayfasının dil çıktısı. Bkz. `components/PlayerProfile/i18nEnglish.render.test.tsx`
 * — aynı yaklaşım.
 *
 * NEDEN SAYFANIN YANINDA DEĞİL: `next.config.ts`'te `pageExtensions` ayarlı değil, bu yüzden Pages
 * Router `src/pages` altındaki HER `.ts`/`.tsx` dosyasını bir route sayıp `default export` bekler
 * (`__tests__/` alt klasörü de dahil). Test dosyasının default export'u yok → `next build` kırılır.
 * Bu yüzden sayfa testleri `src/pages` DIŞINDA durur. Buraya geri taşımayın.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trCompare from '../../../public/locales/tr/compare.json';
import enCompare from '../../../public/locales/en/compare.json';

const locale = vi.hoisted(() => ({ value: 'tr' }));
const DICTS = vi.hoisted(() => ({ current: {} as Record<string, Record<string, unknown>> }));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: locale.value, setLocale: () => {} }),
  useTranslation: (ns: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      let cur: unknown = DICTS.current[ns] ?? {};
      for (const part of key.split('.')) {
        if (cur == null || typeof cur !== 'object') return key;
        cur = (cur as Record<string, unknown>)[part];
      }
      let value = typeof cur === 'string' ? cur : key;
      if (opts) value = value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? ''));
      return value;
    },
  }),
}));

vi.mock('next/router', () => ({
  useRouter: () => ({ query: { slug: '34-vs-88' }, asPath: '/compare/34-vs-88', isReady: true, push: () => {} }),
}));

vi.mock('@/components/CompareTeamPicker', () => ({ default: () => null }));

const payload = vi.hoisted(() => {
  const team = (id: number, name: string) => ({
    teamId: id,
    teamName: name,
    recentMatches: [
      { opponent: 'Trabzonspor', isHome: false, scoreText: '4-0', result: 'L' },
      { opponent: 'Kocaelispor', isHome: true, scoreText: '1-0', result: 'W' },
      { opponent: 'Göztepe', isHome: true, scoreText: '3-2', result: 'D' },
    ],
    topScorers: [{ playerId: 1, name: 'Victor Osimhen', goals: 6 }],
    metrics: {
      matchesAnalyzed: 10,
      goalsPerMatch: 2,
      goalsAgainstPerMatch: 1.86,
      cleanSheetRate: 0.29,
      bttsRate: 0.57,
      homeWinRate: 0.67,
      awayWinRate: 0.5,
      wins: 4,
      draws: 1,
      losses: 2,
    },
  });
  return {
    team1Id: 34,
    team2Id: 88,
    team1: team(34, 'Galatasaray'),
    team2: team(88, 'Fenerbahçe'),
    h2h: null,
    h2hRaw: null,
    h2hSummary: {
      total: 5,
      team1Wins: 3,
      draws: 2,
      team2Wins: 0,
      rows: [{ date: '2026-04-26', homeName: 'Galatasaray', awayName: 'Fenerbahçe', score: '3-0', team1IsHome: true, winner: 'team1' }],
    },
  };
});

vi.mock('@/hooks/useComparePage', () => ({
  useComparePage: () => ({ data: payload, isLoading: false, isError: false }),
}));

import ComparePage from '@/pages/compare/[slug]';

function render(lang: 'tr' | 'en'): string {
  locale.value = lang;
  DICTS.current = { compare: (lang === 'en' ? enCompare : trCompare) as Record<string, unknown> };
  return renderToStaticMarkup(<ComparePage />);
}

describe('<ComparePage /> — Türkçe (mevcut metin korunuyor)', () => {
  const html = render('tr');

  it('başlıklar ve tablo sütunları eskisi gibi', () => {
    for (const s of ['Karşılıklı Maçlar', 'Sezonun En Golcüleri', 'İstatistik Karşılaştırması', 'Rakip', 'Skor', 'S/D', 'Maç Başı Gol']) {
      expect(html, s).toContain(s);
    }
  });

  it('H2H cümlesi parçalardan doğru kuruluyor', () => {
    expect(html).toContain('Son 5 karşılaşmada:');
    expect(html).toContain('3 galibiyet');
    expect(html).toContain('2 beraberlik');
  });

  it('form rozetleri ve golcü satırı Türkçe', () => {
    expect(html).toContain('6 gol');
    expect(html).toContain('>G<');
  });
});

describe('<ComparePage /> — İngilizce', () => {
  const html = render('en');

  it('başlıklar ve tablo sütunları İngilizce', () => {
    for (const s of ['Head-to-Head', 'Top Scorers of the Season', 'Statistics Comparison', 'Opponent', 'Score', 'H/A', 'Goals per Match']) {
      expect(html, s).toContain(s);
    }
  });

  it('H2H cümlesi İngilizce kuruluyor', () => {
    expect(html).toContain('In the last 5 meetings:');
    expect(html).toContain('3 wins');
    expect(html).toContain('2 draws');
  });

  it('form rozetleri W/D/L ve golcü satırı İngilizce', () => {
    expect(html).toContain('6 goals');
    expect(html).toContain('>W<');
    expect(html).toContain('>L<');
  });

  it('hiçbir Türkçe kalıntı yok', () => {
    for (const bad of ['Karşılıklı', 'Golcüleri', 'Rakip', 'Skor', 'galibiyet', 'beraberlik', 'Maç Başı', 'Mağlubiyet', ' gol<']) {
      expect(html, bad).not.toContain(bad);
    }
  });
});

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// Alt bileşenler oturum/i18n/fetch'e bağlı — sekme yapısını izole test etmek için düz stub.
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) =>
      ({
        'insights.label': 'Maç içgörüleri',
        'insights.trivia': 'Trivia',
        'insights.analysis': 'Analiz',
        'insights.community': 'Topluluk',
        premiumBadge: 'Premium',
      })[k] ?? k,
  }),
}));
vi.mock('@/components/MatchTrivia', () => ({ default: () => <div data-testid="trivia-content" /> }));
vi.mock('@/components/MatchAnalysis', () => ({ default: () => <div data-testid="analysis-content" /> }));
vi.mock('@/components/MatchCommunity', () => ({
  default: ({ embedded }: { embedded?: boolean }) => <div data-testid="community-content" data-embedded={String(embedded)} />,
}));

import MatchInsightTabs, { DEFAULT_INSIGHT_TAB, INSIGHT_TABS } from './index';

describe('<MatchInsightTabs />', () => {
  const html = renderToStaticMarkup(<MatchInsightTabs matchId="1" match={null} />);
  const tabs = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);

  it('sıra Trivia | Analiz | Topluluk; tahmin ayrı sekme DEĞİL', () => {
    expect(INSIGHT_TABS.map((t) => t.key)).toEqual(['trivia', 'analysis', 'community']);
    expect(tabs).toHaveLength(3);
    expect(html.indexOf('>Trivia')).toBeLessThan(html.indexOf('>Analiz'));
    expect(html.indexOf('>Analiz')).toBeLessThan(html.indexOf('>Topluluk'));
  });

  it('varsayılan sekme Trivia: yalnızca o seçili ve paneli görünür, diğerleri hidden', () => {
    expect(DEFAULT_INSIGHT_TAB).toBe('trivia');
    expect(tabs[0]).toContain('aria-selected="true"');
    expect(tabs[1]).toContain('aria-selected="false"');
    expect(tabs[2]).toContain('aria-selected="false"');
    expect(panels[0]).not.toContain('hidden');
    expect(panels[1]).toContain('hidden');
    expect(panels[2]).toContain('hidden');
  });

  it('üç içerik de DOM\'da kalır (AI üretimi/yorum taslağı sekme değişince kaybolmasın)', () => {
    expect(html).toContain('trivia-content');
    expect(html).toContain('analysis-content');
    expect(html).toContain('community-content');
    expect(html).toContain('data-embedded="true"');
  });

  it('Premium rozeti yalnızca Trivia ve Analiz başlığında; Topluluk\'ta yok', () => {
    const dots = (tab: string) => (tab.match(/Premium/g) ?? []).length;
    const [tri, ana, com] = html
      .split('role="tab"')
      .slice(1)
      .map((chunk) => chunk.split('</button>')[0]);
    expect(tri).toContain('Premium');
    expect(ana).toContain('Premium');
    expect(dots(com)).toBe(0);
  });

  it('erişilebilirlik: tablist + aria-controls/labelledby eşleşir, aktif olmayan sekme tabIndex=-1', () => {
    expect(html).toContain('role="tablist"');
    expect(tabs[1]).toContain('tabindex="-1"');
    const controls = /aria-controls="([^"]+)"/.exec(tabs[0])![1];
    expect(panels[0]).toContain(`id="${controls}"`);
  });
});

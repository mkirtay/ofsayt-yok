import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import MatchTabs, { type MatchTabItem } from './index';

type K = 'a' | 'b' | 'c';

const tabs: MatchTabItem<K>[] = [
  { key: 'a', label: 'Bir', render: () => <div data-testid="a-content" /> },
  { key: 'b', label: 'İki', premium: true, render: () => <div data-testid="b-content" /> },
  { key: 'c', label: 'Üç', render: () => <div data-testid="c-content" /> },
];

const render = (active: K) =>
  renderToStaticMarkup(<MatchTabs tabs={tabs} active={active} onChange={() => {}} ariaLabel="Bölümler" />);

describe('<MatchTabs />', () => {
  const html = render('a');
  const buttons = [...html.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
  const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);

  it('şerit DÜZ: verilen sıradaki her sekme tek seviyede, alt sekme yok', () => {
    expect(buttons).toHaveLength(3);
    expect(html.indexOf('>Bir')).toBeLessThan(html.indexOf('>İki'));
    expect(html.indexOf('>İki')).toBeLessThan(html.indexOf('>Üç'));
    expect((html.match(/role="tablist"/g) ?? []).length).toBe(1);
  });

  it('yalnızca açılmış sekme mount edilir (gereksiz AI/trivia isteği yok)', () => {
    expect(panels).toHaveLength(1);
    expect(html).toContain('a-content');
    expect(html).not.toContain('b-content');
    expect(html).not.toContain('c-content');
  });

  it('premium noktası yalnızca premium işaretli sekmede', () => {
    const chunks = html.split('role="tab"').slice(1).map((c) => c.split('</button>')[0]);
    expect(chunks[0]).not.toContain('premiumDot');
    expect(chunks[1]).toContain('premiumDot');
    expect(chunks[2]).not.toContain('premiumDot');
  });

  it('erişilebilirlik: aktif sekme seçili, diğerleri tabIndex=-1 ve aria-controls paneli gösterir', () => {
    expect(buttons[0]).toContain('aria-selected="true"');
    expect(buttons[1]).toContain('aria-selected="false"');
    expect(buttons[1]).toContain('tabindex="-1"');
    const controls = /aria-controls="([^"]+)"/.exec(buttons[0])![1];
    expect(panels[0]).toContain(`id="${controls}"`);
    expect(panels[0]).not.toContain('hidden');
  });

  it('başka sekme aktifken onun paneli görünür', () => {
    const other = render('c');
    expect(other).toContain('c-content');
    expect(other).not.toContain('a-content');
  });
});

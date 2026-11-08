import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoalToastCard } from './index';
import type { GoalToastItem } from '@/utils/goalToast';

const item: GoalToastItem = {
  key: '7:1-0',
  matchId: '7',
  side: 'home',
  home: { name: 'Beşiktaş', logo: 'https://cdn.example/bjk.png' },
  away: { name: 'Gençlerbirliği' },
  score: [1, 0],
  minute: "67'",
  href: '/mac/7/besiktas-genclerbirligi',
};

const render = (over: Partial<GoalToastItem> = {}, duration?: number) =>
  renderToStaticMarkup(
    <GoalToastCard
      item={{ ...item, ...over }}
      goalLabel="GOL!"
      closeLabel="Bildirimi kapat"
      scorerLabel="Beşiktaş gol attı"
      onDismiss={() => {}}
      duration={duration}
    />,
  );

describe('<GoalToastCard>', () => {
  it('maç sayfasına link, GOL! + dakika, skor ve kapat düğmesi', () => {
    const html = render();
    expect(html).toContain('href="/mac/7/besiktas-genclerbirligi"');
    expect(html).toContain('GOL!');
    expect(html).toContain('67&#x27;');
    expect(html).toContain('Beşiktaş gol attı');
    expect(html).toContain('aria-label="Bildirimi kapat"');
    expect(html).toMatch(/Beşiktaş[^]*1[^]*0[^]*Gençlerbirliği/);
  });

  it('golü atan takım ve skoru vurgulu (data-scorer), logo yoksa kırık görsel yok', () => {
    const home = render();
    expect(home.match(/data-scorer/g)).toHaveLength(2);
    expect(home).toMatch(/data-scorer="">\s*<span[^>]*>Beşiktaş/);
    expect(home.match(/<img/g)).toHaveLength(1);

    const away = render({ side: 'away', score: [1, 1], key: '7:1-1' });
    expect(away).toMatch(/data-scorer=""><span[^>]*>Gençlerbirliği/);
  });

  it('dakika yoksa rozet yok; süre 0 ise süre çizgisi yok', () => {
    const html = render({ minute: '' }, 0);
    expect(html).not.toContain('&#x27;');
    expect(html).not.toMatch(/animation-duration/);
    expect(render()).toContain('animation-duration:5000ms');
  });
});

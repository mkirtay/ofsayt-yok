import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import LiveStrip from './index';

const m = (id: number, over: Partial<Match> = {}) =>
  ({ id, status: 'NOT STARTED', time: '', date: '2026-10-06', scheduled: '17:00', home: { id: id * 2, name: `Ev${id}` }, away: { id: id * 2 + 1, name: `Dep${id}` }, ...over }) as Match;

describe('<LiveStrip />', () => {
  it('canlı kart: dakika + skor; İY\'de nokta yok; logolar iki yanda; maç sayfasına bağlantı', () => {
    const html = renderToStaticMarkup(
      <LiveStrip matches={[m(1, { status: 'IN PLAY', time: "63'", scores: { score: '2 - 1' } } as Partial<Match>), m(2, { status: 'HALF TIME BREAK', scores: { score: '0 - 0' } } as Partial<Match>)]} />,
    );
    expect(html).toContain('63&#x27;');
    expect(html).toContain('2–1');
    expect(html.match(/class="[^"]*dot[^"]*"/g)).toHaveLength(1); // yalnız oynanan maçta yanıp sönen nokta
    expect(html).toContain('İY');
    expect(html).toMatch(/href="\/matches\/1-/);
    expect(html).toContain('aria-label="Canlı ve yaklaşan maçlar"');
  });

  it('yaklaşan kart: saat (İstanbul) + logolar, skor yok; yarın "Yarın"; büyük maçta ince işaret', () => {
    const html = renderToStaticMarkup(
      <LiveStrip matches={[m(3), m(4, { date: '2026-10-07' })]} todayIso="2026-10-06" bigIds={new Set(['3'])} />,
    );
    expect(html).toContain('20:00'); // 17:00 UTC → 20:00 TR
    expect(html).not.toContain('–');
    expect(html.match(/Yarın/g)).toHaveLength(1); // yalnız yarının kartında
    expect(html.match(/★/g)).toHaveLength(1);
    expect(html).toContain('Büyük maç');
  });

  it('stil: reduced-motion\'da animasyon yok; ok düğmeleri yalnız masaüstünde; skor vurgusu animasyonlu', () => {
    const scss = readFileSync(join(process.cwd(), 'src/components/LiveStrip/liveStrip.module.scss'), 'utf8');
    expect(scss).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*\.dot,\s*\.cardFlash\s*{\s*animation: none;/);
    expect(scss).toMatch(/@media \(min-width: \$bp-desktop\)\s*{\s*\.arrow\s*{\s*display: inline-flex;/);
    expect(scss).toMatch(/\.cardFlash\s*{\s*animation: liveStripFlash/);
  });
});

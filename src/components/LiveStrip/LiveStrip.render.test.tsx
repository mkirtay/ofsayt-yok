import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import LiveStrip from './index';

const m = (id: number, over: Record<string, unknown> = {}) =>
  ({
    id,
    status: 'FINISHED',
    time: '',
    date: '2026-10-06',
    scheduled: '17:00',
    home: { id: id * 2, name: `Ev${id}` },
    away: { id: id * 2 + 1, name: `Dep${id}` },
    competition: { id: 600, name: 'Super Lig' },
    scores: { score: '2 - 1' },
    ...over,
  }) as unknown as Match;

describe('<LiveStrip />', () => {
  it('canlı kart: nabız noktası + dakika; İY\'de nokta yok; iki takım satırı, skor, lig adı, maç sayfası bağlantısı', () => {
    const html = renderToStaticMarkup(<LiveStrip matches={[m(1, { status: 'IN PLAY', time: "63'" }), m(2, { status: 'HALF TIME BREAK', scores: { score: '0 - 0' } })]} />);
    expect(html).toContain('63&#x27;');
    expect(html.match(/_dot_/g)).toHaveLength(1); // yalnız oynanan maçta nabız noktası (İY'de yok)
    expect(html).toContain('İY');
    expect(html).toContain('>Ev1<');
    expect(html).toContain('>Dep1<');
    expect(html).toMatch(/title="S[uü]per Lig"/);
    expect(html).toMatch(/href="\/matches\/1-/);
    expect(html).toContain('aria-label="Canlı ve bugün biten maçlar"');
  });

  it('bitmiş kart: MS rozeti, nabız yok; uzatma / penaltıda UZS / PEN', () => {
    const html = renderToStaticMarkup(<LiveStrip matches={[m(3), m(4, { finish: 'AET' }), m(5, { finish: 'PEN' })]} />);
    expect(html.match(/>MS</g)).toHaveLength(1);
    expect(html).toContain('>UZS<');
    expect(html).toContain('>PEN<');
    expect(html).not.toMatch(/_dot_/);
  });

  it('stil: reduced-motion\'da animasyon yok; ok düğmeleri yalnız masaüstünde; kaydırma yatay, sayfa taşırmaz', () => {
    const scss = readFileSync(join(process.cwd(), 'src/components/LiveStrip/liveStrip.module.scss'), 'utf8');
    expect(scss).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*\.dot,\s*\.cardFlash\s*{\s*animation: none;/);
    expect(scss).toMatch(/@media \(min-width: \$bp-desktop\)\s*{\s*\.arrow\s*{\s*display: inline-flex;/);
    expect(scss).toMatch(/\.scroller \{[^}]*overflow-x: auto;/);
    expect(scss).toMatch(/\.strip \{[^}]*min-width: 0;[^}]*max-width: 100%;/);
  });
});

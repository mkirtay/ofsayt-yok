import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import LiveTicker, { LIVE_TICKER_ROTATE_MS, tickerCurrent, tickerNextId, tickerStopped } from './index';

const m = (id: number, over: Record<string, unknown> = {}) =>
  ({
    id,
    status: 'IN PLAY',
    time: "63'",
    date: '2026-10-06',
    scheduled: '17:00',
    home: { id: id * 2, name: `Ev${id}`, logo: `https://cdn.sportmonks.com/images/soccer/teams/1/${id * 2}.png` },
    away: { id: id * 2 + 1, name: `Dep${id}`, logo: `https://cdn.sportmonks.com/images/soccer/teams/1/${id * 2 + 1}.png` },
    competition: { id: 600, name: 'Super Lig' },
    scores: { score: '2 - 1' },
    ...over,
  }) as unknown as Match;

describe('<LiveTicker /> (sunucu çizimi)', () => {
  it('ilk maç: canlı nokta + dakika, iki takım (ad + logo), skor; maç sayfası bağlantısı; sıradaki maç peek; sayaç ve duraklat', () => {
    const html = renderToStaticMarkup(<LiveTicker matches={[m(1), m(2, { status: 'HALF TIME BREAK', scores: { score: '0 - 0' } })]} />);
    expect(html).toContain('aria-label="Canlı maçlar"');
    expect(html).toContain('63&#x27;');
    expect(html).toContain('>Ev1<');
    expect(html).toContain('>Dep1<');
    expect(html).toContain('2–1');
    expect(html).toMatch(/href="\/matches\/1-/);
    expect(html.match(/_dot_/g)).toHaveLength(1); // yalnız oynanan maçta (peek'teki İY maçında yok)
    expect(html.match(/<img/g)).toHaveLength(4); // gösterilen + peek, iki takım logosu
    expect(html).toContain('aria-label="Sıradaki maça geç: Ev2 – Dep2"');
    expect(html.indexOf('Ev2')).toBeGreaterThan(html.indexOf('/matches/1-')); // peek gösterilenin ardında
    expect(html).toContain('>1/2<');
    expect(html).toContain('aria-label="Canlı maç geçişini duraklat"');
  });

  it('tek maçta peek, sayaç ve düğme yok; devre arasında "İY", nokta yok', () => {
    const html = renderToStaticMarkup(<LiveTicker matches={[m(1, { status: 'HALF TIME BREAK' })]} />);
    expect(html).toContain('İY');
    expect(html).not.toMatch(/_dot_/);
    expect(html).not.toMatch(/_peek_/);
    expect(html).not.toContain('/1<');
    expect(html).not.toContain('<button');
  });

  it('maç yoksa hiçbir şey çizilmez', () => {
    expect(renderToStaticMarkup(<LiveTicker matches={[]} />)).toBe('');
  });

  it('stil: yükseklik ebeveynden (masaüstü 44 / mobil 40); peek yalnız geniş kutuda; reduced-motion\'da nabız ve geçiş yok', () => {
    const scss = readFileSync(join(process.cwd(), 'src/components/LiveTicker/liveTicker.module.scss'), 'utf8');
    const page = readFileSync(join(process.cwd(), 'src/pages/index.module.scss'), 'utf8');
    expect(scss).toMatch(/\.ticker \{[^}]*height: 100%;/);
    expect(page).toMatch(/@media \(min-width: \$bp-desktop\) \{\s*--league-bar-h: 44px;/);
    expect(page).toMatch(/\.leagueBarTicker \{[^}]*@include below-desktop \{[^}]*height: 40px;/);
    expect(scss).toMatch(/\.peek \{[^}]*display: none;/);
    expect(scss).toMatch(/@container \(min-width: 640px\) \{\s*\.viewport \{\s*flex: 0 1 420px;\s*\}\s*\.peek \{\s*display: block;/);
    expect(scss).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*\.dot,\s*\.itemIn\s*{\s*animation: none;\s*}\s*\.itemOut\s*{\s*display: none;/);
    expect(scss).toMatch(/\.itemIn \{[^}]*animation: liveTickerIn 0\.3s/);
  });
});

describe('LiveTicker dönüş mantığı', () => {
  const list = [m(1), m(2), m(3)];

  it('sıradaki maç: bir sonraki, sondan başa; bilinmeyen id (maç bitti) → ilk maçtan sonraki', () => {
    expect(tickerNextId(list, '1')).toBe('2');
    expect(tickerNextId(list, '3')).toBe('1');
    expect(tickerNextId(list, '99')).toBe('1');
    expect(tickerNextId([], '1')).toBeNull();
  });

  it('gösterilen maç id ile izlenir: liste sırası değişse de aynı maç, ardından yeni sıradaki gelir', () => {
    const reordered = [m(3), m(2), m(1)];
    expect(String(tickerCurrent(reordered, '2')?.id)).toBe('2');
    expect(tickerNextId(reordered, '2')).toBe('1');
    expect(String(tickerCurrent(reordered, '99')?.id)).toBe('3');
    expect(tickerCurrent([], null)).toBeUndefined();
  });

  it('kendiliğinden dönüş: varsayılan açık; hareket azaltılmışsa kapalı; düğme seçimi önceliklidir', () => {
    expect(tickerStopped('auto', false)).toBe(false);
    expect(tickerStopped('auto', true)).toBe(true);
    expect(tickerStopped('paused', false)).toBe(true);
    expect(tickerStopped('playing', true)).toBe(false);
  });

  it('süre: 4 sn', () => {
    expect(LIVE_TICKER_ROTATE_MS).toBe(4000);
  });
});

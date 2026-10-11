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
    home: { id: id * 2, name: `Ev${id}` },
    away: { id: id * 2 + 1, name: `Dep${id}` },
    competition: { id: 600, name: 'Super Lig' },
    scores: { score: '2 - 1' },
    ...over,
  }) as unknown as Match;

describe('<LiveTicker /> (sunucu çizimi)', () => {
  it('ilk maç: dakika, iki takım, skor; maç sayfası bağlantısı; sayaç ve duraklat düğmesi', () => {
    const html = renderToStaticMarkup(<LiveTicker matches={[m(1), m(2, { status: 'HALF TIME BREAK', scores: { score: '0 - 0' } })]} />);
    expect(html).toContain('aria-label="Canlı maçlar"');
    expect(html).toContain('63&#x27;');
    expect(html).toContain('>Ev1<');
    expect(html).toContain('>Dep1<');
    expect(html).toContain('2–1');
    expect(html).toMatch(/href="\/matches\/1-/);
    expect(html).not.toContain('Ev2'); // yalnız gösterilen maç DOM'da
    expect(html).toContain('>1/2<');
    expect(html).toContain('aria-label="Canlı maç geçişini duraklat"');
  });

  it('tek maçta sayaç ve düğme yok; devre arasında "İY"', () => {
    const html = renderToStaticMarkup(<LiveTicker matches={[m(1, { status: 'HALF TIME BREAK' })]} />);
    expect(html).toContain('>İY<');
    expect(html).not.toContain('/1<');
    expect(html).not.toContain('<button');
  });

  it('maç yoksa hiçbir şey çizilmez', () => {
    expect(renderToStaticMarkup(<LiveTicker matches={[]} />)).toBe('');
  });

  it('stil: sabit yükseklik; reduced-motion\'da nabız ve geçiş yok, çıkan satır gizli', () => {
    const scss = readFileSync(join(process.cwd(), 'src/components/LiveTicker/liveTicker.module.scss'), 'utf8');
    expect(scss).toMatch(/\.ticker \{[^}]*height: 34px;/);
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

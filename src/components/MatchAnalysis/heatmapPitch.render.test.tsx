import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HeatmapPitch from './HeatmapPitch';

const LUNA = {
  home: [8, 10, 8, 7, 8, 12, 16, 14, 11, 13, 14, 18, 16, 13, 15],
  away: [7, 9, 10, 11, 13, 10, 14, 17, 16, 18, 12, 16, 19, 18, 17],
};

const blobs = (html: string) =>
  [...html.replace(/^[\s\S]*?<g filter="url\(#heatBlur\)">([\s\S]*?)<\/g>[\s\S]*$/, '$1').matchAll(/<circle [^>]*>/g)].map(
    ([c]) => ({ r: Number(/ r="([\d.]+)"/.exec(c)![1]), fill: /fill="([^"]+)"/.exec(c)![1]! })
  );
const alpha = (fill: string) => Number(/, ([\d.]+)\)$/.exec(fill)![1]);

describe('HeatmapPitch', () => {
  it('Luna grid\'i (7–19): en yoğun hücre koyu kırmızı ve en son çizilir; en zayıflar çizilmez', () => {
    const list = blobs(renderToStaticMarkup(<HeatmapPitch homeGrid={LUNA.home} awayGrid={LUNA.away} homeName="Liverpool" awayName="Manchester City" />));
    expect(list.length).toBeLessThan(30); // 7'ler (ölçeğin 0'ı) çizilmez
    const last = list[list.length - 1]!;
    expect(last.fill).toBe('rgba(128, 0, 38, 0.82)');
    expect(last.r).toBe(66);
    // Soğuktan sıcağa sıralı.
    const rs = list.map((b) => b.r);
    expect(rs).toEqual([...rs].sort((a, b) => a - b));
    expect(alpha(list[0]!.fill)).toBeLessThan(alpha(last.fill));
  });

  it('düz grid: tek orta ton, kırmızı yok', () => {
    const html = renderToStaticMarkup(<HeatmapPitch homeGrid={Array(15).fill(12)} awayGrid={Array(15).fill(10)} homeName="A" awayName="B" />);
    const fills = new Set(blobs(html).map((b) => b.fill));
    expect(fills).toEqual(new Set(['rgba(253, 141, 60, 0.62)']));
  });

  it('grid bozuksa blob yok, saha ve gösterge yine çizilir', () => {
    const html = renderToStaticMarkup(<HeatmapPitch homeGrid={undefined as unknown as number[]} awayGrid={[]} homeName="A" awayName="B" />);
    expect(blobs(html)).toEqual([]);
    expect(html).toContain('role="img"');
  });
});

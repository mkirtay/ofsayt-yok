import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BRAND_MARK_BADGE, BRAND_MARK_BAR, BRAND_MARK_COLORS, BRAND_MARK_DIGIT, BRAND_MARK_VIEWBOX, BRAND_MARK_WORD } from './brandMark';

const svg = (name: string) => readFileSync(path.join(process.cwd(), 'public/brand', name), 'utf8');
/** brandMark.ts ile aynı yuvarlama: 2 ondalık, sondaki sıfırlar atılır. */
const round = (d: string) =>
  d.replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')).replace(/-0 /g, '0 ');
const paths = (s: string) => [...s.matchAll(/<path d="([^"]+)"[^>]*fill="(#[0-9A-Fa-f]{6})"/g)].map((m) => ({ d: m[1]!, fill: m[2]! }));
const rects = (s: string) => [...s.matchAll(/<rect ([^/]+)\/>/g)].map((m) => m[1]!);

describe('satır içi marka işareti kaynak SVG ile aynı', () => {
  for (const [file, variant] of [
    ['scor3-02-skorbord-koyu-zemin.svg', 'dark'],
    ['scor3-02-skorbord-acik-zemin.svg', 'light'],
  ] as const) {
    it(`${variant}: yollar, rozet ve renkler`, () => {
      const s = svg(file);
      const [word, digit] = paths(s);
      expect(round(word!.d)).toBe(BRAND_MARK_WORD);
      expect(round(digit!.d)).toBe(BRAND_MARK_DIGIT);
      const [badge, bar] = rects(s);
      expect(badge).toContain(`x="${BRAND_MARK_BADGE.x}"`);
      expect(badge).toContain(`width="${BRAND_MARK_BADGE.width}"`);
      expect(bar).toContain(`y="${BRAND_MARK_BAR.y}"`);
      const c = BRAND_MARK_COLORS[variant];
      expect([word!.fill, digit!.fill]).toEqual([c.word, c.digit]);
      expect(badge).toContain(`fill="${c.badge}"`);
      expect(bar).toContain(`fill="${c.bar}"`);
      expect(Number(/viewBox="[^ ]+ [^ ]+ ([^ ]+)/.exec(s)![1])).toBeCloseTo(Number(BRAND_MARK_VIEWBOX.split(' ')[2]), 2);
    });
  }
});

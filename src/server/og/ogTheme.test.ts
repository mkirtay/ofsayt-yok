import { describe, expect, it } from 'vitest';
import { OG_ACCENT, OG_BG, OG_TEXT, OG_TEXT_SOFT } from './ogTheme';

/** WCAG 2 bağıl parlaklık ve kontrast oranı. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('paylaşım görseli teması', () => {
  it('zemin Scor3 siyahı, vurgu lime', () => {
    expect([OG_BG, OG_ACCENT]).toEqual(['#0A0E13', '#C6FF3A']);
  });

  it('skor / takım adı ve ikincil metin yüksek kontrastlı (AAA ≥ 7:1)', () => {
    expect(contrast(OG_TEXT, OG_BG)).toBeGreaterThanOrEqual(17);
    expect(contrast(OG_TEXT_SOFT, OG_BG)).toBeGreaterThanOrEqual(9);
    // Galibiyet rozeti: lime zemin üstünde siyah harf.
    expect(contrast(OG_BG, OG_ACCENT)).toBeGreaterThanOrEqual(7);
  });
});

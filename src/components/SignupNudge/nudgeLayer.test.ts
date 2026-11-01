import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Üye ol kartı katmanı', () => {
  const scss = readFileSync(path.resolve(__dirname, 'signupNudge.module.scss'), 'utf8');
  const header = readFileSync(path.resolve(__dirname, '../Header/header.module.scss'), 'utf8');
  const z = (src: string, sel: string) => {
    const block = src.slice(src.indexOf(`${sel} {`), src.indexOf(`${sel} {`) + 400);
    return Number(/z-index: (\d+);/.exec(block)?.[1]);
  };

  it('Header (açık mobil menü dahil) kartın üstünde; kart Kural Köşesi düğmesinin (92) üstünde', () => {
    const nudge = z(scss, '.nudge');
    expect(nudge).toBeLessThan(z(header, '.header'));
    expect(nudge).toBeGreaterThan(92);
  });
});

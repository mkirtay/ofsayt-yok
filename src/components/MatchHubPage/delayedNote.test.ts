import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('"Veriler gecikmeli" notu akış dışında (sonradan çıkınca listeyi / kenar çubuğunu itmez)', () => {
  const scss = readFileSync(path.resolve(__dirname, '../../pages/index.module.scss'), 'utf8');
  const block = scss.slice(scss.indexOf('.delayedNote {'), scss.indexOf('.delayedNote {') + 900);

  it('sabit konumlu balon: yer kaplamaz, dış boşluğu yok', () => {
    expect(block).toMatch(/position: fixed;/);
    expect(block).not.toMatch(/margin-bottom/);
  });

  it('mobilde alt menünün üstünde; katmanı alt menünün (110) altında', () => {
    expect(block).toMatch(/@include below-desktop \{\s*bottom: calc\(var\(--bottom-nav-height\)/);
    const z = Number(/z-index: (\d+);/.exec(block)?.[1]);
    expect(z).toBeGreaterThan(92);
    expect(z).toBeLessThan(110);
  });
});

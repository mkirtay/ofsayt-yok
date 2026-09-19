import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BP_DESKTOP, BP_SPLIT, BP_WIDGET, layoutTierForWidth, MOBILE_LAYOUT_QUERY } from './breakpoints';

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

describe('layoutTierForWidth — sınır değerleri', () => {
  it('1023 mobil / 1024 masaüstü', () => {
    expect(layoutTierForWidth(1023)).toBe('mobile');
    expect(layoutTierForWidth(1024)).toBe('desktop');
  });
  it('1199 masaüstü / 1200 split-view', () => {
    expect(layoutTierForWidth(1199)).toBe('desktop');
    expect(layoutTierForWidth(1200)).toBe('split');
  });
  it('widget eşiğinin bir altı split / eşik wide', () => {
    expect(layoutTierForWidth(BP_WIDGET - 1)).toBe('split');
    expect(layoutTierForWidth(BP_WIDGET)).toBe('wide');
  });
  it('tablet genişlikleri (768/820/834/912/1000) mobil düzende', () => {
    for (const w of [375, 768, 820, 834, 912, 1000]) expect(layoutTierForWidth(w)).toBe('mobile');
  });
  it('mobil media query eşikten 1px aşağıda biter', () => {
    expect(MOBILE_LAYOUT_QUERY).toBe(`(max-width: ${BP_DESKTOP - 1}px)`);
  });
});

describe('SCSS ↔ TS senkronu', () => {
  const vars = read('src/styles/_variables.scss');
  const px = (name: string) => Number(new RegExp(`\\$${name}:\\s*(\\d+)px`).exec(vars)?.[1]);
  it('$bp-desktop / $bp-split / $bp-widget TS sabitleriyle aynı', () => {
    expect(px('bp-desktop')).toBe(BP_DESKTOP);
    expect(px('bp-split')).toBe(BP_SPLIT);
    expect(px('bp-widget')).toBe(BP_WIDGET);
  });
  it('mobil/masaüstü geçişini yöneten dosyalar ortak eşiği kullanır (768 sabiti yok)', () => {
    for (const f of [
      'src/components/Header/header.module.scss',
      'src/components/SubHeader/subHeader.module.scss',
      'src/components/BottomNav/bottomNav.module.scss',
      'src/styles/_tokens.scss',
      'src/pages/index.module.scss',
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/\$bp-md|768|767/);
    }
    expect(read('src/components/Header/header.module.scss')).toContain('below-desktop');
    expect(read('src/components/BottomNav/bottomNav.module.scss')).toContain('below-desktop');
    expect(read('src/pages/index.module.scss')).toContain('$bp-desktop');
  });
  it('.layout-split eski 768/767px eşiğinde DEĞİL, merkezi eşiği kullanır (Faz 8)', () => {
    const g = read('src/styles/globals.scss');
    const start = g.indexOf('.layout-split {');
    const block = g.slice(start, g.indexOf('// ──', start));
    expect(block).toContain('below-desktop');
    expect(block).toContain('$bp-split');
    expect(block).not.toMatch(/768|767|1199/);
  });
});

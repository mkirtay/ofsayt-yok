import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** WCAG 2.x kontrast oranı (#rrggbb). */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const src = readFileSync(path.resolve(__dirname, '_tokens.scss'), 'utf8');

/** Bir tema bloğundaki (`:root[data-theme='light']` ya da koyu/varsayılan) düz hex token'ları. */
function tokens(blockStart: string): Record<string, string> {
  const start = src.indexOf(blockStart);
  const body = src.slice(start, src.indexOf('\n}', start));
  const base = src.slice(src.indexOf(':root {'), src.indexOf('\n}', src.indexOf(':root {')));
  const out: Record<string, string> = {};
  for (const m of `${base}\n${body}`.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const THEMES = {
  dark: tokens(":root[data-theme='dark'] {"),
  light: tokens(":root[data-theme='light'] {"),
};

describe.each(Object.entries(THEMES))('%s tema kontrastı (WCAG 2.2 AA)', (_name, t) => {
  const surfaces = ['--bg-surface', '--bg-page', '--bg-muted'] as const;

  it.each(['--text-primary', '--text-secondary', '--text-tertiary', '--color-action-text', '--color-warning-text'])(
    '%s normal metin ≥ 4.5:1 (yüzey/sayfa/muted)',
    (fg) => {
      for (const bg of surfaces) expect(contrast(t[fg], t[bg]), `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('dolu favori yıldızı (ikon) ≥ 3:1', () => {
    for (const bg of surfaces) expect(contrast(t['--color-favorite'], t[bg])).toBeGreaterThanOrEqual(3);
  });

  it('beyaz yazılı dolu canlı rozeti ≥ 4.5:1', () => {
    expect(contrast('#ffffff', t['--color-live-fill'])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('yeşil dolgu üstünde beyaz yazı', () => {
  const vars = readFileSync(path.resolve(__dirname, '_variables.scss'), 'utf8');
  const hex = (name: string) => vars.match(new RegExp(`\\$${name}:\\s*(#[0-9a-fA-F]{6})`))![1];

  it('aktif sekme degradesinin iki ucu ve aktif gün zemini ≥ 4.5:1', () => {
    expect(contrast('#ffffff', hex('color-action-fill-start'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', hex('color-primary-dark'))).toBeGreaterThanOrEqual(4.5);
  });

  it('SubHeader aktif sekme/gün düşük kontrastlı #00A76F zemine dönmedi', () => {
    const sub = readFileSync(path.resolve(__dirname, '../components/SubHeader/subHeader.module.scss'), 'utf8');
    expect(sub).not.toContain('linear-gradient(135deg, $color-primary, $color-primary-dark)');
    expect(sub).toMatch(/\.stripItemActive \{\s*background: \$color-primary-dark;/);
  });
});
